// Logins kept in a cookie (step 14). The cookie holds a random key; the database (table sessions)
// only knows its SHA-256 hash, the user and how long it's valid. The cookie is
//   HttpOnly        scripts in the page can't read it (even a code-injection bug can't steal it)
//   Secure          only sent over HTTPS (in production)
//   SameSite=Strict other websites can't make the browser use it
// and is named "__Host-sb_session" in production (the prefix makes the browser insist on Secure,
// Path=/ and no other domain) – "sb_session" on the laptop (http://localhost).
//
// "Angemeldet bleiben" (remember): 30 days, renewed while the app is used (at most once an hour);
// otherwise a cookie without expiry date (ends when the browser closes) and at most 24 hours.
// Checked logins are remembered in memory for CACHE_MS, so a grid of photos (each checked by
// nginx through /api/auth/photo) doesn't mean a database query per photo. A login ended by the
// `sessions` command (another process) therefore stops working within that time; logging out in
// the app ends it right away.
const crypto = require('crypto');

const PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE = PRODUCTION ? '__Host-sb_session' : 'sb_session';
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_MS = 24 * 60 * 60 * 1000;
const TOUCH_MS = 60 * 60 * 1000; // update last use (and renew a remembered login) at most hourly
const CACHE_MS = Number(process.env.SESSION_CACHE_MS ?? 30 * 1000);

const hash = (key) => crypto.createHash('sha256').update(key).digest('hex');

// The value of our cookie from the request's Cookie header (or null)
const keyFrom = (req) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) {
      const value = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
    }
  }
  return null;
};

const setCookie = (res, key, remember) => {
  res.cookie(COOKIE, key, {
    httpOnly: true,
    secure: PRODUCTION,
    sameSite: 'strict',
    path: '/',
    ...(remember ? { maxAge: REMEMBER_MS } : {}),
  });
};
const clearCookie = (res) => res.clearCookie(COOKIE, { httpOnly: true, secure: PRODUCTION, sameSite: 'strict', path: '/' });

// "Mozilla/5.0 (Linux; Android 14; …) … Chrome/…" -> "Android · Chrome"
const describeDevice = (ua = '') => {
  const system = /iPhone|iPad/.test(ua) ? (ua.includes('iPad') ? 'iPad' : 'iPhone')
    : /Android/.test(ua) ? 'Android'
      : /Windows/.test(ua) ? 'Windows'
        : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
          : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\//.test(ua) ? 'Firefox'
      : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
        : /Chrome\//.test(ua) ? 'Chrome'
          : /Safari\//.test(ua) ? 'Safari' : '';
  return [system, browser].filter(Boolean).join(' · ') || 'unbekanntes Gerät';
};

const createSessions = (pool) => {
  const cache = new Map(); // hash -> { session, at }

  // A new login: returns the cookie's key
  const start = async (userId, remember, userAgent) => {
    const key = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + (remember ? REMEMBER_MS : SHORT_MS));
    await pool.query(
      `INSERT INTO sessions (token_hash, user_id, remember, expires_at, device) VALUES ($1, $2, $3, $4, $5)`,
      [hash(key), userId, Boolean(remember), expires, describeDevice(userAgent).slice(0, 100)]
    );
    // tidy up now and then: logins that ended or expired more than 30 days ago
    pool.query(`DELETE FROM sessions WHERE expires_at < now() - interval '30 days' OR ended_at < now() - interval '30 days'`)
      .catch((err) => console.error('Cleaning up old logins failed:', err.message));
    return key;
  };

  // The valid login for a cookie key: { userId, remember, lastUsedAt, expiresAt } or null
  const find = async (key) => {
    if (!key) return null;
    const h = hash(key);
    const hit = cache.get(h);
    let session;
    if (hit && Date.now() - hit.at < CACHE_MS) {
      session = hit.session;
    } else {
      const { rows: [row] } = await pool.query(
        `SELECT user_id, remember, last_used_at, expires_at FROM sessions
         WHERE token_hash = $1 AND ended_at IS NULL AND expires_at > now()`,
        [h]
      );
      session = row ? { userId: row.user_id, remember: row.remember, lastUsedAt: row.last_used_at, expiresAt: row.expires_at } : null;
      if (cache.size > 1000) cache.clear();
      cache.set(h, { session, at: Date.now() });
    }
    if (session && session.expiresAt <= new Date()) return null;
    return session;
  };

  // After a request with this login: note the use, and renew a remembered login (new expiry and
  // a fresh cookie) – at most once an hour
  const touch = async (key, session, res) => {
    if (Date.now() - new Date(session.lastUsedAt).getTime() < TOUCH_MS) return;
    const now = new Date();
    session.lastUsedAt = now;
    if (session.remember) {
      session.expiresAt = new Date(now.getTime() + REMEMBER_MS);
      await pool.query('UPDATE sessions SET last_used_at = $2, expires_at = $3 WHERE token_hash = $1', [hash(key), now, session.expiresAt]);
      setCookie(res, key, true);
    } else {
      await pool.query('UPDATE sessions SET last_used_at = $2 WHERE token_hash = $1', [hash(key), now]);
    }
  };

  // Logging out: this login ends right away
  const end = async (key) => {
    if (!key) return;
    cache.delete(hash(key));
    await pool.query('UPDATE sessions SET ended_at = now() WHERE token_hash = $1 AND ended_at IS NULL', [hash(key)]);
  };

  return { start, find, touch, end, keyFrom };
};

module.exports = { createSessions, keyFrom, setCookie, clearCookie, describeDevice, COOKIE, REMEMBER_MS, SHORT_MS };
