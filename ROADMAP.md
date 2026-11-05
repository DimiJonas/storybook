# Storybook – Roadmap

| #   | Step                                                                          | Size | Depends on    |
| --- | ----------------------------------------------------------------------------- | ---- | ------------- |
| 0   | ✅ Groundwork: backups, database migrations, correct dates, photo-order fixes | S    | –             |
| 1   | ✅ Login protection & security round                                          | S    | –             |
| 2   | ✅ Mood picker                                                                | S    | 0             |
| 3   | ✅ Phone app (add to home screen)                                             | S    | –             |
| 4   | ✅ Multiple storybooks                                                        | M–L  | 0             |
| 5   | ✅ Date ranges (multi-day memories)                                           | M    | 0, 4          |
| 6   | ✅ Photo order & cover photo                                                  | M    | 0             |
| 7   | ✅ Kapitel (life phases) + year headings                                      | M    | 5             |
| 8   | ✅ Search & filters                                                           | S–M  | 7             |
| 9   | ✅ Photo album view                                                           | M    | 6             |
| 10  | ✅ Authors & perspectives                                                     | M–L  | 0, 4          |
| 11  | ✅ Map of our places                                                          | L    | 6             |
| 12  | ✅ Yearly review ("Unser Jahr")                                               | M    | 5, 6, 7, (11) |
| 13  | ✅ Security check, maintenance mode / lockdown, phone notifications           | M    | –             |
| 14  | ✅ Private photos (login cookie)                                              | M    | –             |
| –   | ✅ Public repository (server settings out of the code, README, screenshots)    | S    | –             |
| 15  | ✅ Hardening by the guides (CIS Ubuntu/NGINX/PostgreSQL, OWASP ASVS)          | M–L  | 13, 14        |
| 16  | ✅ Three repositories: the server's scripts to dk-srv, the home page to dk-home | M    | 15            |
| –   | Later: the backend as its own user (dk-srv's step 2)                          | M    | 16            |
| –   | Later: 2FA for the app login (codes from an authenticator app)                | M    | 14            |
| –   | Later: printable storybook, see "Future ideas"                                | L    | 12            |

---

## 0. Groundwork

**Nightly backups**

- `ops/backup.sh`, run every night by cron on the server (e.g. 03:15):
  - `pg_dump -Fc storybook` → `/var/backups/storybook/db/storybook-YYYY-MM-DD.dump`
  - photos: `rsync -a /etc/storybook/uploads/ /var/backups/storybook/uploads/` – copies only new
    files, so it's fast; **without** `--delete`, so a photo removed in the app stays in the backup
  - keeps 7 daily database dumps + the first dump of each month for a year
  - database password via `~/.pgpass`, so cron doesn't need it in the script
- `ops/pull-backup.sh` on your computer: one `rsync` command that fetches everything new from the
  server. Run it whenever you like (only new photos are transferred).
- Backups on the server protect against mistakes (bad edit, broken update); the copy on your
  computer protects against losing the server. Optional extra: the hosting provider's paid backup.
- Document and test a restore once (`pg_restore` into a test database).

**Database migrations** – the new features add columns and tables. Instead of typing SQL by hand:

- numbered files `server/migrations/001_mood_length.sql`, `002_date_ranges.sql`, …
- `npm run migrate` applies the ones not applied yet (remembered in a `schema_migrations` table)
- same command locally and on the server → both databases always have the same structure

**Correct dates** – the server sends dates as timestamps (`2025-10-21T22:00:00.000Z` for 22 Oct),
so in another time zone every date is one day off. Fix: send plain dates (`"2025-10-22"`) and read
them as local dates everywhere in the app. Needed before date ranges.

**Photo-order fixes** (found in the code)

- the server returns a memory's photos in random order; the timeline shows "the first two" of that
  → sort by `display_order` in the query
- photos added later get order numbers 0, 1, … again and collide with existing ones → continue
  after the highest number
- editing a memory overwrites `created_at` → use a new `updated_at` column instead

## 1. Login protection & security round

**Exponential waiting time after failed logins**

- counted per IP address: the first 5 failures are free; then 30 s wait, and every further
  failure doubles it (1 min, 2 min, 4 min, … at most 1 h)
- also counted per account across all IPs (against attacks from many addresses): from 20 failures
  within 24 h, the same doubling for that account
- while waiting, login attempts are rejected _without_ checking the password – so even the right
  password can't be confirmed by an attacker during the wait
- counters reset after a successful login or 24 h without failures; kept in memory (a server
  restart resets them – acceptable for this app)
- the app shows "Zu viele Fehlversuche. Bitte warte noch 2 Minuten." with a countdown
  (server answers `429` with `Retry-After`)
- **required nginx change:** nginx doesn't pass the visitor's IP to Node at the moment, so every
  request looks like it comes from `127.0.0.1` – one bot would lock out everyone. Add
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and in Express
  `app.set('trust proxy', 'loopback')`.

**Additional security fixes**

- nginx `limit_req` for `/api/login` (e.g. 10 requests/minute per IP) as a first barrier
- remove `/api/debug/chapters` (returns the whole database to any logged-in user)
- refuse to start without `JWT_SECRET` instead of falling back to a known default secret
- Node listens only on `127.0.0.1` (reachable only through nginx)
- optional: fail2ban, to ban IPs that keep scanning for things like `phpinfo.php`
- optional: random filenames for new uploads (photos are public to anyone who knows the name)

**Added with step 5** (security check): nginx security headers (HSTS, Content-Security-Policy,
Permissions-Policy, hidden nginx version, cross-origin protection), at most 1 MB per request
(except photos), fixed JWT algorithm, upload content check (must really be a photo), input checks
with clear messages, server checklist and "log everyone out" in `ops/README.md`.

## 2. Mood picker

- moods in their own file `client/src/moods.js`, grouped with German names (shown as tooltips):
  - Glücklich 😊 😄 😂 🥳 🤩 😎 · Verliebt 🥰 😍 💖 💕 😘 💑 · Entspannt 😌 😴 ☕ 🌿
  - Abenteuer 🔥 🌈 ✈️ 🏔️ 🌊 🎉 · Nachdenklich 🤔 🥹 😮 · Schwierig 😢 😭 😠 😤 🤒
  - (all 12 current emojis are included)
- "Zuletzt benutzt" row on top: your most used moods from recent memories
- "Anderes Emoji…" field: opens the phone's/computer's own emoji keyboard; checks that exactly one
  emoji was entered
- migration: `mood` column from 10 to 32 characters (some emojis are made of several characters)
- server checks the mood length, so a too-long value gives a clear error instead of a crash

## 3. Phone app (add to home screen)

- yes: in the browser "Zum Home-Bildschirm" → it opens like an app (own icon, no browser bars)
- proper app name ("Storybook"), colors and an icon – your own design or a simple heart/book icon
- iPhone: Safari → Share → "Zum Home-Bildschirm"; note: the home-screen app has its own storage,
  so you log in once more there
- `vite-plugin-pwa` for the app manifest and a small service worker: the app starts faster and
  Android offers "install"
- no offline editing (keeps it simple); without connection a clear "Keine Verbindung" message

## 4. Multiple storybooks

More than one storybook (e.g. "Anna & Ben", "Familie", …): choose one after logging in, switch in
the menu ("Storybook wechseln"); the storybook's name is the title on its home page.

**How it's stored – proposal: one database, one _schema_ per storybook.** A schema is like a folder
inside the database: `book_1.chapters`, `book_2.chapters`, … Each storybook has its own tables, so
storybook 1 can never show memories of storybook 2 – the same separation as separate databases. But
it keeps one login (the `users` table is shared), one database connection, one backup file, and later
features can still link memories to users (authors, step 10).

- Alternative (your first idea): separate databases `storybook1`, `storybook2`. Works too, but the
  users would need an extra database of their own, the server needs a connection per database,
  migrations and backups run per database, and memories can't reference users in another database.
- each storybook has a small `storybook_info` table with its name (later maybe description, cover
  photo, color) – renaming = changing that one row
- the app finds storybooks by themselves: every schema named `book_<number>`
- your current storybook becomes `book_1`: its tables are moved into the schema (nothing copied,
  IDs unchanged); `users` stays shared

**Photos: one folder per storybook** – `uploads/book_1/`, `uploads/book_2/`, … each with its own
`thumb/` and `medium/` inside. Photo addresses become `/uploads/book_1/<file>`. The database keeps
storing only the file name (the folder follows from the storybook), so no database change is needed
for this. Your existing photos (including their small versions) are moved into `uploads/book_1/`
once, by a script, as part of this step. Deleting a whole storybook later = its schema + its folder.

**Creating a storybook:** a command on the server: `npm run storybook:create -- "Familie"` (creates
the schema and its tables, sets the name). A button in the app could do the same later, but isn't
needed to start. **Renaming:** in the app's menu ("Storybook umbenennen").

**App**

- after login: only one storybook → straight in; several → a choice page with a card per storybook
  (name, number of memories, later a cover photo); the last one used is remembered on the device
- addresses contain the storybook (`/b/1/memory/5`), so links, bookmarks and "back" keep working

**Server**

- every request names its storybook (e.g. `/api/books/1/chapters`); the server checks that you may
  see it and then only uses that storybook's tables
- migrations split into "shared" (users, …) and "per storybook" (applied to every `book_*`);
  `npm run migrate` handles both, so new storybooks get the same structure automatically
- backups: one dump still contains all storybooks; a single storybook can be restored on its own
  (`pg_restore -n book_2`). The photo backup copies the folders as they are (still without the
  small versions). Because the backup copy never deletes anything, the move would otherwise leave
  every photo twice in it (old place + new folder): the move script rearranges the server's backup
  copy the same way, and the step's instructions include a one-time command for your computer's copy.

**Decided**

- every user sees every storybook (no access list)
- everything except the users is per storybook: memories, photos, "An diesem Tag", Kapitel, map,
  yearly review,

## 5. Date ranges (multi-day memories)

- migration: `end_date` column (empty = single day); `date` stays the start
- form: checkbox "Mehrere Tage" → the date picker selects a range (start + end)
- **detail view**, at the top: a small row of day chips
  - `Fr 10.10.` · `Sa` · `So 12.10.2025` – first and last day with date, days in between with
    weekday only
  - for long ranges (more than 14 days) instead: `Mo 01.08. – Fr 15.08.2025 · 15 Tage`
- **timeline card:** `10.–12.10.2025 · 3 Tage` (across months `30.09.–02.10.2025`, across years
  `30.12.2024–02.01.2025`)
- **order:** by start date, newest first; same start date → most recently created first
- **"An diesem Tag":** a multi-day memory appears on every day of its range in later years
- Feb 29 memories appear on Feb 28 in non-leap years

**Decided/built:** a first and last day that are the same is stored as a single day; a single day
shows one chip with weekday (`Mi 22.10.2025`); all dates now with two digits (`01.08.2025`);
"An diesem Tag" shows multi-day memories on every day, whatever the length, labelled
`2024 · Tag 2 von 3`; an edit from an older app version (without `end_date`) keeps the saved range.
Also in this step: the start screen stays at least 1 second at app start and then fades out
(also into the login page).

## 6. Photo order & cover photo

- edit form: drag photos into the order you want (works with touch, using `dnd-kit`); saved with
  the rest of the form, like deleting photos now
- **cover photo, chosen independently of the order:** a ⭐ button "Als Titelbild" on each photo
  (column `cover_image_id`). Memories without a chosen cover use their first photo. The timeline
  and detail view show the photos in their order.
- the cover photo is then used where a memory needs _one_ picture: "An diesem Tag" cards, map
  popups, yearly review, album captions, link previews
- server: `PUT /api/books/:bookId/chapters/:id/images/order` with the photo IDs in the new order,
  `PUT /api/books/:bookId/chapters/:id/cover` with the cover photo's ID

**Decided/built:** saved and newly chosen photos are in one grid and can be sorted together (a new
photo can also be chosen as cover right away); on phones: hold briefly, then drag (normal swipes keep
scrolling); also works with the keyboard. ⭐ and × are always visible (before, × only appeared on
mouse hover). Saving: memory → new photos one by one (one request each, so any number of photos
works) → marked photos deleted → order → cover. The first photo of a memory
becomes its cover until another is chosen; removing the cover makes the first remaining photo the
cover. (First built with "cover = first photo"; changed after trying it.) If a photo fails, the memory is saved and the form stays
open; saving again doesn't create it twice. The order endpoint is forgiving when both of you edit
at the same time (unknown IDs ignored, unlisted photos stay at the end). Cover used in this step:
"An diesem Tag" cards; map, album and yearly review use it in their steps.

## 7. Kapitel (life phases) + year headings

- a Kapitel has a title, an optional emoji, and a **start date**. It lasts until
  the next Kapitel starts – so phases can't overlap and there are no gaps, and memories never have
  to be assigned by hand: the date decides. Memories before the first Kapitel have none.
  - e.g. 💌 Kennenlernen (Jan 2023) → 💑 Beziehung (Jun 2023) → 🏡 Zusammenleben (2025) → …
- timeline: year dividers (`2024 · 23 Erinnerungen`); which Kapitel you're in is shown by the
  navigation bar (see "Decided/built")
- navigation bar at the top: Kapitel and years; tapping one jumps there. Later the year heading
  also links to the yearly review.
- a small page to create/edit Kapitel (both of you can)
- naming: in the code, "chapters" already means memories (database table `chapters`). The new
  thing is called `phases` in code and "Kapitel" in the app. Recommended: rename the `chapters`
  table/API to `memories` at the start of this step, before the Kapitel code builds on it.

**Decided/built:** renamed `chapters` → `memories` (table, `images.memory_id`, API `/memories`; the
old `/chapters` addresses and `chapterId` still work for a while). A Kapitel has a title, an
optional emoji and a start date (an exact day; two can't start on the same day); a memory belongs
to the Kapitel of its first day.

Changed after trying the first version (Kapitel banners at the top of their memories were
confusing with newest-first): **the timeline shows no Kapitel at all** – only the memories and one
divider per year (`2024 · 23 Erinnerungen`, each year once). Kapitel have no description.

- **order switch** in the navigation bar: newest first (default) or oldest first, remembered on
  each device; oldest first opens at the top (the oldest memory)
- **navigation bar** (sticky): a row of Kapitel and a row of years (each once), in reading order;
  both highlight the Kapitel/year of the memory at the top of the screen. Tapping one jumps to its
  memory _closest_ to where you are – further down: its first one in reading order, further up:
  its last one, as if you had scrolled there. ⤒ jumps to the top, ⤓ to the end. A Kapitel without
  memories is shown greyed out; "Davor" = the memories before the first Kapitel.
- Kapitel page: create/edit with a preview (period and number of memories), delete with
  confirmation (memories stay, they belong to the previous Kapitel then)
- detail view: the memory's Kapitel as a chip; tapping it shows the memory in the timeline, where
  the bar highlights its Kapitel
- without Kapitel: only the year row, and a hint about Kapitel (can be closed)

## 8. Search & filters

- first: remove the old `/chapters` API addresses and the upload field `chapterId` (kept in step 7
  only for app versions that were still open during that update)
- no search server needed: all memories are already loaded in the app, so searching them there is
  instant, even with thousands of memories
- search box in the header: searches titles, texts (later also perspectives and place names);
  ignores upper/lower case and accents ("munchen" finds "München")
- filter chips: mood, year, Kapitel, "mit Fotos", (later) person and place
- results appear as the normal timeline cards with the search words highlighted, plus a count
- search/filters are part of the URL (`?q=konzert&jahr=2025`), so "back" keeps them
- if the app ever loads memories page by page: Postgres has built-in full-text search with
  German word stemming (`to_tsvector('german', …)`) – still no extra infrastructure

**Decided/built:**

- the old `/chapters` addresses and `chapterId` are removed
- the navigation bar stays compact (Kapitel, years, ⤒ ⤓); **∨** opens a panel with the search,
  the filters and the order switch, **∧** closes it. While a search/filter is active and the panel
  is closed, a slim line shows it ("🔍 „konzert“ · 2 Filter · 12 Treffer ✕")
- **search** = text only: titles, texts and moods (emoji); upper/lower case and accents don't
  matter, umlauts may be typed as ae/oe/ue ("muenchen" finds "München"), ß = ss; with several
  words all must appear. Matches are highlighted; a card whose match is further into the text
  shows the passage around it
- **filters** = tags, years, Kapitel (within a group any, groups combined); the search only looks
  at what the filters leave. No mood filter (moods can be searched), no "mit Fotos". With 2+ tags
  chosen, a switch "Erinnerungen mit einem der Tags | allen Tags" (one of them is the default)
- **tags** (new): a fixed list per storybook, edited on its own page (⋮ → "Tags bearbeiten":
  create, rename, delete with confirmation – deleting removes the tag from its memories, they
  stay); chosen in the add/edit form; shown in the detail view (tapping one filters by it) and,
  if switched on, on the timeline cards
- **settings page** (⋮ → "Einstellungen"): "Tags im Zeitstrahl zeigen" (off at first). Settings
  are per person, saved with the account (`users.settings`), the same on all their devices
- search and filters are in the address (`?q=konzert&tag=3,5&tagmodus=alle&jahr=2025&kapitel=2`); from a result,
  "Vorherige/Nächste" go through the results and "Zurück" returns to them (at that memory)
- while searching/filtering: "An diesem Tag" and the Kapitel hint are hidden; "Nichts gefunden"
  with a reset button

## 9. Photo album view

- switch in the header: **Zeitstrahl | Fotos** (later **| Karte**)
- all photos as a grid (3–6 per row depending on screen), newest first, with month headings
  ("Oktober 2025"); search and filters apply here too
- tapping a photo opens the full-screen viewer with ← / → keys and swiping, a caption (memory
  title + date) and "Zur Erinnerung →"
- the same viewer is used on the detail page, which then also gets swiping between photos
- no server changes: the photos come with the memories that are already loaded

**Decided/built:**

- **☰ menu** left of the title (on every page of a storybook): **Zeitstrahl** and **Fotos**, the
  current view highlighted (step 11 adds **Karte**); search and filters are kept when switching
- **Fotos** (`/b/<id>/fotos`): rows that fill the width with every photo in its own shape
  ("justified", like Google Photos; very wide/tall ones are cut to 3:1 / 1:2), under month
  headings ("August 2025 · 5 Fotos", month of the memory's first day); same order as the timeline
  (Neu → Alt / Alt → Neu, per device) and within a memory its photo order; memories without photos
  don't appear
- the same navigation bar as the timeline (Kapitel/years highlight and jump, ∨ search, filters,
  order) – it counts photos ("5 von 13 Fotos")
- **full-screen viewer** (`PhotoViewer`, also on the detail page): swipe left/right (the photos sit
  side by side on a strip that follows the finger, so the next one is pulled in while the current
  one moves out – changed in step 10 after trying it), ‹ › and arrow keys on the laptop, swipe down / Esc / ✕ / tap next to the photo closes; pinch-zoom stays (no
  photo switching while zoomed in); caption with title, date and "17 / 230". In Fotos it goes
  through all photos shown and has "Zur Erinnerung →" (the detail page then offers "Zurück zu den
  Fotos"); on the detail page through that memory's photos. The open photo is in the address
  (`?foto=<id>`), so the phone's back button closes it; the neighbours are loaded ahead
- one server change after all: the photos' **width/height** (`images.width/height`, migration 008),
  so the rows can be laid out before the photos load. New uploads get them; existing photos once
  with `npm run photos:sizes`

## 10. Authors & perspectives

- everyone can edit everything (as now). What's added is _who_ wrote and changed what:
  - users get a display name (Anna, Ben); header shows "Angemeldet als Anna"
  - memories: "von Anna · zuletzt bearbeitet von Ben am 3.11.2025" (`updated_by`, `updated_at`)
- **perspectives:** "Perspektive hinzufügen" adds a text block to a memory, shown as
  "Aus Bens Sicht". The main text stays shared. Blocks keep their original author's name, can be
  edited by anyone, and show "bearbeitet von …" when someone else changed them.
  (new table `memory_texts`: memory, author, text, created/updated)
- **change history** (recommended, since anyone can edit and nothing should get lost): every
  save keeps the previous version (`memory_revisions`); "Verlauf" shows older versions and can
  restore one

**Decided/built:**

- **names:** each person sets their name in ⋮ → Einstellungen (at first the login name); the ⋮
  menu shows "Angemeldet als Anna"; the detail card shows "von Anna · zuletzt bearbeitet von Ben
  am 03.11.2025"
- **perspectives** (table `perspectives`): one per person and memory, added in the form ("+ Meine
  Perspektive hinzufügen"), removed by emptying it. **Only its author can write or change it**
  (the form shows the others' read-only). Shown only in the detail view, as a box under the main
  text: solid border and see-through fill in its **author's colour** – each person chooses theirs
  in the settings (10 colours), everyone sees it. Search also looks in perspectives
- **history** (table `memory_history`, only for reading – no restoring): who changed what, when.
  Title, text, perspectives with the changed words marked; date and mood old → new; tags only
  "hat die Tags geändert"; photos only how many were added/removed (order and cover aren't
  recorded). Saves by the same person within 15 minutes are one entry. Existing memories start
  with "angelegt" (from their author and creation time)
- the history is on the **back of the card**: 🕓 next to ✏️ turns the card over (3D), "Zurück zur
  Erinnerung" or the phone's back button turns it back (`?verlauf=1` in the address)

## 11. Map of our places

- a memory can have **several places** (good for trips with date ranges): name + coordinates
  (table `memory_places`)
- adding a place in the form:
  - search by name ("Gardasee") – via OpenStreetMap's free geocoding service (Nominatim), through
    our server so its usage rules (max. 1 request/second) are respected
  - "Aus Fotos übernehmen": the original photos still contain GPS positions → suggested places
  - or tap on a small map
- one-off script: suggests places for existing memories from their photos' GPS data
- **Karte** view: OpenStreetMap map (Leaflet), markers grouped when zoomed out; popup with cover
  photo, title, date → link to the memory; filters (year, Kapitel) apply
- detail view: small map with the memory's places
- privacy: coordinates are only sent to logged-in users; the small photo versions contain no GPS

**Decided/built:**

- **places are a shared list** per storybook (tables `places`, `memory_places`), like the tags:
  "Gardasee" exists once and is picked again; ⋮ → "Orte bearbeiten" to rename, move (✛ "Auf der Karte
  verschieben": drag the pin or tap the new spot; the old spot stays as a faint pin; the name stays,
  its memories and photos follow, nothing in the Änderungshistorie), merge (e.g. two
  towns at the lake into "Gardasee") and delete. Form: typing offers your places, "Suchen" asks
  OpenStreetMap (Nominatim, through the server: 1 request per second, no search-as-you-type),
  "Auf der Karte wählen" (tap a spot, a name is suggested), "Aus den Fotos" (the towns of its photos)
- **no photo positions are kept:** on upload the server turns a photo's GPS position into the
  town it lies in (that town becomes the photo's place) and then **removes the position from the
  file** (exiftool, the picture isn't touched). Places have the coordinates of the place itself
  (town centre, search result or tapped spot). A memory without places chosen by hand gets the
  towns of its photos by itself. Existing photos: once `npm run photos:places` (with `--dry-run`).
  Many photos have no position to begin with: phones and browsers often remove it when a photo
  is shared or uploaded (iPhone/Safari, Android/Chrome, messengers) – the command says so per
  photo; places in the form stay the main way
- **☰ → Karte** (`/b/<id>/karte`): Leaflet + OpenStreetMap; one pin per place with the number of
  its memories, pins close together grouped; a pin's popup lists its memories (cover, title,
  date). Same bar as the timeline: ∨ search/filters decide which memories are on the map;
  tapping a **Kapitel or year highlights** its pins (the others fade, the map moves to them),
  tapping again ends it. "12 Orte · 34 Erinnerungen · 18 ohne Ort"
- **map pictures through our server** (nginx `/tiles/` with a 2 GB / 60-day cache): phones only
  talk to the storybook, OpenStreetMap doesn't see who looks where; only for pages of this site
- **detail view:** after the photos, place chips (→ Karte at that place) and a small still map (as
  wide as the card on phones, at most 36rem on bigger screens; no moving, so it never catches the
  finger while scrolling; tap → Karte with this memory highlighted); the photo
  viewer shows a photo's town; the search finds place names; the Änderungshistorie records
  "Orte: + Gardasee · − Verona"
- also in this step: "Verlauf" renamed to **"Änderungshistorie"**

## 12. Yearly review ("Unser Jahr")

- the "main memories" idea: a ⭐ **Highlight** mark on memories (either of you can set it);
  aim for roughly 3–10 per year
- page `/jahr/2025`, reached from the year headings:
  1. **Unser 2025** – numbers: memories, photos, days on trips (from date ranges), places,
     the 3 most common moods, busiest month
  2. **Highlights** – big cards with cover photo; if none are marked yet, the memories with the
     most photos
  3. **Monat für Monat** – 12 tiles with the number of memories and a cover photo
  4. **Kapitel** of that year and **Orte des Jahres** (small map, once step 11 exists)
- calculated in the app from the loaded data – the only server change is the highlight mark

**Decided/built:**

- **👑 Highlight** (the ⭐ stays the cover photo's mark, so the two aren't confused): a button
  next to 🕓 ✏️ on a memory's page, either of you can set or remove it, saved right away. Like the
  cover photo it's **not recorded in the Änderungshistorie** and doesn't count as an edit. The
  timeline cards, the Fotos view (on the memory's first photo) and the Karte popups show the 👑.
  Server: migration `011_highlight.sql` (`memories.highlight`) and
  `PUT /api/books/<id>/memories/<id>/highlight`
- **reached from** "Unser Jahr →" on every year divider of the timeline, and **☰ → Unser Jahr**:
  a list of all years with memories (cover photo, "23 Erinnerungen · 140 Fotos · 👑 4")
- **page `/b/<id>/jahr/2025`** with ‹ › to the next older/newer year; a memory belongs to the year
  of its first day (as in the timeline and the filters):
  1. **In Zahlen:** memories, photos, places, days with memories, each with "+5 gegenüber 2024"
     (when the year before has memories); the 3 most common moods; the busiest month. "Days on
     trips" was left out
  2. **Highlights:** cards with cover photo; while none are marked, the 3 memories with the most
     photos and the hint "Markiert eure Highlights mit 👑"
  3. **Monat für Monat:** 12 tiles with the number of memories and a cover photo (a highlight's
     if there is one); tap → the month's first memory in the timeline; empty months greyed out
  4. **Orte des Jahres:** a small still map (tap → Karte filtered to that year) and the places
     with the most memories (tap → Karte at that place)
  5. **Ihr beide:** per person the memories and perspectives written that year, in your
     perspective colours
  6. **Fotos des Jahres:** up to 12 photos (the highlights' cover photos first, then the covers of
     the memories with the most photos), tap → the photo viewer
- a memory opened from the review leads back to it ("Zurück zum Rückblick 2025")
- the Kapitel of the year were left out
- calculated in the app from the loaded data (`client/src/yearReview.js`)

Changed after trying it (the 👑 next to the title mixed with the mood and the 📖):

- **👑 is a sticker, never part of a title:** tilted on the top-left corner of the card, reaching
  over its border, plus a thin golden frame – on the timeline cards and the detail card. Karte
  popups: on the corner of the small cover picture. Fotos keeps it on the memory's first photo. The
  Unser Jahr highlight cards have neither (they're all highlights)
- **the mood has its own round slot in the top-right corner:** timeline cards; detail card (bigger;
  the title flows around it); Unser Jahr highlight cards (on
  the edge of the cover photo). The 📖 after the title on the detail page is gone
- **one meaning per kind of cue:** colour = the people (perspective colours), gold + 👑 = highlights,
  mood = pattern and lightness (no colour). On the timeline cards (all on one soft base tone):
  - each mood group draws a faint line pattern in the card's top-right corner, behind the mood:
    Verliebt hearts, Glücklich sun rays, Entspannt waves, Abenteuer a route with mountains,
    Nachdenklich thought bubbles, Schwierig rain
  - how heavy it feels sets the lightness: Glücklich, Verliebt, Abenteuer bright (soft glow);
    Entspannt, Nachdenklich quiet (a touch of grey); Schwierig muted (grey card, greyer title and
    dot – the photos stay in colour)
  - own emojis: no pattern, plain card; no mood = 💖 = Verliebt
  - (first built with a colour per mood group – dropped: Nachdenklich and Schwierig hardly showed,
    and the colours were the same as the perspective colours and the highlight gold)
  - only the timeline cards show pattern and lightness; the badge elsewhere stays plain and
    "An diesem Tag" is unchanged
- **editable mood groups** (⋮ → "Stimmungen bearbeiten", `/b/<id>/stimmungen`): the six groups
  stay fixed; emojis can be added to a group (at its end, via the emoji keyboard) and removed from
  it – either of you, per storybook (table `mood_emojis`, migration `book/012`, started with the
  list that was fixed in the app until now). An emoji is in at most one group; adding one that's in
  another group asks whether to move it. Removing one says how many memories use it – they keep
  the emoji, it counts as "Anderes" then (plain card). At the bottom, "Anderes" lists the emojis
  your memories use that are in no group (tap → add to a group). The picker and the timeline
  follow right away. Not in the Änderungshistorie
- **emojis have no names any more:** the German names from step 2 ("fröhlich", "müde", …) were
  only tooltips (with a mouse) and the label under the mood on a memory's page – removed, so added
  emojis and the original ones are the same

## 13. Nightly security check + maintenance mode / lockdown

*(Since step 16 the server's part of this lives in [dk-srv](https://github.com/DimiJonas/dk-srv):
`dk-security-check`, `dk-mode lockdown`, `dk-notify`; the storybook keeps `storybook-mode` for its
maintenance mode. The names below are as they were then.)*

Independent of the other steps – can also be done earlier. The two emergency modes already exist
as manual commands (`project_maintenance_commands.txt`, "Maintenance mode" and "Lockdown");
this step adds the automatic check and a script `ops/maintenance.sh on|lockdown|off|status`
that runs exactly those commands.

**What is checked (nightly, `ops/security-check.sh` via cron) and what happens:**

| What                                                                 | Found by                                   | high                                                 | critical        |
| -------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------- | --------------- |
| nginx, OpenSSL (face the internet) – **no fix available yet**        | Ubuntu's CVE data (`pro cves --unfixable`) | **lockdown**                                         | **lockdown**    |
| nginx, OpenSSL – fix available                                       | `apt`                                      | installed right away, nginx restarted                | same            |
| server libraries (`npm audit --omit=dev` in `server/`)               | npm advisories                             | notification                                         | **maintenance** |
| client libraries that run in the browser (`--omit=dev` in `client/`) | npm advisories                             | notification                                         | **maintenance** |
| Node.js itself (from NodeSource)                                     | Node's list of security releases           | update installed, backend restarted                  | same            |
| OpenSSH                                                              | Ubuntu's CVE data                          | urgent notification (closing SSH would lock you out) | same            |
| PostgreSQL, rest of Ubuntu, build tools (Vite …)                     | Ubuntu's CVE data / npm                    | notification                                         | notification    |

- findings in the table → an immediate notification with what's affected and the suggested fix;
  medium/low findings only in the weekly report. (`pro cves --unfixable` always lists many
  medium/low problems in packages that aren't reachable from the internet, e.g. `acl` or the
  `dig` tool – Ubuntu fixes those later or not at all; the report shows them only as a number.)
- Ubuntu's priorities (negligible/low/medium/high/critical) come from Ubuntu's security team and
  already take a default installation into account; npm's are per library
- **can't be detected:** holes nobody has published yet ("zero-days"), and newly published ones
  that Ubuntu hasn't rated yet ("needs evaluation" – these only trigger a notification)
- why lockdown only when no fix exists yet: if a fixed nginx is available, installing it closes
  the hole in a minute – taking the site offline wouldn't add anything
- false alarms are possible (e.g. a rated hole in an nginx module we don't use): read the CVE,
  and if it doesn't apply, `ops/maintenance.sh off --force`
- after a reboot everything stays as it was (the steps below survive reboots)

**Maintenance mode** – the storybook's own code is switched off, nginx only shows a pause page:

1. `pm2 stop backend` + `pm2 save` – the backend (and every library in it) isn't running at all
2. the link `/etc/nginx/sites-enabled/storybook` is pointed to the maintenance config → every
   address (app, `/api`, photos) gets the pause page with status 503; `nginx -t`, reload
3. check: the site answers 503
   Reverse (`off`): (checks `npm audit` again) → `pm2 start backend` + `pm2 save` → check the
   backend answers → link back to the normal config, `nginx -t`, reload → check the site answers 200.
   Still reachable during maintenance: nginx sending one static file, and SSH – nothing new.
   The phone app (which has its own copy of the app) shows "Storybook macht gerade eine kurze Pause".

**Lockdown** – for a hole in nginx/OpenSSL themselves: the web server is switched off completely,
only SSH stays reachable:

1. `pm2 stop backend` + `pm2 save`
2. `systemctl mask --now nginx` – nginx stops, and nothing can start it again (not a reboot, not
   an automatic update that installs the fix)
3. `ufw delete allow 'Nginx Full'` – ports 80/443 closed in the firewall as a second barrier
4. `systemctl stop certbot.timer` – the certificate renewal would otherwise try to start nginx
5. check: nothing listens on 80/443
   Reverse (`off`): (checks that the fixed nginx/OpenSSL is installed) → `pm2 start backend` +
   `pm2 save` → link back to the normal config → `systemctl unmask nginx`, `nginx -t`, start nginx →
   `ufw allow 'Nginx Full'` → `systemctl start certbot.timer` → check the site answers 200.
   While closed: visitors see "can't connect", the phone app "Keine Verbindung"; the certificate
   can't renew (fine for a few weeks – it renews 30 days before it expires).

**Notifications (decided): push to the phone via [ntfy](https://ntfy.sh)**

- free ntfy app on the phone, subscribed to a long random topic name (works like a password –
  whoever knows it can read and send); the server sends with one `curl` command, also during
  lockdown (the firewall only blocks incoming connections)
- the topic is stored in `/etc/storybook/notify.conf` (readable only by root and appuser), used by
  one small script `ops/notify.sh "Titel" "Text" [priority]` that everything else calls
- messages go through the public ntfy.sh server: short texts only, never passwords or secrets
- **immediately:**
  - maintenance mode / lockdown switched on or off, and findings from the table above (urgent)
  - every successful SSH login to the server: user, IP address, time (via `pam_exec` in
    `/etc/pam.d/sshd`, set up as "optional", so a failing notification can never block a login).
    You also get one for your own logins – an unexpected one means someone else got in.
  - an app account locked after 20 failed logins (someone is guessing Anna's or Ben's password),
    sent by the backend itself
  - an IP banned by fail2ban for hammering the storybook login (`nginx-limit-req`), via a
    fail2ban action
  - the nightly backup failed
- **weekly report** (Monday morning), e.g. "Diese Woche: 41 IPs gesperrt (SSH 30, Scanner 9,
  Login 2), 3 fehlgeschlagene App-Logins, Backups 7/7 ok, 2 Updates warten, Neustart nötig: nein,
  Speicher 38 % belegt, 112 bekannte Probleme ohne Fix (alle medium/low)"
- bans of bots and scanners (SSH, `storybook-scanners`) only appear in the weekly report – they
  happen every day on every public server and aren't a sign of an attack on the storybook
- not planned: a "dead man's switch" (an outside service that warns when the server stops
  reporting) – if the whole server is down, no notification arrives; the missing weekly report
  is the sign

- complementing it: Ubuntu's automatic security updates (set up in `server_hardening_commands.txt`,
  Node.js included via `project_setup_commands.txt`); if the repo is on GitHub, its free
  Dependabot alerts send npm warnings by email

**Decided/built:**

- everything in `ops/security/`; `sudo ~/storybook/ops/security/install.sh` copies it to places
  **only root can change** (`/usr/local/sbin/storybook-*`, `/etc/cron.d/storybook`, …): the check
  runs as root, and the repository belongs to appuser like the backend – a hole in the backend
  mustn't become a way to change what root runs. Run again after a deploy that changed `ops/security/`
- `storybook-notify "Title" "Text" [priority] [tags]` sends via ntfy.sh (JSON, never makes the
  caller fail); topic in `/etc/storybook/notify.conf` (root and appuser). Notifications in English.
  No end-to-end encryption (ntfy doesn't offer it for its apps) – messages stay short and contain
  no secrets
- `storybook-mode status | normal | maintenance | lockdown` (the argument is the mode you want;
  first built as on/off, renamed after trying it) – the commands from
  `project_maintenance_commands.txt` (kept there as the way by hand), each step checked, with a
  notification; `status` is a short summary. `normal` refuses while the reason is still there;
  `normal --force` / `storybook-security-check --accept` remember the problems found as accepted
  false alarms (`/var/lib/storybook/accepted`), so the nightly check doesn't switch on again for them
- `storybook-security-check` shows each step and a summary (by hand); the nightly run uses
  `--quiet`; every run writes `/var/log/storybook/security-check.log`. `pro cves` lists a problem
  once per package (the kernel's for every installed kernel version – ~35,000 rows on the server):
  the check counts each problem once (`cves.py`), sends one "starting point" message on its first
  run and afterwards only new high/critical ones
- nightly check 05:10, weekly report Monday 08:00 (server time zone Europe/Berlin – it was UTC and
  is set in the setup steps). **Starts in trial mode** (`MODE=trial` in
  `/etc/storybook/security-check.conf`): "Would switch on …" instead of switching; after about two
  weeks `MODE=auto`. Updates (nginx/OpenSSL, Node security releases) are installed in both modes
- each problem is reported once; also reported: severe fixes still not installed after 3 days
  (automatic updates stuck?), nginx/OpenSSL problems Ubuntu hasn't rated yet, a check that
  couldn't run (pro cves / npm audit without answer); nginx and the backend are restarted when an
  update replaced files they still use
- `pro cves` lists binary packages (`nginx`, `nginx-common`, `libnginx-mod-*`, `openssl`,
  `libssl3t64` count as internet-facing); a fix "available" only through Ubuntu Pro (esm) isn't
  counted as installable
- SSH logins: `pam_exec` line in `/etc/pam.d/sshd` (optional, sent in the background); the app
  account notification shows the display name, not the login name; fail2ban: action only for
  `nginx-limit-req`, not for bans restored after a restart; backup failure from `ops/backup.sh`
- weekly report: bans per jail and different IPs, wrong/blocked app logins (nginx's log), SSH
  logins, backups x/7 with the missing nights, updates waiting, restart needed, disk, certificate
  days (as the site sends it), known problems without a fix (each once) by priority, npm counts,
  mode, accepted false alarms
- the ntfy topic lives only in `/etc/storybook/notify.conf` on the server (root:appuser, 640;
  `/etc/storybook` itself root-owned) – the repository has `notify.conf.example`
- **log rotation** (added later): all of the storybook's logs in one place
  (`ops/security/storybook.logrotate` → `/etc/storybook/logrotate.conf`, set up by `install.sh`),
  run **every hour** from `/etc/cron.d/storybook` with its own state file – so a flood of requests
  can't fill the disk before Ubuntu's once-a-day run. Backend (pm2): daily and at 20 MB, **14 days
  kept** (it has IPs and usernames of failed logins), copied and emptied in place (no restart);
  `backup.log`: monthly, a year; `/var/log/storybook/`: monthly, a year. Replaces `pm2-logrotate`
  (`install.sh` says when it's still installed). nginx, fail2ban, PostgreSQL and the journal stay
  with Ubuntu's own rotation. The weekly report reads the rotated backup log too

## 14. Private photos (login cookie)

Today anyone who has a photo's address can open it without logging in. Addresses are long and
random for new photos; photos from before step 1 are named upload time + original name
(`1752824473053-DSC_3366.JPG`) – not practical to guess blindly, but an address that gets passed
on (a copied picture link, a browser history) stays valid forever. (Since step 11 the originals
no longer contain GPS positions.)

- login is kept in a secure cookie (`HttpOnly`, `Secure`, `SameSite=Strict`) instead of the
  browser's storage: scripts can't read it at all (even a code-injection bug couldn't steal the login)
- nginx checks the cookie with the backend (`auth_request`) before serving a photo → photos only
  for logged-in users; the check is cached briefly so photo grids stay fast
- "Abmelden" really ends the login (cookie removed); optionally longer logins on own devices
- photos get `Cache-Control: private` (kept on the device, never in shared caches)
- the phone app keeps working (cookies work in home-screen apps; on iPhone it has its own login,
  as now)

**Decided/built:**

- **login cookie** `__Host-sb_session` (HttpOnly, Secure, SameSite=Strict, Path=/; `sb_session`
  on the laptop) holding a random key; the table `sessions` (migration `005_sessions.sql`, shared)
  only stores its SHA-256 hash, the user, the device ("Android · Chrome"), created/last used/expires
  and ended. The app can't read the cookie and asks `GET /api/session` at start
- **"Angemeldet bleiben"** on the login page (off by default): 30 days, renewed while the app is
  used (at most hourly); otherwise a cookie that ends with the browser, at most 24 h
- **logout ends the login on the server** (the key stops working right away); lost phone: `npm run
  sessions -- --end anna` (or `--end-all`) – no device list in the app; a new password / `--lock`
  ends that user's logins too. Checked logins are remembered in the backend for 30 s, so an ended
  login stops working within half a minute
- **photos**: nginx `auth_request` → `/api/auth/photo` (204/401/403/404) before every photo; the
  check also knows the photo's storybook (`maySeeStorybook`, everyone sees every storybook for
  now). The "already checked" memory is in the backend, not nginx's cache (that would put the
  cookie on disk). Photos: `Cache-Control: private, max-age=2592000` (30 days on the device)
- requests that change something must come from the app's own address (Origin check)
- **switch-over without logging in again**: the first start of the new app version swaps its old
  token for a remembered cookie (`POST /api/session/from-token`) and deletes it; old tokens are
  still accepted for the API until they run out (≤ 24 h, none are made any more)
- development: the Vite dev server passes `/api`, `/uploads`, `/tiles` on to the backend, so app
  and API share one address like on the server (the app uses relative addresses everywhere)
- emergency "log everyone out" is now `npm run sessions -- --end-all` (changing `JWT_SECRET`
  only affects old tokens)

---

## Public repository ✅

The repository became public (with a fresh history; the private one stays as an archive).

**Decided/built:**

- nothing that belongs to one server is in the repository: the domain and the certificate folder
  live in `/etc/storybook/site.conf` (written by `ops/install-nginx.sh`), read by the backend
  (`server/src/site.js`: origin check, CORS, place search User-Agent; `APP_URL` in `.env` can
  override it; production refuses to start without), the security scripts (`SITE_URL`) and the
  nginx configs – those are templates with `storybook.example.com` that `install-nginx.sh` fills
  in, checks (`nginx -t`, old config back on failure) and reloads. Commands files read the address
  from `site.conf` where they run on the server
- example names (Anna, Ben) instead of real ones; a new database's first storybook is called
  "Unser Storybook"
- English `README.md` for visitors: what it is, how it's built, the security measures;
  screenshots in `docs/screenshots/` come from a demo storybook (invented memories, generated
  pictures). No license (all rights reserved)

---

## 15. Hardening by the guides ✅

*(Since step 16 the server's hardening lives in [dk-srv](https://github.com/DimiJonas/dk-srv) –
`hardening/`, `HARDENING.md`, `SECURITY.md`; the paths below are as they were then.)*

Systematic hardening against published guides instead of best guesses – done before the
repository goes public. One guide per layer; every rule gets a result in `docs/SECURITY.md`:
done ✅, fixed in step 15 🔧, not applicable ➖, or accepted risk ⚠️ (with the reason).

| Layer | Guide | Checked by |
|---|---|---|
| Ubuntu 24.04 | CIS Ubuntu Linux 24.04 LTS, **Level 1 – Server** | USG (`usg audit cis_level1_server`, Ubuntu Pro, read-only) |
| nginx + TLS | CIS NGINX Benchmark (Level 1 Webserver); TLS: Mozilla "intermediate", BSI TR-02102-2 | `nginx -T`, local TLS tests, SSL Labs |
| PostgreSQL 16 | CIS PostgreSQL 16 Benchmark (Level 1) | settings, `pg_hba`, roles |
| The app | OWASP ASVS 5.0 Level 1 + the login/session parts of Level 2 | code review |

**Decided:**

- the server is attached to the free personal **Ubuntu Pro** subscription (USG for the CIS audit;
  also the ESM security updates)
- **CIS Level 1 Server** – Level 2 rules only where they're clearly worth it, one by one
- **2FA** for the app login: not in step 15, its own step later (in `SECURITY.md` as a known gap)
- **backups encrypted** before they leave the server, and a **monthly automatic test restore**
  with a notification

**Measured before (2026-11-02):** CIS Level 1 Server **72.2 %** (236 pass, 105 fail, 66 not
applicable) – USG with the SCAP Security Guide 0.1.78 (CIS Ubuntu 24.04 v1.0.0).

**Decided/built:**

- **one installer in parts**, `ops/hardening/install-hardening.sh` (packages, ssh, kernel, accounts,
  pam, logging, firewall, auditd, aide, postgres; `--dry-run`); the values are the ones the CIS
  profile checks (read from the audit's results); every changed file backed up; parts can be run
  again (nothing changes twice) – `docs/SECURITY.md` lists every CIS area with its result
- **SSH**: `AllowUsers appuser`, MaxAuthTries 4, LoginGraceTime 60, MaxStartups 10:30:60, no
  forwarding (user: no tunnels used), strong ciphers/MACs/KEX only, banner; root's SSH key moved away
- **kernel**: network sysctls (IPv6 router advertisements only off when the IPv6 route is static –
  checked), rare filesystems/protocols/USB storage blocked (not squashfs: snaps/Livepatch need it),
  `/dev/shm` and `/tmp` (own tmpfs, 25 % of RAM) `nodev,nosuid,noexec`, no core dumps, Apport off,
  `apparmor=1 security=apparmor` (+ `audit=1`) on the kernel command line
- **accounts/PAM**: umask 027 + `TMOUT=900`, home `750`/`.ssh` `700`, cron/at allow lists, `su` only
  via the empty `sugroup`, sudo log + `timestamp_timeout=15`, `postgres` without shell; pwquality
  (14 characters, 4 classes, also for root), **faillock 4 tries / 15 min**, pwhistory 24, no
  `nullok` – the PAM part asks first (root shell open in a second terminal)
- **firewall**: outgoing only DNS, NTP, DHCP, HTTP/HTTPS (+ SSH while the repository is pulled over
  SSH – found automatically), loopback rules; afterwards it tests DNS, updates, npm, ntfy and the
  map tiles
- **logging**: journald on disk, ≤ 1 GB (it was 2.2 GB), to rsyslog; time servers explicit; log files
  not readable for others; `/var/log/sudo.log` rotated
- **auditd** (Level 2, user's choice): the CIS rules + the storybook's own (`/etc/storybook`, scripts,
  SSH config and keys, nginx, cron), setuid programs, locked (`-e 2`); on a full disk it pauses
  instead of halting the server (accepted, A5)
- **AIDE** + `storybook-aide-check` (05:40): sorts changes into explained (dpkg.log since the last
  check; files updates regenerate, like `ld.so.cache` or a kernel's initrd, when packages were
  updated; or noted by our install scripts in `/var/lib/storybook/aide-expected`), sensitive (urgent
  notification) and other (log/weekly report); accepts the new state every night
- **PostgreSQL**: connection logging, pgAudit `ddl,role` (via `shared_preload_libraries` only – no
  `CREATE EXTENSION`, so dumps stay restorable by `webapp`), `CONNECT` only for `webapp`, the
  database `storybook_restoretest`
- **nginx** (CIS NGINX): `default-deny` (bare IP/unknown names: no answer, no certificate shown),
  Ubuntu's default site off, the other domain as its own small hardened static site (`STATIC_SITE=`
  in `site.conf`, template `ops/nginx/static-site.conf`), `server_tokens off` and 10 s timeouts for
  all sites, ≤ 50 connections per IP, TLS 1.2/1.3 also in `nginx.conf`, body ≤ 1 MB except photo
  uploads (50 MB), methods limited, hidden files never served, API rate limit, IPv6 listen lines
  (left out on servers without IPv6)
- **backups encrypted** with age (the secret key only on the laptop + password manager; the first
  encrypted run converts the old copies) and a **monthly restore test** into `storybook_restoretest`
  (row counts of every table + every photo's copy; notification); the backup pull uses **its own key
  restricted to `rrsync -ro`** of the backups folder; `ops/decrypt-backup.sh` for restores
- **SSH notifications by kind** (user's wish): terminal login / file transfer (rsync, scp/sftp, with
  direction) / other command / "Backups pulled" – from the key (`SSH_AUTH_INFO_0` + the comment in
  `authorized_keys`) and the session's processes; the install script's test notification says it's
  from the security install
- **staying hardened**: the nightly security check (step 8/8) and the weekly report compare the
  settings with the installed parts ("Hardening changed", once per change)
- the umask 027 doesn't reach nginx's files: the photo code sets 022 for itself
  (`server/src/images.js`), `update_nginx.sh` sets the build's rights, the maintenance page is copied
  with `install -m 644`
- USG **tailoring** (`ops/hardening/make-tailoring.py`): the accepted risks switched off for a second
  score; both scores go into `docs/SECURITY.md`
- not in step 15: **2FA** for the app login (its own step later, A8)

**Measured after the deploy (2026-11-03):** all rules **84.7 %** (323 pass, 35 fail, 49 not
applicable); with the accepted risks switched off **90.7 %** (323 pass, 24 fail). Both in
`docs/SECURITY.md`.

**Follow-up** (the 24 remaining failures and the first night's notifications – each one checked
against the audit's rule sources, details in `docs/HARDENING.md`, "Lessons"):

- **installer bug**: `… | put_text` ran in a subshell, so its notes were lost and `update-grub` never
  ran (no `apparmor=1`/`audit=1` on the kernel command line) – `shopt -s lastpipe`; the kernel part
  now checks `grub.cfg` itself and runs `update-grub` when the parameters are missing
- **sysctl**: ufw's `/etc/ufw/sysctl.conf` set `log_martians=0` at every start, procps' file
  `rp_filter=2`, and the audit reads every file – contradicting lines are commented out (with a note)
- **password rules** moved from `pwquality.conf.d/` into `pwquality.conf` (the only file the audit reads)
- **postfix** (pulled in by AIDE's recommendations, listening on port 25) removed; AIDE installed
  without recommendations
- **Apport** masked (with its helpers); **updates keep our changed config files**
  (`60-storybook-keep-config`: `--force-confdef --force-confold`, new versions as `.dpkg-dist`,
  listed in the weekly report) – otherwise the automatic updates skip such packages entirely
- **AIDE** runs from Ubuntu's `dailyaidecheck.timer` (05:40, drop-ins) instead of cron; leaves out
  shell/editor histories; checks `/boot/efi` without inode numbers (FAT renumbers them at every
  boot – that was the night's alert); keeps every package's file list for packages removed later
  (old kernels); logs what changed; `storybook-aide-check expect PATH` for changes made on purpose
- **backups were not encrypted**: `backup.conf` had become `640 root:root` (umask 027 under `sudo
  tee`), the backup (as appuser) couldn't read the key and quietly went unencrypted – `install.sh`
  sets `644`, and `backup.sh` now stops with a notification instead of falling back
- **drift check** extended: unexpected open ports, Apport, kernel command line (grub.cfg and running),
  contradicting sysctl lines, the password rules, the AIDE timer, unowned files (outside snaps)
- **accepted**: A12 (USG looks for AIDE's old `database=` name), A13 (one file in a read-only snap
  image) – tailored out, with our own check for the rest
- smaller: `su root adm` for `/var/log/sudo.log` in logrotate; new CVEs grouped by package in the
  notification (the 102 "new" ones came from the packages installed on 3 Nov); `collect-facts.sh`
  shows the kernel command line, boots, EFI partition, AIDE timer, unowned files like the audit,
  backup schedule and encryption, `.dpkg-dist` files, static sites; audit files in `.gitignore`
- **the main domain's own page**: a hardened static site showing one picture
  (`ops/static-site-picture.sh`: only real JPEG/PNG/WebP, metadata removed, root-owned; nginx: no
  scripts, no SVG, no symlinks, no listings)
- **`docs/HARDENING.md`**: every mechanism explained – what, why, where, how to check it, how to undo
- found during the follow-up's deploy: enabling the AIDE timer started a catch-up check while the
  database was being built ("cannot get lock") – the database is built first now, under the check's
  lock, and the check skips while AIDE is busy; `install-nginx.sh` skipped the picture site (folder
  not there yet) and left the old config on (403) – the warning names it now and is repeated at
  the end, and the picture script notices when nginx serves another folder

**Measured after the follow-up (2026-11-05):** all rules **92.4 %** (343 pass, 14 fail, 50 not
applicable); with the accepted risks switched off **99.6 %** (343 pass, 1 fail). The one left,
`permissions_local_var_log` – sysstat's daily files in `/var/log/sysstat/` are readable for everyone
(a one-time `chmod` doesn't last) – fixed right after: sysstat's own `UMASK=0027` (part "logging"),
and the drift check reports log files more open than 640. **The tailored audit afterwards
(2026-11-05, 15:06): 100 %** (344 pass, 0 fail).

---

## 16. Three repositories ✅

This repository held three things that change for different reasons: the app, the server's
hardening, and a private page (the main domain's picture, which must not be in a public
repository). Split into three, all under github.com/DimiJonas:

| Repository | What | Visibility |
|---|---|---|
| `storybook` | the app; what root runs for it in `ops/root/` | public |
| [`dk-srv`](https://github.com/DimiJonas/dk-srv) | everything that secures the server: hardening, nightly checks, notifications, lockdown, nginx's server-wide part, static sites | public |
| `dk-home` | the main domain's static page and its picture | private |

**Decided:**

- the server's scripts get the prefix `dk-` (`dk-security-check`, `/etc/dk-srv`, …); its own
  roadmap and documents (`HARDENING.md`, `SECURITY.md` with the CIS scorecard) move along. This
  `docs/SECURITY.md` keeps the app's part (OWASP ASVS, its nginx site, backups)
- **only root can change what root runs**: before, root ran scripts straight from `~/storybook`
  (owned by appuser, like the backend) – a hole in the app could have become root. Now:
  - dk-srv is a root-owned clone (`/opt/dk-srv`)
  - everything of the storybook that runs as root is in **one folder, `ops/root/`**: the nginx
    configs (moved from `storybook_nginx_config` and `ops/maintenance/`), the maintenance page,
    `storybook-mode`, `app.conf`, `logrotate.conf`, `install.sh`
  - `sudo dk-app-update storybook` keeps a root-owned **sparse, partial clone** of just that folder
    (`/opt/dk-apps/storybook`: `git clone --filter=blob:none --no-checkout`, then
    `sparse-checkout set --no-cone /ops/root/` – an update there downloads nothing else), shows
    the new commits and what changed in `ops/root/`, asks, then runs `ops/root/install.sh`
- the storybook tells dk-srv about itself in one file, `/etc/dk-srv/apps.d/storybook.conf`
  (from `ops/root/app.conf`; `KEY=value`, parsed, never run): user, folders, address, npm folders,
  mode command, nginx sites, places for the file integrity check, backup logs, databases. dk-srv's
  checks, weekly report, AIDE and hardening loop over its apps – a second app needs no change there
- `storybook-mode` keeps the storybook's own modes (`maintenance`, `normal`, `status`, and `stop`/
  `start` for dk-srv's lockdown); the lockdown itself is `dk-mode` (the whole server)
- the static page (formerly `ops/static-site-picture.sh` with a picture copied by hand) comes from
  the private `dk-home` repository, the same way as the app's code (push, then pull on the server):
  `sudo dk-site-update <name>` checks every file by its content, removes the pictures'
  metadata, installs root-owned
- private repositories over https with a **fine-grained, read-only token** (root-only file on the
  server; its expiry date in the weekly report); once the storybook and dk-srv are public, only
  dk-home needs it
- the backend and the backup read the ntfy topic from dk-srv's `/etc/dk-srv/notify.conf` (the old
  `/etc/storybook/notify.conf` still works until it's moved); `client/update_nginx.sh` tells
  `dk-aide-check` about a deploy
- the backend as its own user (instead of `appuser`, which also has sudo): after the split, as
  dk-srv's step 2

**Moving the server**: once, with dk-srv's `migrate/from-storybook.sh` (dk-srv's
`setup-commands.txt`, "Moving from the storybook's scripts") – settings, memory and logs to dk-srv's
places, the hardening's files renamed; nothing about the settings themselves changes.

---

## Future ideas (not planned yet)

- **Printable storybook:** export a year or everything as a laid-out PDF (e.g. for a printed photo
  book as a gift) – builds on the yearly review layout
- load memories page by page (only needed with many thousands of memories)
- videos and voice memos in memories
- reminders ("Heute vor 3 Jahren …") by email or push notification
