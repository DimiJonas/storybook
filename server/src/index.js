const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const crypto = require('crypto');
const { createLoginLimiter, ACCOUNT_LOCK_AFTER } = require('./loginLimiter');
const { notify } = require('./notify');
const { createSessions, keyFrom, setCookie, clearCookie } = require('./sessions');
const { uploadDir, ensureDirs, createVariants, deleteVariants, looksLikePhoto, photoSize } = require('./images');
const { dbConfig } = require('./db');
const { schemaFor, photoDirFor, listSchemas, listStorybooks, withStorybook } = require('./storybooks');
const { validateMemory } = require('./memories');
const { validatePhase } = require('./phases');
const { validateMoodEmoji } = require('./moods');
const { diffMemories, recordChange } = require('./history');
const {
  placeName, isLatitude, isLongitude, findOrCreatePlace, setMemoryPlaces, addPhotoPlaces, locatePhoto, ExiftoolMissing,
} = require('./places');
const geocoder = require('./geocoder');
const { withDefaults, publicProfile, validateSettings } = require('./settings');
const site = require('./site');

// Refuse to start without a proper secret for signing login tokens
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error(
    'JWT_SECRET in server/.env is missing or too short (needs at least 32 characters).\n' +
      'Create one with:  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
  );
  process.exit(1);
}

const app = express();
// Don't announce "X-Powered-By: Express" in every answer (tells attackers what to try)
app.disable('x-powered-by');
const port = process.env.PORT || 3001;
// Only reachable from this computer (nginx); in production the outside world talks to nginx
const host = process.env.HOST || '127.0.0.1';

// nginx sits in front of the server and passes the visitor's IP address in X-Forwarded-For.
// Trust that header only when the request comes from nginx on this computer.
app.set('trust proxy', 'loopback');

// Database connection
const pool = new Pool(dbConfig());

const clientBuildPath = process.env.NODE_ENV === 'production' ? '/etc/storybook/clientbuild' : path.join(__dirname, '../../client/build');

// The app's own address (src/site.js: on the server from /etc/storybook/site.conf; in development
// the Vite dev server, which passes /api and /uploads on to this server – so app and API share one
// address there too)
const APP_ORIGIN = site.appUrl();
if (!APP_ORIGIN) {
  console.error(process.env.APP_URL
    ? "APP_URL in server/.env isn't a usable address (like https://storybook.example.com)."
    : `The storybook's address is missing: no DOMAIN=… in ${site.confPath()} and no APP_URL in server/.env.\n` +
      'On the server it is written by:  sudo dk-app-update storybook (ops/root/install.sh)');
  process.exit(1);
}

// cors Middleware
app.use(cors({
  origin: APP_ORIGIN,
  credentials: true,
  exposedHeaders: ['Cross-Origin-Resource-Policy', 'Retry-After']
}));

// Requests that change something must come from the app's own pages: browsers send an Origin
// header with them, and another website's would be different. (The login cookie is SameSite=Strict
// already, so other websites can't use it – this is a second barrier.)
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== APP_ORIGIN) {
    console.log(`Refused ${req.method} ${req.originalUrl} from origin ${origin}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// Reads JSON request bodies (memories, login, ...). 1 MB is far more than any memory text needs;
// a bigger limit would let anyone (even without login – this runs before the login check) make
// the server read huge bodies into memory. Photos don't go through this (see upload below).
app.use(express.json({ limit: '1mb' }));

// Map pictures in development (on the laptop there's no nginx; in production nginx fetches and
// keeps them, see /tiles/ in ops/root/nginx/storybook.conf – this route doesn't exist there)
if (process.env.NODE_ENV !== 'production') {
  app.get('/tiles/:z/:x/:y.png', async (req, res) => {
    const { z, x, y } = req.params;
    if (![z, x, y].every((n) => /^[0-9]{1,7}$/.test(n))) return res.status(404).end();
    try {
      const tile = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
        headers: { 'User-Agent': 'Storybook/1.0 (private family app, development)' },
        signal: AbortSignal.timeout(8000),
      });
      res.status(tile.status).type('png').set('Cache-Control', 'public, max-age=604800')
        .set('Cross-Origin-Resource-Policy', 'cross-origin').send(Buffer.from(await tile.arrayBuffer()));
    } catch {
      res.status(502).end();
    }
  });
}

// Logins (cookie + table sessions, see src/sessions.js)
const sessions = createSessions(pool);

// Photos. In production nginx serves /uploads directly from disk (after asking
// /api/auth/photo); this is used in development.
// Only for logged-in visitors, like nginx does it (auth_request, see /api/auth/photo).
app.use('/uploads', async (req, res, next) => {
  const status = await photoAccess(req, req.originalUrl);
  if (status !== 204) return res.status(status).end();
  // the photo is kept only on the device itself, for 30 days (never in caches in between)
  res.setHeader('Cache-Control', 'private, max-age=2592000, immutable');
  next();
}, express.static(uploadDir, {
  // express.static sets the Content-Type (jpeg, png, webp...) itself; Cache-Control is set above
  cacheControl: false,
}));

// Login check for the API: the login cookie (step 14). Sets req.user = { id }.
// Until step 14 the app kept a token (JWT, valid 24 h) in the browser's storage and sent it as
// "Authorization: Bearer …"; such tokens are still accepted until they run out, so app versions
// that were open during the update keep working (no new ones are made – the next app start swaps
// them for a cookie, see POST /api/session/from-token). Only tokens signed the way this server
// signed them (HS256 with JWT_SECRET) count.
const JWT_ALGORITHM = 'HS256';
const legacyUser = (req) => {
  const [type, token] = (req.headers.authorization || '').split(' ');
  if (type !== 'Bearer' || !token) return null;
  try {
    const { id } = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    return Number.isInteger(id) ? { id } : null;
  } catch {
    return null;
  }
};

const authenticateToken = async (req, res, next) => {
  const key = keyFrom(req);
  const session = await sessions.find(key);
  if (session) {
    req.user = { id: session.userId };
    await sessions.touch(key, session, res);
    return next();
  }
  const legacy = legacyUser(req);
  if (legacy) {
    req.user = legacy;
    return next();
  }
  return res.status(401).json({ error: 'Not logged in' });
};

// Which storybooks a user may see – everyone sees every storybook for now. The place to change
// when access per storybook comes (photos follow automatically, see /api/auth/photo).
const maySeeStorybook = (_userId, _bookId) => true;

// May the visitor see this photo address (/uploads/book_1/…)? 204 yes, 401 not logged in,
// 403 not their storybook, 404 not a photo address
const photoAccess = async (req, uri) => {
  const m = /^\/uploads\/book_([1-9][0-9]{0,8})\//.exec(uri || '');
  if (!m) return 404;
  const session = await sessions.find(keyFrom(req));
  if (!session) return 401;
  return maySeeStorybook(session.userId, Number(m[1])) ? 204 : 403;
};

// Only photos may be uploaded. (Anything else, e.g. an .html file, would be served by nginx
// from our own website address – that must not be possible.)
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.avif'];

const upload = multer({
  storage: multer.diskStorage({
    // into the storybook's own photo folder (created on first use)
    destination: (req, file, cb) => {
      ensureDirs(req.book.dir);
      cb(null, req.book.dir);
    },
    // Upload time + random part, e.g. "1792700000000-9f3a1c2b4d5e6f70.jpg": the name
    // can't be guessed (since step 14 photos are only served to logged-in visitors anyway).
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isPhoto = file.mimetype.startsWith('image/') && PHOTO_EXTENSIONS.includes(ext);
    if (!isPhoto) (req.rejectedFiles ||= []).push(file.originalname);
    cb(null, isPhoto);
  },
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

const loginLimiter = createLoginLimiter();
// Compared against when a username doesn't exist, so that the answer takes as long as for
// an existing user (otherwise the response time would reveal which usernames exist)
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

const tooManyAttempts = (res, seconds) => {
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ error: 'Too many failed login attempts', retryAfter: seconds });
};

// Auth Routes
// POST /api/login { username, password, remember } – starts a login: sets the cookie and answers
// { user: { id, name } } (no token: the browser keeps the cookie, scripts never see it)
app.post('/api/login', async (req, res) => {
  const { username, password, remember } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Still waiting after earlier failed attempts? Then don't even check the password.
  const wait = loginLimiter.secondsToWait(req.ip, username);
  if (wait > 0) {
    console.log(`Login blocked for ${req.ip} / "${username}" (${wait} s left)`);
    return tooManyAttempts(res, wait);
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    const validPassword = await bcrypt.compare(password, rows[0]?.password_hash ?? DUMMY_HASH);

    if (rows.length === 0 || !validPassword) {
      const waitNow = loginLimiter.recordFailure(req.ip, username);
      console.log(`Failed login for "${username}" from ${req.ip}${waitNow ? ` – next attempt in ${waitNow} s` : ''}`);
      // A real account reached the limit: someone may be guessing its password. Tell the phone
      // (once per series of failures; with the display name – the login name stays off ntfy.sh)
      if (rows.length > 0 && loginLimiter.accountFailures(username) === ACCOUNT_LOCK_AFTER) {
        const name = publicProfile(rows[0]).name;
        notify(
          `Login of ${name} locked`,
          `${ACCOUNT_LOCK_AFTER} failed logins in a row for ${name}'s account (last from ${req.ip}). Someone may be guessing the password. Further attempts now wait 30 s, doubling up to 1 h, so guessing is very slow. If it wasn't one of you and it keeps happening, set a new password (npm run user:password).`,
          { priority: 'high', tags: ['lock'] }
        );
      }
      if (waitNow > 0) return tooManyAttempts(res, waitNow);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    loginLimiter.recordSuccess(req.ip, username);
    const key = await sessions.start(rows[0].id, remember === true, req.get('user-agent'));
    setCookie(res, key, remember === true);
    res.json({ user: { id: rows[0].id, name: publicProfile(rows[0]).name } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/logout – ends this login (also on the server: the cookie's key stops working) and
// removes the cookie. Answers 204 also when there was no login.
app.post('/api/logout', async (req, res) => {
  await sessions.end(keyFrom(req));
  clearCookie(res);
  res.status(204).end();
});

// GET /api/session – who is logged in: { user: { id, name } }, or 401. The app asks this when it
// starts (it can't look at the cookie itself).
app.get('/api/session', authenticateToken, async (req, res) => {
  const { rows: [user] } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: { id: user.id, name: publicProfile(user).name } });
});

// POST /api/session/from-token – the switch to cookies (step 14): an app that still has an old
// token in the browser's storage sends it once ("Authorization: Bearer …") and gets a login
// cookie for it ("Angemeldet bleiben", like the phones were used until now), so nobody has to log
// in again. The app deletes the old token afterwards. 401 if the token isn't valid (any more).
app.post('/api/session/from-token', async (req, res) => {
  const legacy = legacyUser(req);
  if (!legacy) return res.status(401).json({ error: 'Not logged in' });
  const { rows: [user] } = await pool.query('SELECT * FROM users WHERE id = $1', [legacy.id]);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  const key = await sessions.start(user.id, true, req.get('user-agent'));
  setCookie(res, key, true);
  res.json({ user: { id: user.id, name: publicProfile(user).name } });
});

// GET /api/auth/photo – asked by nginx before it serves a photo (auth_request, see
// ops/root/nginx/storybook.conf): nginx passes the photo's address in X-Original-URI and the visitor's
// cookie. 204 = may see it, 401 = not logged in, 403 = not their storybook, 404 = no photo address.
app.get('/api/auth/photo', async (req, res) => {
  res.status(await photoAccess(req, req.get('x-original-uri'))).end();
});

// Test auth endpoint
app.get('/api/test-auth', authenticateToken, (req, res) => {
  res.json({ message: 'Authentication working', user: req.user });
});

// ---------------------------------------------------------------------------------------------
// Personal settings of the logged-in user (the same on all their devices, see src/settings.js)
//   GET /api/settings     all settings: { showTagsOnCards: false, displayName: 'Anna', ... }
//   PUT /api/settings     change some: { showTagsOnCards: true } -> all settings
//   GET /api/users        everyone's name and perspective colour: [{ id, name, color, me }]
// ---------------------------------------------------------------------------------------------

app.get('/api/settings', authenticateToken, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, settings FROM users WHERE id = $1', [req.user.id]);
  if (rows.length === 0) return res.status(403).json({ error: 'Invalid token' }); // user no longer exists
  res.json(withDefaults(rows[0]));
});

app.put('/api/settings', authenticateToken, async (req, res) => {
  const { error, changes } = validateSettings(req.body);
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    'UPDATE users SET settings = settings || $2::jsonb WHERE id = $1 RETURNING id, username, settings',
    [req.user.id, JSON.stringify(changes)],
  );
  if (rows.length === 0) return res.status(403).json({ error: 'Invalid token' });
  res.json(withDefaults(rows[0]));
});

app.get('/api/users', authenticateToken, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, settings FROM users ORDER BY id');
  res.json(rows.map((user) => ({ ...publicProfile(user), me: user.id === req.user.id })));
});

// ---------------------------------------------------------------------------------------------
// Storybooks. Every logged-in user may see every storybook.
//   GET  /api/books                  all storybooks: [{ id, name, memories }]
//   everything else is below /api/books/<id>/... and only ever uses that storybook's tables
// ---------------------------------------------------------------------------------------------

app.get('/api/books', authenticateToken, async (req, res) => {
  res.json(await listStorybooks(pool));
});

// Checks that /api/books/<id>/... names an existing storybook and remembers it in req.book
const loadStorybook = async (req, res, next) => {
  const schema = schemaFor(req.params.bookId);
  if (!schema || !(await listSchemas(pool)).includes(schema)) {
    return res.status(404).json({ error: 'Storybook not found' });
  }
  req.book = { id: Number(req.params.bookId), schema, dir: photoDirFor(schema) };
  next();
};

const book = express.Router();
app.use('/api/books/:bookId', authenticateToken, loadStorybook, book);

// IDs in addresses (/memories/5, /images/12, ...) must be plain numbers; anything else can't exist
book.param('id', (req, res, next, id) =>
  /^[1-9][0-9]{0,8}$/.test(id) ? next() : res.status(404).json({ error: 'Not found' })
);

// Runs a function with the current storybook's tables (see withStorybook in storybooks.js)
const inBook = (req, fn) => withStorybook(pool, req.book.schema, fn);

// The storybook itself: name
book.get('/', async (req, res) => {
  const { rows } = await inBook(req, (db) => db.query('SELECT name FROM storybook_info'));
  res.json({ id: req.book.id, name: rows[0]?.name ?? `Storybook ${req.book.id}` });
});

// Rename
book.put('/', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 100) {
    return res.status(400).json({ error: 'Der Name muss 1 bis 100 Zeichen lang sein.' });
  }
  await inBook(req, (db) =>
    db.query(
      `INSERT INTO storybook_info (id, name) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [name]
    )
  );
  res.json({ id: req.book.id, name });
});

// important dates endpoints
book.get('/important-dates', async (req, res) => {
  const result = await inBook(req, (db) =>
    db.query('SELECT id, title, date, recurring FROM important_dates WHERE user_id = $1 ORDER BY date', [req.user.id])
  );
  res.json(result.rows);
});

book.post('/important-dates', async (req, res) => {
  const { title, date, recurring } = req.body ?? {};
  if (!title || !date) {
    return res.status(400).json({ error: 'Title and date are required.' });
  }
  const result = await inBook(req, (db) =>
    db.query(
      `INSERT INTO important_dates (user_id, title, date, recurring)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, date, recurring`,
      [req.user.id, title, date, recurring ?? false]
    )
  );
  res.status(201).json(result.rows[0]);
});

book.put('/important-dates/:id', async (req, res) => {
  const { title, date, recurring } = req.body ?? {};
  const result = await inBook(req, (db) =>
    db.query(
      `UPDATE important_dates
       SET title = $1, date = $2, recurring = $3
       WHERE id = $4 AND user_id = $5
       RETURNING id, title, date, recurring`,
      [title, date, recurring ?? false, req.params.id, req.user.id]
    )
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Date not found or unauthorized' });
  }
  res.json(result.rows[0]);
});

book.delete('/important-dates/:id', async (req, res) => {
  const result = await inBook(req, (db) =>
    db.query('DELETE FROM important_dates WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id])
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Date not found or unauthorized' });
  }
  res.json({ success: true });
});

// ---------------------------------------------------------------------------------------------
// Kapitel (life phases, "phases" in the code): each lasts from its start date until the next one
// starts. Which memories belong to which Kapitel is worked out in the app from the dates.
//   GET    /phases        all, oldest first
//   POST   /phases        new: { title, emoji, start_date }
//   PUT    /phases/:id    change (same fields)
//   DELETE /phases/:id    delete – its memories aren't touched (they then belong to the previous one)
// ---------------------------------------------------------------------------------------------

const PHASE_FIELDS = 'id, title, emoji, start_date, created_at, updated_at';

// Two Kapitel can't start on the same day: answer with the name of the one that's already there
const startDateTaken = async (req, res, startDate) => {
  const { rows } = await inBook(req, (db) =>
    db.query('SELECT title FROM phases WHERE start_date = $1', [startDate])
  );
  return res.status(409).json({
    error: `An diesem Tag beginnt schon das Kapitel „${rows[0]?.title ?? '?'}“. Bitte wähle einen anderen Tag.`,
  });
};
const isUniqueViolation = (err) => err.code === '23505';

book.get('/phases', async (req, res) => {
  const { rows } = await inBook(req, (db) => db.query(`SELECT ${PHASE_FIELDS} FROM phases ORDER BY start_date`));
  res.json(rows);
});

book.post('/phases', async (req, res) => {
  const { error, phase: p } = validatePhase(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const { rows } = await inBook(req, (db) =>
      db.query(
        `INSERT INTO phases (title, emoji, start_date, user_id)
         VALUES ($1, $2, $3, $4) RETURNING ${PHASE_FIELDS}`,
        [p.title, p.emoji, p.startDate, req.user.id]
      )
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) return startDateTaken(req, res, p.startDate);
    throw err;
  }
});

book.put('/phases/:id', async (req, res) => {
  const { error, phase: p } = validatePhase(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const { rows } = await inBook(req, (db) =>
      db.query(
        `UPDATE phases
         SET title = $1, emoji = $2, start_date = $3, updated_at = now()
         WHERE id = $4 RETURNING ${PHASE_FIELDS}`,
        [p.title, p.emoji, p.startDate, req.params.id]
      )
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Kapitel not found' });
    res.json(rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) return startDateTaken(req, res, p.startDate);
    throw err;
  }
});

book.delete('/phases/:id', async (req, res) => {
  const result = await inBook(req, (db) => db.query('DELETE FROM phases WHERE id = $1', [req.params.id]));
  if (result.rowCount === 0) return res.status(404).json({ error: 'Kapitel not found' });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------------------------
// Tags: a fixed list per storybook, used as filters. Each memory has any number of them
// (tag_ids with every memory).
//   GET    /tags          all, by name: [{ id, name, memories }]  (memories = how many have it)
//   POST   /tags          new: { name }
//   PUT    /tags/:id      rename: { name }
//   DELETE /tags/:id      delete – it's removed from its memories, the memories stay
// ---------------------------------------------------------------------------------------------

const MAX_TAG_LENGTH = 50;
const tagName = (body) => {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'Bitte gib dem Tag einen Namen.' };
  if ([...name].length > MAX_TAG_LENGTH) return { error: `Ein Tag darf höchstens ${MAX_TAG_LENGTH} Zeichen lang sein.` };
  return { name };
};
const TAGS_WITH_COUNTS = `
  SELECT t.id, t.name, (SELECT count(*)::int FROM memory_tags mt WHERE mt.tag_id = t.id) AS memories
  FROM tags t`;
const tagTaken = (res, name) =>
  res.status(409).json({ error: `Den Tag „${name}“ gibt es schon.` });

book.get('/tags', async (req, res) => {
  const { rows } = await inBook(req, (db) => db.query(`${TAGS_WITH_COUNTS} ORDER BY lower(t.name)`));
  res.json(rows);
});

book.post('/tags', async (req, res) => {
  const { error, name } = tagName(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const tag = await inBook(req, async (db) => {
      const { rows: [{ id }] } = await db.query(
        'INSERT INTO tags (name, user_id) VALUES ($1, $2) RETURNING id',
        [name, req.user.id]
      );
      return (await db.query(`${TAGS_WITH_COUNTS} WHERE t.id = $1`, [id])).rows[0];
    });
    res.status(201).json(tag);
  } catch (err) {
    if (isUniqueViolation(err)) return tagTaken(res, name);
    throw err;
  }
});

book.put('/tags/:id', async (req, res) => {
  const { error, name } = tagName(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const tag = await inBook(req, async (db) => {
      const result = await db.query('UPDATE tags SET name = $1 WHERE id = $2', [name, req.params.id]);
      if (result.rowCount === 0) return null;
      return (await db.query(`${TAGS_WITH_COUNTS} WHERE t.id = $1`, [req.params.id])).rows[0];
    });
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    res.json(tag);
  } catch (err) {
    if (isUniqueViolation(err)) return tagTaken(res, name);
    throw err;
  }
});

book.delete('/tags/:id', async (req, res) => {
  const result = await inBook(req, (db) => db.query('DELETE FROM tags WHERE id = $1', [req.params.id]));
  if (result.rowCount === 0) return res.status(404).json({ error: 'Tag not found' });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------------------------
// Mood groups: which emoji belongs to which of the six fixed groups (src/moods.js). Only adding
// and removing; memories store the emoji itself, so nothing here changes a memory.
//   GET    /moods        all: [{ id, emoji, group, position }], by group and position
//   POST   /moods        add { emoji, group } at the end of the group; 409 if it's already in
//                        that group, or in another one ({ group }) – { ..., move: true } moves it
//   DELETE /moods/:id    remove it from its group (memories with it keep it: "Anderes")
// ---------------------------------------------------------------------------------------------

const MOOD_FIELDS = 'id, emoji, mood_group AS "group", position';

book.get('/moods', async (req, res) => {
  const { rows } = await inBook(req, (db) =>
    db.query(`SELECT ${MOOD_FIELDS} FROM mood_emojis ORDER BY mood_group, position, id`));
  res.json(rows);
});

book.post('/moods', async (req, res) => {
  const { error, emoji, group, move } = validateMoodEmoji(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const result = await inBook(req, async (db) => {
      const { rows: [existing] } = await db.query(
        'SELECT id, mood_group AS "group" FROM mood_emojis WHERE emoji = $1 FOR UPDATE', [emoji]);
      if (existing && existing.group === group) return { status: 409, body: { error: `${emoji} ist schon in dieser Gruppe.`, group } };
      if (existing && !move) return { status: 409, body: { error: `${emoji} ist schon in einer anderen Gruppe.`, group: existing.group } };
      const next = `(SELECT COALESCE(max(position) + 1, 0) FROM mood_emojis WHERE mood_group = $1::varchar)`;
      const { rows: [row] } = existing
        ? await db.query(`UPDATE mood_emojis SET mood_group = $1::varchar, position = ${next} WHERE id = $2 RETURNING ${MOOD_FIELDS}`, [group, existing.id])
        : await db.query(
          `INSERT INTO mood_emojis (emoji, mood_group, position, user_id) VALUES ($2, $1::varchar, ${next}, $3) RETURNING ${MOOD_FIELDS}`,
          [group, emoji, req.user.id]);
      return { status: existing ? 200 : 201, body: row };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    // both of you added the same emoji at the same moment
    if (isUniqueViolation(err)) return res.status(409).json({ error: `${emoji} ist schon in einer Gruppe.` });
    throw err;
  }
});

book.delete('/moods/:id', async (req, res) => {
  const result = await inBook(req, (db) => db.query('DELETE FROM mood_emojis WHERE id = $1', [req.params.id]));
  if (result.rowCount === 0) return res.status(404).json({ error: 'Emoji not found' });
  res.json({ success: true });
});

// A memory with its photos (in their order), as the app expects it – and its tags, perspectives
// (in the order they were written) and who last changed it (`last_edit`: { user_id, at } of the
// newest history entry that isn't the creation; empty if never changed)
const MEMORIES_WITH_IMAGES = `
  SELECT
    m.*,
    COALESCE(
      json_agg(
        json_build_object(
          'id', i.id,
          'filename', i.filename,
          'display_order', i.display_order,
          'width', i.width,
          'height', i.height,
          'place_id', i.place_id
        )
        ORDER BY i.display_order, i.id
      ) FILTER (WHERE i.id IS NOT NULL),
      '[]'
    ) as images,
    (SELECT COALESCE(array_agg(mt.tag_id ORDER BY mt.tag_id), '{}') FROM memory_tags mt WHERE mt.memory_id = m.id) AS tag_ids,
    (SELECT COALESCE(array_agg(mp.place_id ORDER BY mp.position, mp.place_id), '{}') FROM memory_places mp WHERE mp.memory_id = m.id) AS place_ids,
    (SELECT COALESCE(json_agg(json_build_object(
        'author_id', p.author_id, 'text', p.text, 'updated_at', p.updated_at
      ) ORDER BY p.created_at, p.id), '[]')
     FROM perspectives p WHERE p.memory_id = m.id) AS perspectives,
    (SELECT json_build_object('user_id', h.user_id, 'at', h.updated_at)
     FROM memory_history h WHERE h.memory_id = m.id AND NOT h.changes ? 'created'
     ORDER BY h.id DESC LIMIT 1) AS last_edit
  FROM memories m
  LEFT JOIN images i ON m.id = i.memory_id`;


// All memories of the storybook, newest first: by their (first) day, and on the same day the
// most recently created one first. Multi-day memories have end_date; single days have it empty.
book.get('/memories', async (req, res) => {
  const { rows } = await inBook(req, (db) =>
    db.query(`${MEMORIES_WITH_IMAGES} GROUP BY m.id ORDER BY m.date DESC, m.id DESC`)
  );
  console.log(`Sending ${rows.length} memories of ${req.book.schema}`);
  res.json(rows);
});

// Gives a memory exactly these tags (IDs that aren't in the storybook's tag list are ignored –
// e.g. a tag the other person deleted at the same time)
const setTags = async (db, memoryId, tagIds) => {
  await db.query('DELETE FROM memory_tags WHERE memory_id = $1', [memoryId]);
  await db.query(
    `INSERT INTO memory_tags (memory_id, tag_id)
     SELECT $1, id FROM tags WHERE id = ANY($2::int[])`,
    [memoryId, tagIds]
  );
};

// Writes the perspectives that were changed: [{ authorId, text }] – '' removes one. Only called with
// the saving person's own perspective (see onlyOwnPerspectives).
const setPerspectives = async (db, memoryId, perspectives) => {
  for (const { authorId, text } of perspectives) {
    if (!text) {
      await db.query('DELETE FROM perspectives WHERE memory_id = $1 AND author_id = $2', [memoryId, authorId]);
      continue;
    }
    await db.query(
      `INSERT INTO perspectives (memory_id, author_id, text) VALUES ($1, $2, $3)
       ON CONFLICT (memory_id, author_id) DO UPDATE
         SET text = EXCLUDED.text, updated_at = now()
         WHERE perspectives.text IS DISTINCT FROM EXCLUDED.text`,
      [memoryId, authorId, text]
    );
  }
};

// A perspective can only be written, changed or removed by its author: true if the request only
// touches the saving person's own one (otherwise the route answers 400 – not 403, which the app
// takes as "login no longer valid")
const onlyOwnPerspectives = (req, perspectives) => perspectives.every((p) => p.authorId === req.user.id);
const NOT_YOUR_PERSPECTIVE = 'Du kannst nur deine eigene Perspektive ändern.';

const loadMemory = async (db, id) => (await db.query(`${MEMORIES_WITH_IMAGES} WHERE m.id = $1 GROUP BY m.id`, [id])).rows[0];

book.post('/memories', async (req, res) => {
  const { error, memory: m } = validateMemory(req.body);
  if (error) return res.status(400).json({ error });
  if (!onlyOwnPerspectives(req, m.perspectives)) return res.status(400).json({ error: NOT_YOUR_PERSPECTIVE });
  const created = await inBook(req, async (db) => {
    const { rows: [{ id }] } = await db.query(
      `INSERT INTO memories (title, content, date, end_date, user_id, mood)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [m.title, m.content, m.date, m.endDate, req.user.id, m.mood]
    );
    await setTags(db, id, m.tagIds);
    await setMemoryPlaces(db, id, m.placeIds);
    await setPerspectives(db, id, m.perspectives);
    await recordChange(db, id, req.user.id, { created: true });
    return loadMemory(db, id);
  });
  res.status(201).json(created); // the created memory with its ID
});

book.put('/memories/:id', async (req, res) => {
  const { id } = req.params;
  const { error, memory: m } = validateMemory(req.body);
  if (error) return res.status(400).json({ error });
  if (!onlyOwnPerspectives(req, m.perspectives)) return res.status(400).json({ error: NOT_YOUR_PERSPECTIVE });
  const updated = await inBook(req, async (db) => {
    // the memory as it was (locked until saved, so two saves at once are recorded one after the other)
    const locked = await db.query('SELECT 1 FROM memories WHERE id = $1 FOR UPDATE', [id]);
    if (locked.rowCount === 0) return null;
    const before = await loadMemory(db, id);
    // end_date: the new value – or, from an older app version that doesn't know date ranges
    // yet ($6 = true), the saved one, as long as it's still after the (maybe changed) first day
    const result = await db.query(
      `UPDATE memories
       SET title = $1, content = $2, date = $3, mood = $4,
           end_date = CASE WHEN $6 THEN (CASE WHEN end_date > $3::date THEN end_date END) ELSE $5::date END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [m.title, m.content, m.date, m.mood, m.endDate, m.keepEndDate, id]
    );
    if (result.rowCount === 0) return null;
    if (!m.keepTags) await setTags(db, id, m.tagIds);
    const places = m.keepPlaces ? { added: [], removed: [] } : await setMemoryPlaces(db, id, m.placeIds);
    await setPerspectives(db, id, m.perspectives);
    const changes = diffMemories(before, await loadMemory(db, id));
    if (places.added.length || places.removed.length) changes.places = places;
    await recordChange(db, id, req.user.id, changes);
    return loadMemory(db, id);
  });
  if (!updated) return res.status(404).json({ error: 'Memory not found' });
  res.json(updated);
});

// ---------------------------------------------------------------------------------------------
// Places: the storybook's shared list (see src/places.js)
//   GET    /places                  all, by name: [{ id, name, latitude, longitude, memories, photos }]
//   POST   /places                  { name, latitude, longitude, osm_key? } -> the place (an existing
//                                    one if it's the same OpenStreetMap object or name nearby)
//   PUT    /places/:id              rename: { name }
//   POST   /places/:id/merge        { into: <id> } – its memories and photos move to the other place
//   DELETE /places/:id              removed from its memories (they stay) and photos
//   GET    /places/search?q=...     find places by name (OpenStreetMap; 1 per second for everyone)
//   GET    /places/name?lat=&lon=   a name for a spot tapped on the map
// ---------------------------------------------------------------------------------------------

const PLACES_WITH_COUNTS = `
  SELECT p.id, p.name, p.latitude, p.longitude,
    (SELECT count(*)::int FROM memory_places mp WHERE mp.place_id = p.id) AS memories,
    (SELECT count(*)::int FROM images i WHERE i.place_id = p.id) AS photos
  FROM places p`;
const geocoderFailed = (res, err) => {
  if (!(err instanceof geocoder.GeocoderError)) throw err;
  console.log(`Place search: ${err.message}`);
  return res.status(err instanceof geocoder.GeocoderBusy ? 429 : 502).json({
    error: err instanceof geocoder.GeocoderBusy
      ? 'Gerade wird viel gesucht – bitte versuch es gleich nochmal.'
      : 'Die Ortssuche ist gerade nicht erreichbar.',
  });
};

book.get('/places', async (req, res) => {
  const { rows } = await inBook(req, (db) => db.query(`${PLACES_WITH_COUNTS} ORDER BY lower(p.name), p.id`));
  res.json(rows);
});

book.post('/places', async (req, res) => {
  const { name: rawName, latitude, longitude, osm_key: osmKey } = req.body ?? {};
  const name = placeName(rawName);
  if (!name) return res.status(400).json({ error: 'Bitte gib dem Ort einen Namen (höchstens 100 Zeichen).' });
  if (!isLatitude(latitude) || !isLongitude(longitude)) return res.status(400).json({ error: 'Die Lage des Orts ist ungültig.' });
  if (osmKey != null && !(typeof osmKey === 'string' && /^(node|way|relation)\/[0-9]{1,15}$/.test(osmKey))) {
    return res.status(400).json({ error: 'Der Ort ist ungültig.' });
  }
  const place = await inBook(req, async (db) => {
    const found = await findOrCreatePlace(db, { name, latitude, longitude, osm_key: osmKey }, req.user.id);
    return (await db.query(`${PLACES_WITH_COUNTS} WHERE p.id = $1`, [found.id])).rows[0];
  });
  res.status(201).json(place);
});

book.get('/places/search', async (req, res) => {
  const text = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (text.length < 2 || text.length > 200) return res.status(400).json({ error: 'Bitte gib mindestens 2 Zeichen ein.' });
  try {
    const results = await geocoder.search(text);
    // already in the list? then the app picks that one
    const keys = results.map((r) => r.osm_key).filter(Boolean);
    const { rows } = await inBook(req, (db) => db.query('SELECT id, osm_key FROM places WHERE osm_key = ANY($1)', [keys]));
    res.json(results.map((r) => ({ ...r, place_id: rows.find((p) => p.osm_key === r.osm_key)?.id ?? null })));
  } catch (err) {
    geocoderFailed(res, err);
  }
});

book.get('/places/name', async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (!isLatitude(latitude) || !isLongitude(longitude)) return res.status(400).json({ error: 'Die Lage ist ungültig.' });
  try {
    const found = await geocoder.reverse(latitude, longitude, 14);
    res.json({ name: found?.name ?? '' });
  } catch (err) {
    geocoderFailed(res, err);
  }
});

// Change a place: { name } renames it, { latitude, longitude } moves it (from the places page,
// "Auf der Karte verschieben"), or both. Its memories and photos follow; nothing is recorded in
// their history (they don't change).
book.put('/places/:id', async (req, res) => {
  const body = req.body ?? {};
  const renaming = body.name !== undefined;
  const moving = body.latitude !== undefined || body.longitude !== undefined;
  if (!renaming && !moving) return res.status(400).json({ error: 'Nichts zu ändern.' });
  const name = renaming ? placeName(body.name) : null;
  if (renaming && !name) return res.status(400).json({ error: 'Bitte gib dem Ort einen Namen (höchstens 100 Zeichen).' });
  if (moving && (!isLatitude(body.latitude) || !isLongitude(body.longitude))) {
    return res.status(400).json({ error: 'Ungültige Position.' });
  }
  const place = await inBook(req, async (db) => {
    const result = await db.query(
      `UPDATE places SET name = COALESCE($2, name), latitude = COALESCE($3, latitude), longitude = COALESCE($4, longitude)
       WHERE id = $1`,
      [req.params.id, name, moving ? body.latitude : null, moving ? body.longitude : null]
    );
    if (result.rowCount === 0) return null;
    return (await db.query(`${PLACES_WITH_COUNTS} WHERE p.id = $1`, [req.params.id])).rows[0];
  });
  if (!place) return res.status(404).json({ error: 'Place not found' });
  res.json(place);
});

book.post('/places/:id/merge', async (req, res) => {
  const into = req.body?.into;
  const from = Number(req.params.id);
  if (!Number.isInteger(into) || into < 1 || into === from) return res.status(400).json({ error: 'Bitte wähle einen anderen Ort.' });
  const place = await inBook(req, async (db) => {
    const { rows } = await db.query('SELECT id FROM places WHERE id = ANY($1::int[]) FOR UPDATE', [[from, into]]);
    if (rows.length !== 2) return null;
    // memories that have both keep one; the others get the place they're merged into
    await db.query(
      `INSERT INTO memory_places (memory_id, place_id, position, from_photos)
       SELECT memory_id, $2, position, from_photos FROM memory_places WHERE place_id = $1
       ON CONFLICT (memory_id, place_id) DO NOTHING`,
      [from, into]
    );
    await db.query('UPDATE images SET place_id = $2 WHERE place_id = $1', [from, into]);
    await db.query('DELETE FROM places WHERE id = $1', [from]);
    return (await db.query(`${PLACES_WITH_COUNTS} WHERE p.id = $1`, [into])).rows[0];
  });
  if (!place) return res.status(404).json({ error: 'Place not found' });
  res.json(place);
});

book.delete('/places/:id', async (req, res) => {
  const result = await inBook(req, (db) => db.query('DELETE FROM places WHERE id = $1', [req.params.id]));
  if (result.rowCount === 0) return res.status(404).json({ error: 'Place not found' });
  res.json({ success: true });
});

// History of a memory, newest first: [{ id, user_id, created_at, updated_at, changes }]
// (see src/history.js). Only for reading.
book.get('/memories/:id/history', async (req, res) => {
  const { id } = req.params;
  const rows = await inBook(req, async (db) => {
    const exists = await db.query('SELECT 1 FROM memories WHERE id = $1', [id]);
    if (exists.rowCount === 0) return null;
    return (await db.query(
      'SELECT id, user_id, created_at, updated_at, changes FROM memory_history WHERE memory_id = $1 ORDER BY id DESC',
      [id]
    )).rows;
  });
  if (!rows) return res.status(404).json({ error: 'Memory not found' });
  res.json(rows);
});

// New order of a memory's photos: { ids: [12, 7, 9] } (the cover photo is set separately, below).
// Forgiving when both of you edit at the same time: IDs that aren't (any longer) photos of this
// memory are ignored, and its photos missing from the list keep their order at the end.
// Answers with the photos in their new order.
book.put('/memories/:id/images/order', async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length > 1000 || !ids.every((x) => Number.isInteger(x) && x > 0)) {
    return res.status(400).json({ error: 'ids must be a list of photo IDs' });
  }
  const { id } = req.params;
  const images = await inBook(req, async (db) => {
    const exists = await db.query('SELECT 1 FROM memories WHERE id = $1', [id]);
    if (exists.rowCount === 0) return null;
    // FOR UPDATE: two saves at the same moment wait for each other instead of mixing the numbers
    const { rows } = await db.query(
      'SELECT id FROM images WHERE memory_id = $1 ORDER BY display_order, id FOR UPDATE',
      [id]
    );
    const current = rows.map((r) => r.id);
    const wanted = [...new Set(ids)].filter((x) => current.includes(x));
    const order = [...wanted, ...current.filter((x) => !wanted.includes(x))];
    // photo order[0] gets 0, order[1] gets 1, ...
    await db.query(
      `UPDATE images SET display_order = o.pos - 1
       FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos)
       WHERE images.id = o.id`,
      [order]
    );
    return (await db.query(
      'SELECT id, filename, display_order, width, height FROM images WHERE memory_id = $1 ORDER BY display_order, id',
      [id]
    )).rows;
  });
  if (!images) return res.status(404).json({ error: 'Memory not found' });
  res.json({ images });
});

// Cover photo ("Titelbild") of a memory: { imageId: 12 }, independent of the photo order;
// { imageId: null } = none chosen (then the first photo is used). An ID that isn't (any longer)
// a photo of this memory is ignored – e.g. when the other person deleted it at the same time.
// Answers { cover_image_id } as it is saved now.
book.put('/memories/:id/cover', async (req, res) => {
  const imageId = req.body?.imageId;
  if (imageId !== null && !(Number.isInteger(imageId) && imageId > 0)) {
    return res.status(400).json({ error: 'imageId must be a photo ID or null' });
  }
  const { id } = req.params;
  const result = await inBook(req, (db) =>
    db.query(
      `UPDATE memories
       SET cover_image_id = CASE
         WHEN $1::int IS NULL THEN NULL
         WHEN EXISTS (SELECT 1 FROM images WHERE id = $1 AND memory_id = memories.id) THEN $1
         ELSE cover_image_id
       END
       WHERE id = $2
       RETURNING cover_image_id`,
      [imageId, id]
    )
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Memory not found' });
  res.json(result.rows[0]);
});

// Highlight (👑) of a memory: { highlight: true | false }. Either of you can set it; like the cover
// photo it isn't recorded in the history and doesn't change updated_at. Answers { highlight }.
book.put('/memories/:id/highlight', async (req, res) => {
  const highlight = req.body?.highlight;
  if (typeof highlight !== 'boolean') return res.status(400).json({ error: 'highlight must be true or false' });
  const result = await inBook(req, (db) =>
    db.query('UPDATE memories SET highlight = $1 WHERE id = $2 RETURNING highlight', [highlight, req.params.id])
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Memory not found' });
  res.json(result.rows[0]);
});

book.delete('/images/:id', async (req, res) => {
  const { id } = req.params;
  // all database changes together (one transaction), the files only after that is saved
  const image = await inBook(req, async (db) => {
    const { rows } = await db.query('SELECT * FROM images WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    await db.query('DELETE FROM images WHERE id = $1', [id]);
    await recordChange(db, rows[0].memory_id, req.user.id, { photos: { added: 0, removed: 1 } });
    // Renumber the memory's remaining photos 0, 1, 2, ...
    await db.query(
      `UPDATE images
       SET display_order = subquery.new_order
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY display_order) - 1 as new_order
         FROM images
         WHERE memory_id = $1
       ) as subquery
       WHERE images.id = subquery.id`,
      [rows[0].memory_id]
    );
    return rows[0];
  });
  if (!image) return res.status(404).json({ error: 'Image not found' });

  fs.rmSync(path.join(req.book.dir, image.filename), { force: true });
  deleteVariants(req.book.dir, image.filename);
  res.json({ message: 'Image deleted successfully', imageId: id });
});

book.post('/upload', upload.array('images', 10), async (req, res) => {
  // The file name says "photo" – check that the content really is one, too
  // (e.g. not a renamed web page or program)
  if (req.files?.length) {
    const notPhotos = req.files.filter((f) => !looksLikePhoto(f.path));
    for (const f of notPhotos) {
      fs.rmSync(f.path, { force: true });
      (req.rejectedFiles ||= []).push(f.originalname);
    }
    req.files = req.files.filter((f) => !notPhotos.includes(f));
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: req.rejectedFiles
        ? 'Only photos (JPG, PNG, WebP, GIF, HEIC, AVIF) can be uploaded'
        : 'No files uploaded'
    });
  }
  const removeUploaded = () => req.files.forEach((f) => fs.rmSync(f.path, { force: true }));

  const memoryId = Number(req.body?.memoryId);
  if (!Number.isInteger(memoryId)) {
    removeUploaded();
    return res.status(400).json({ error: 'Memory ID is required' });
  }

  // Width and height of each photo (for the layout of the photo view)
  const sizes = [];
  for (const file of req.files) sizes.push(await photoSize(req.book.dir, file.filename));

  let rows;
  try {
    rows = await inBook(req, async (db) => {
      const exists = await db.query('SELECT 1 FROM memories WHERE id = $1', [memoryId]);
      if (exists.rowCount === 0) return null;
      // New photos go after the memory's existing ones, in the selected order
      const { rows: [{ next }] } = await db.query(
        'SELECT COALESCE(MAX(display_order) + 1, 0) AS next FROM images WHERE memory_id = $1',
        [memoryId]
      );
      const inserted = [];
      for (const [index, file] of req.files.entries()) {
        const { rows: [row] } = await db.query(
          `INSERT INTO images (memory_id, filename, display_order, width, height) VALUES ($1, $2, $3, $4, $5)
           RETURNING id, filename, display_order, width, height`,
          [memoryId, file.filename, next + index, sizes[index]?.width ?? null, sizes[index]?.height ?? null]
        );
        inserted.push(row);
      }
      await recordChange(db, memoryId, req.user.id, { photos: { added: inserted.length, removed: 0 } });
      return inserted;
    });
  } catch (err) {
    removeUploaded();
    throw err;
  }
  if (!rows) {
    removeUploaded();
    return res.status(404).json({ error: 'Memory not found' });
  }
  console.log(`Saved ${rows.length} photos for memory ${memoryId} in ${req.book.schema}`);

  // Create the small versions (one photo after another, to keep memory use low; they never
  // contain the photo's position)
  for (const file of req.files) {
    await createVariants(req.book.dir, file.filename);
  }
  // The town each photo was taken in; its GPS position is then removed from the file (see
  // places.js). A memory without places chosen by hand gets these towns as its places.
  await locateUploadedPhotos(req, memoryId, rows);
  res.json({ message: 'Upload successful', images: rows });
});

let warnedExiftool = false;
const locateUploadedPhotos = async (req, memoryId, images) => {
  try {
    await inBook(req, async (db) => {
      for (const image of images) {
        const result = await locatePhoto(db, req.book.dir, image, req.user.id);
        image.place_id = result.place?.id ?? null;
        if (result.status === 'pending') console.log(`Photo ${image.filename}: place search not reachable – sudo storybook-run photos:places tries again`);
        if (result.status === 'unreadable') console.log(`Photo ${image.filename}: exiftool can't read it (${result.error})`);
      }
      const added = await addPhotoPlaces(db, memoryId);
      if (added.length) await recordChange(db, memoryId, req.user.id, { places: { added, removed: [] } });
    });
  } catch (err) {
    if (!(err instanceof ExiftoolMissing)) throw err;
    if (!warnedExiftool) console.error('exiftool is not installed: photo positions are not read or removed (see ops/README.md)');
    warnedExiftool = true;
  }
};

// Errors in the routes above: log them and answer with a short message
app.use('/api', (err, req, res, next) => {
  if (res.headersSent) return next(err);
  // Photos too big / too many (from multer)
  if (err instanceof multer.MulterError) {
    console.log(`Upload refused in ${req.originalUrl}: ${err.code}`);
    const error = err.code === 'LIMIT_FILE_SIZE'
      ? 'Ein Foto ist zu groß (höchstens 50 MB).'
      : err.code === 'LIMIT_FILE_COUNT'
        ? 'Höchstens 10 Fotos auf einmal.'
        : 'Die Fotos konnten nicht hochgeladen werden.';
    return res.status(400).json({ error });
  }
  // Problems with the request itself (e.g. broken or too big JSON): 400/413, no stack trace needed
  if (err.status >= 400 && err.status < 500) {
    console.log(`Bad request ${req.method} ${req.originalUrl}: ${err.message}`);
    return res.status(err.status).json({ error: err.status === 413 ? 'Request too large' : 'Bad request' });
  }
  console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Server error' });
});

// Static middleware that needs to stay at the end of the file
// ... for serving React app files
app.use(express.static(clientBuildPath));

// ... catchall/fallback route
// (Express 5 syntax: '/{*splat}' matches every path; the old '*' no longer works)
app.get('/{*splat}', (req, res) => {
  // Only send the React app for non-API and non-upload routes
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});
// app.get('*', (req, res) => {
//   res.sendFile(clientBuildPath);
// });

// Start the server
app.listen(port, host, () => {
  console.log(`Server running on ${host}:${port}`);
});

