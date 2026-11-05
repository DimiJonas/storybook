# Storybook – server

Express backend: login, storybooks, memories and photos. Talks to PostgreSQL and stores photos on
disk. In production it only listens on `127.0.0.1:3001`; nginx sits in front of it (HTTPS, serves
the app and the photos, passes `/api` on).

Requires Node.js 22.12 or newer (`node -v`; the server uses 24) and PostgreSQL 16.

## Commands

| Command                                  | What it does                                                        |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `npm ci`                                 | Install the libraries exactly as in `package-lock.json`              |
| `npm run dev`                            | Start on http://localhost:3001, restarts when a file changes        |
| `npm start`                              | Start without watching (pm2 runs `src/index.js` on the server)      |
| `npm run migrate`                        | Apply new database migrations (`-- --list`: only show them)         |
| `npm run db:schema`                      | Update `../schema.sql` (on the laptop only, then commit it)         |
| `npm run storybook:create -- "Name"`     | Create a new, empty storybook                                       |
| `npm run user:password -- <name>`        | Create a login or set a new password (`--lock`, `-- --list`); ends that user's running logins |
| `npm run sessions`                       | The running logins (who, device, since, last used); `-- --end <name>` / `-- --end-all` ends them |
| `node scripts/create-thumbnails.js`      | Create missing small photo versions (e.g. after a restore)          |
| `node scripts/make-app-icons.js`         | Create the app icons from `client/app-icon.png`                     |
| `npm run photos:move-to-storybook`       | One-time move of photos into `book_1/` (from step 4, done)          |
| `npm run photos:sizes`                   | Fill in width/height of photos that don't have them (once after step 9) |
| `npm run photos:places -- --dry-run`     | Photo towns: which town each not yet looked-at photo is in (changes nothing); without `--dry-run`: town as place, GPS removed from the file, memories get their photos' towns (once after step 11) |

For development, the client runs separately (`cd ../client && npm run dev`, port 3000).

## Settings: `.env`

`server/.env` holds the settings and secrets. It's never in git, patches or chat; only appuser
may read it (`chmod 600`). Keys (values differ per computer):

| Key           | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`    | `production` on the server (photo folder `/etc/storybook/uploads`, app address from `/etc/storybook/site.conf`); anything else (e.g. `development`) on the laptop |
| `PORT`        | `3001`                                                                        |
| `DB_USER`     | `webapp` (never the `postgres` superuser)                                     |
| `DB_HOST`     | `localhost`                                                                   |
| `DB_NAME`     | `storybook` (default)                                                         |
| `DB_PASSWORD` | password of `webapp`                                                          |
| `JWT_SECRET`  | random secret, at least 32 characters (the server refuses to start without); since step 14 only for login tokens from before the switch to cookies |
| `NOMINATIM_URL` | optional: another place search service than `https://nominatim.openstreetmap.org` (the tests use a fake one) |
| `SESSION_CACHE_MS` | optional: how long checked logins are remembered (ms, default 30000; the tests use less) |
| `NOTIFY_CONF` | optional: another file with the ntfy topic than `/etc/storybook/notify.conf` (the tests use one) |
| `APP_URL` | optional: the app's address, e.g. `https://storybook.example.com` (origin check, CORS, the place search's User-Agent). Without it: on the server `https://<DOMAIN>` from `/etc/storybook/site.conf` (written by `ops/root/install.sh`, run by dk-srv's `dk-app-update` – the server refuses to start without either), on the laptop `http://localhost:3000` |
| `SITE_CONF` | optional: another file than `/etc/storybook/site.conf` (tests) |

`.env` is read with an explicit path, so scripts work from any folder.

## Where things are

- `src/index.js` – the Express app: settings, login, all `/api` routes, error handling
- `src/storybooks.js` – storybooks = Postgres schemas `book_<n>`: listing them, their photo
  folders, and `withStorybook()` (runs a request's queries in one transaction inside the
  storybook's schema)
- `src/phases.js` – checks a Kapitel before saving
- `src/moods.js` – the six mood groups' keys and the "exactly one emoji" check for adding an emoji
  to a group
- `src/memories.js` – checks a memory before saving (title, text, date / date range, mood)
- `src/settings.js` – the personal settings that exist, their defaults and checks (also name and
  perspective colour, which everyone sees: `publicProfile`)
- `src/places.js` – places: the shared list, a memory's places, and a photo's town (its GPS
  position → town → the position is removed from the file, with exiftool)
- `src/geocoder.js` – OpenStreetMap's place search (Nominatim): 1 request per second for the whole
  server, an identifying User-Agent, answers kept in memory for a day
- `src/history.js` – a memory's history: what changed (`diffMemories`), combining saves within
  15 minutes (`mergeChanges`), writing it (`recordChange`)
- `src/images.js` – photo folders, the small versions (`thumb/` 800 px, `medium/` 1600 px WebP,
  made with sharp), a photo's size (`photoSize`, upright like the small versions) and the check
  that an upload really is a photo
- `src/loginLimiter.js` – waiting times after failed logins (per IP and per account)
- `src/sessions.js` – logins (step 14): the cookie (name, flags), starting/checking/renewing/ending
  a login in the table `sessions` (only a hash of the cookie's key is stored), checked logins
  remembered in memory for 30 s (`SESSION_CACHE_MS`, for tests); `scripts/sessions.js` lists and
  ends them
- `src/notify.js` – push notifications to your phone (ntfy, step 13): an account reaching 20 failed
  logins in a row; the topic comes from `/etc/storybook/notify.conf` (see `ops/README.md`), without
  it (e.g. on the laptop) only a log line
- `src/migrations.js` – applies the SQL migrations (used by `scripts/migrate.js` and
  `scripts/create-storybook.js`)
- `src/db.js` – database connection settings; dates come out as plain `"2025-10-22"` text
- `scripts/` – the command-line tools from the table above
- `migrations/` – shared database changes (users, ...), run once per database
- `migrations/book/` – per-storybook changes, run in every `book_<n>` (see below)
- `uploads/` – photos when running on the laptop (not in git)

## API

Everything except the login needs the **login cookie** (step 14, `src/sessions.js`):
`__Host-sb_session` in production, `sb_session` on the laptop; the browser sends it by itself.
Without it (or with an ended/expired one): 401. Requests that change something (POST/PUT/DELETE)
with an `Origin` header other than the app's address get 403. Answers are JSON; errors look like
`{ "error": "..." }` (German texts where the app shows them to the user).
Login tokens from before step 14 (`Authorization: Bearer …`, at most 24 h old) are still accepted
for the API until they run out – no new ones are made.

| Request                                   | What it does                                                 |
| ----------------------------------------- | ------------------------------------------------------------ |
| `POST /api/login`                         | `{ username, password, remember }` → sets the login cookie, answers `{ user: { id, name } }`. `remember: true` ("Angemeldet bleiben"): 30 days, renewed while used (at most hourly); otherwise a cookie that ends with the browser, at most 24 h. 429 + `Retry-After` while waiting after failed attempts |
| `POST /api/logout`                        | ends this login (also on the server) and removes the cookie; 204 |
| `GET /api/session`                        | who is logged in: `{ user: { id, name } }`, or 401 (the app asks this at start – it can't read the cookie) |
| `POST /api/session/from-token`            | the switch to cookies: an old token (`Authorization: Bearer …`) → a remembered login cookie; 401 if the token isn't valid |
| `GET /api/auth/photo`                     | asked by nginx before every photo (`auth_request`, photo address in `X-Original-URI`): 204 may see it, 401 not logged in, 403 not their storybook (everyone sees every storybook for now: `maySeeStorybook` in `src/index.js`), 404 not a photo address |
| `GET /api/settings`                       | your personal settings, with defaults: `{ showTagsOnCards, displayName, perspectiveColor }` |
| `PUT /api/settings`                       | change some: `{ showTagsOnCards: true }` → all settings; 400 for unknown settings or wrong values |
| `GET /api/users`                          | everyone's name and perspective colour: `[{ id, name, color, me }]` |
| `GET /api/books`                          | all storybooks: `[{ id, name, memories }]`                   |
| `GET /api/books/:bookId`                  | `{ id, name }` of one storybook                              |
| `PUT /api/books/:bookId`                  | rename: `{ name }`                                           |
| `GET /api/books/:bookId/memories`         | all memories with their photos, newest first                 |
| `POST /api/books/:bookId/memories`        | new memory: `{ title, content, date, end_date, mood, tag_ids, perspectives }` |
| `GET /api/books/:bookId/memories/:id/history` | its history, newest first: `[{ id, user_id, created_at, updated_at, changes }]` (see `src/history.js`) |
| `PUT /api/books/:bookId/memories/:id`     | change a memory (same fields)                                |
| `POST /api/books/:bookId/upload`          | photos (multipart: `images` – up to 10, 50 MB each – and `memoryId`); new ones go after the existing ones. The app sends one photo per request. |
| `PUT /api/books/:bookId/memories/:id/images/order` | new photo order `{ ids: [12, 7, 9] }`. Unknown IDs are ignored, photos missing from the list stay at the end (both of you can edit at the same time). Answers `{ images }` in the new order |
| `PUT /api/books/:bookId/memories/:id/cover` | cover photo `{ imageId: 12 }` (or `null`), independent of the order. An ID that isn't a photo of this memory is ignored. Answers `{ cover_image_id }` |
| `PUT /api/books/:bookId/memories/:id/highlight` | 👑 highlight `{ highlight: true \| false }` (either of you); not recorded in the history, doesn't change `updated_at`. Answers `{ highlight }` |
| `DELETE /api/books/:bookId/images/:id`    | remove one photo                                             |
| `GET /api/books/:bookId/phases`           | all Kapitel, oldest first: `[{ id, title, emoji, start_date, ... }]` |
| `POST /api/books/:bookId/phases`          | new Kapitel `{ title, emoji, start_date }`; 409 if another Kapitel starts that day |
| `PUT /api/books/:bookId/phases/:id`       | change a Kapitel (same fields)                                |
| `DELETE /api/books/:bookId/phases/:id`    | delete a Kapitel – its memories aren't touched              |
| `GET /api/books/:bookId/tags`             | all tags by name: `[{ id, name, memories }]` (`memories` = how many have it) |
| `POST /api/books/:bookId/tags`            | new tag `{ name }` (≤ 50 characters); 409 if the name exists (upper/lower case doesn't count) |
| `PUT /api/books/:bookId/tags/:id`         | rename a tag                                                  |
| `DELETE /api/books/:bookId/tags/:id`      | delete a tag – it's removed from its memories, they stay     |
| `GET /api/books/:bookId/moods`            | which emoji is in which mood group: `[{ id, emoji, group, position }]` (groups: `gluecklich`, `verliebt`, `entspannt`, `abenteuer`, `nachdenklich`, `schwierig`) |
| `POST /api/books/:bookId/moods`           | add `{ emoji, group }` at the end of the group; 409 if it's already in that group, or in another one (`{ error, group }`) – with `move: true` it's moved |
| `DELETE /api/books/:bookId/moods/:id`     | remove an emoji from its group (memories with it keep it – "Anderes") |
| `GET /api/books/:bookId/places`           | all places by name: `[{ id, name, latitude, longitude, memories, photos }]` |
| `POST /api/books/:bookId/places`          | `{ name, latitude, longitude, osm_key? }` → the place (the existing one if it's the same OpenStreetMap object, or the same name within ~1 km) |
| `PUT /api/books/:bookId/places/:id`       | rename `{ name }` (≤ 100 characters) and/or move `{ latitude, longitude }` (numbers) – its memories and photos follow, nothing goes into their history |
| `POST /api/books/:bookId/places/:id/merge` | `{ into: <id> }` – its memories and photos move there, it's deleted |
| `DELETE /api/books/:bookId/places/:id`    | delete a place – removed from its memories and photos (they stay) |
| `GET /api/books/:bookId/places/search?q=` | find places by name (OpenStreetMap): `[{ name, label, latitude, longitude, osm_key, place_id }]`; 502 when it can't be reached, 429 when many are waiting |
| `GET /api/books/:bookId/places/name?lat=&lon=` | `{ name }` suggestion for a spot tapped on the map |
| `/api/books/:bookId/important-dates`      | GET/POST/PUT/DELETE – exists, but not used (feature frozen)  |
| `GET /api/test-auth`                      | checks the login                                             |

- **Memories can't be deleted through the API** – on purpose; only by hand in the database
  (`project_maintenance_commands.txt`).
- until step 7 memories were called "chapters" in the code (the old `/chapters` addresses were
  removed in step 8)
- unknown storybook → 404; IDs are per storybook (memory 5 in book 1 ≠ memory 5 in book 2)
- **Kapitel** (`phases`): a Kapitel lasts from its `start_date` until the next one starts; which
  memories belong to it is worked out in the app (`client/src/phases.js`), nothing is stored per memory
- every memory comes with `tag_ids` (its tags); saving without `tag_ids` keeps the saved tags
- **mood groups** (`mood_emojis`, per storybook, migration `book/012`): the six groups are fixed
  (names, patterns and lightness are in the app, `client/src/moods.js`), their emojis can be added
  and removed (⋮ → "Stimmungen bearbeiten"). An emoji is in at most one group. A memory stores only
  the emoji, so the groups never change a memory; not recorded in the history
- **perspectives**: every memory comes with `perspectives: [{ author_id, text, updated_at }]` (one per
  person). Only the author can write, change or remove one: saving sends your own if it changed,
  `perspectives: [{ author_id: <you>, text }]` (`text: ''` removes it); someone else's → 400
  "Du kannst nur deine eigene Perspektive ändern." (not 403, which the app takes as "logged out")
- **history** (`memory_history`): every change is recorded by the server itself (create, edit,
  photos added/removed) – saves by the same person within 15 minutes become one entry. Only for
  reading. `user_id` = author, `last_edit` = `{ user_id, at }` of the last change
- search and filters happen in the app (`client/src/search.js`), not on the server
- **settings** are per user (`users.settings`, JSON with only the changed ones); a new setting
  only needs an entry in `src/settings.js` (and `client/src/settings.js`), no migration
- dates are `"YYYY-MM-DD"` text; `end_date` is empty for a single day and always after `date`
- a memory's `images` come in their order (`display_order`); its **cover photo** is
  `cover_image_id` (empty = none chosen → the app uses the first photo; deleting the photo empties it)
- `highlight` (true/false) marks a memory as one of the highlights of its year (👑, "Unser Jahr");
  only the `/highlight` route changes it – saving the form keeps it. The yearly review itself is
  worked out in the app (`client/src/yearReview.js`)
- photos are served by nginx at `/uploads/book_<n>/<file>` – only to logged-in visitors (nginx asks
  `/api/auth/photo` first; on the laptop the backend checks it itself) (`thumb/<file>.webp`,
  `medium/<file>.webp`); the database stores the file name and the photo's `width`/`height` (as
  shown, i.e. upright; empty if unknown – the app then shows a square). Every photo in `images`
  comes with `width` and `height` (for the rows of the Fotos view)
- request bodies (JSON) are limited to 1 MB; photos go through the upload
- **places**: every memory comes with `place_ids` (in order), every photo with `place_id` (its
  town). Saving a memory with `place_ids` sets them (unknown IDs ignored); without, they stay.
  Uploading a photo: its GPS position becomes its town (Nominatim), then the position is removed
  from the file (exiftool – `sudo apt install libimage-exiftool-perl`); a memory without places
  chosen by hand (`memory_places.from_photos`) gets the towns of its photos. If the place search
  can't be reached, the photo keeps its position until `npm run photos:places` runs. No exact
  photo position is ever saved
- **map pictures** don't go through Node: nginx fetches them from OpenStreetMap and keeps them
  (`/tiles/` in `ops/root/nginx/storybook.conf`); in development there's a small `/tiles/` route instead

## Changing the database

Never change a migration that was already applied somewhere – add a new numbered file:
- something in a storybook (memories, photos, ...) → `migrations/book/NNN_name.sql`, written
  without schema names (`ALTER TABLE memories ...`); it's applied to every `book_<n>`, and new
  storybooks get it automatically
- something shared (users, ...) → `migrations/NNN_name.sql`

Then `npm run migrate && npm run db:schema` on the laptop, commit the migration together with
`../schema.sql`; on the server `npm run migrate` during the deploy.

## Rules to keep

- every database query of a storybook runs through `inBook(req, ...)` / `withStorybook()`, never
  with schema names from the request; storybook IDs are checked to be plain numbers first
- all SQL with `$1, $2, ...` parameters – never put values into the SQL text
- dates stay text (`"2025-10-22"`), never `new Date(...)` on the server
- uploads: only photo types (name *and* content are checked), random file names
- users are never deleted (the database refuses it while they have memories) – lock them instead
- error answers don't contain details (stack traces stay in the log: `pm2 logs backend`)
