# Storybook – client

React frontend, built with [Vite](https://vite.dev/) (replaced Create React App in October 2026).

Requires Node.js 22.12 or newer (`node -v`).

## Commands

| Command           | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `npm install`     | Install dependencies (after cloning, or after `package.json` changed) |
| `npm run dev`     | Start the dev server on http://localhost:3000 with live reload        |
| `npm start`       | Same as `npm run dev`                                                 |
| `npm run build`   | Create the production build in `build/`                               |
| `npm run preview` | Serve the production build locally to check it                       |
| `./update_nginx.sh` | Build and copy the result to the nginx folder (on the server)       |

The backend must be running on http://localhost:3001 for development (`cd ../server && npm run dev`).
The dev server passes `/api`, `/uploads` and `/tiles` on to it (`proxy` in `vite.config.js`), so the
app and the API share one address – like on the server, where nginx does that – and the login
cookie works the same way.

## Where things are

- `index.html` – the HTML page; Vite loads `src/main.jsx` from it
- `src/main.jsx` – starts React and the service worker (phone app, see below)
- `src/App.jsx` – the pages: login, `/` (opens the last used storybook), `/books` (choice),
  `/b/<id>/...` inside a storybook (home, add, edit, memory detail)
- `src/components/StorybookLayout.jsx` – everything inside one storybook: loads its memories and Kapitel,
  header, start screen; gives the pages the storybook via `useStorybook()` (`src/storybook.js`)
- `src/api.js` – requests to the server (the browser adds the login cookie by itself; 401 → login
  page), the last used storybook
- `src/session.js` – who is logged in (step 14): the login is an HttpOnly cookie the app can't
  read, so it asks the server at start (`checkSession`, `useSession`); `logout()`; swaps a token
  from before step 14 for a cookie once
- `src/components/Login.jsx` – the login page with "Angemeldet bleiben" (30 days, renewed while
  used; otherwise until the browser closes)
- `src/config.js` – where the backend is (the app's own address) and the photo addresses
- `src/dates.js` – reading and showing dates (always use these instead of `new Date("2025-10-22")`):
  date ranges (`memoryDateText` for the timeline, `dayChips` for the detail view) and the
  "An diesem Tag" rules (`onThisDay`)
- `src/splash.js` – the start screen: when it fades out (see "Start screen" below)
- `src/moods.js` – the six mood groups (fixed) and how each looks on the timeline cards (pattern
  and lightness – bright, quiet, muted; `LIGHT_CLASSES`); which emojis are in which group comes from
  the server per storybook (`book.moods`) – read it with `useMoods()` (`groups`, `groupOf`, `look`);
  the "exactly one emoji" check. Emojis have no names
- `src/components/MoodsPage.jsx` – ⋮ → "Stimmungen bearbeiten" (`/b/<id>/stimmungen`): add emojis
  to a group, remove them, and the emojis your memories use that are in no group ("Anderes")
- `src/components/MoodPicker.jsx` – the mood picker of the add/edit form (the storybook's groups,
  "Zuletzt benutzt", "Anderes Emoji…")
- `src/phases.js` – Kapitel: which memories belong to which, periods ("Juni 2023 – Mai 2025"), and
  the timeline in reading order (`orderMemories`, `yearRanges`, `phaseRanges`, `closestIndex`)
- `src/photos.js` – `coverPhoto(memory)`: the chosen cover photo, otherwise the first photo
- `src/viewState.js` – what the views (Zeitstrahl, Fotos) share: order (per device), search and
  filters in the address, filter choices, jumping to `#…` links
- `src/photoLayout.js` – the rows of the Fotos view: every photo in its shape, rows exactly as wide
  as the screen (`justifyRows`), row height by screen size
- `src/components/photos/PhotosPage.jsx` – the Fotos view (`/b/<id>/fotos`, ☰ → "Fotos"): month
  headings, rows of photos, the same navigation bar as the timeline
- `src/components/PhotoViewer.jsx` – the full-screen viewer (Fotos and detail page): swiping, keys,
  caption; `usePhotoParam()` keeps the open photo in the address (`?foto=<id>`)
- `src/people.js` – everyone's name and perspective colour (`usePeople()`), the colours, the
  German possessive ("Annas", "Lukas'")
- `src/diff.js` – word-by-word differences for the history (`diffWords`, `compactDiff`)
- `src/useAddressParam.js` – something opened on top of a page kept in the address (`?foto=`,
  `?verlauf=`), so the phone's back button closes it
- `src/components/MemoryHistory.jsx` – the history ("Änderungshistorie") on the back of the detail card
- `src/components/map/` – the maps (Leaflet, a separate download): `MapPage` (☰ → "Karte",
  `/b/<id>/karte`), `PlacesMiniMap` (still picture on the detail page), `PlacePicker` ("Auf der
  Karte wählen"), `PlaceMover` ("Auf der Karte verschieben" on the places page); `src/map/` sets up Leaflet, the map pictures (`/tiles/`) and the pins
- `src/components/year/` – "Unser Jahr": `YearsPage` (☰ → "Unser Jahr", `/b/<id>/jahre`, the list of
  years) and `YearPage` (`/b/<id>/jahr/2025`, the yearly review); `src/yearReview.js` works out
  what it shows (numbers, highlights, months, places, the two of you, photos of the year)
- `src/components/PlacesField.jsx` – the places in the add/edit form; `PlacesPage.jsx` – ⋮ → "Orte
  bearbeiten" (`/b/<id>/orte`: rename, move on the map, merge, delete)
- `src/components/Header.jsx` – the bar at the top: ☰ (views), name, ⋮ (menu);
  `AddMemoryButton.jsx` – the round "+" button
- `src/components/home/` – the timeline (start page): `Timeline` (memories with a divider per year
  and its "Unser Jahr →" link, `MemoryCard` – the mood in the top-right corner with its group's
  pattern behind it and the card's lightness, a highlight with golden frame and 👑 sticker), `TimelineNav` (the sticky bar: Kapitel, years, ⤒ ⤓; ∨ opens search, filters, order switch), `OnThisDayCard`
- `src/components/PhasesPage.jsx` – the Kapitel page (`/b/<id>/kapitel`, ⋮ → "Kapitel bearbeiten")
- `src/components/TagsPage.jsx` – the tags page (`/b/<id>/tags`, ⋮ → "Tags bearbeiten"); `TagChips.jsx`
  shows a memory's tags
- `src/components/SettingsPage.jsx` + `src/settings.js` – personal settings (⋮ → "Einstellungen"),
  saved with the account (`/api/settings`), loaded by `StorybookLayout`, read with `useSetting()`
- `src/search.js` – search (accents/umlauts folded, highlighting, text passage) and filters (tags,
  years, Kapitel), and how they're written into the address (`?q=…&tag=…&jahr=…&kapitel=…`)
- `src/components/MoodBadge.jsx` – a memory's mood in its own round slot in the top-right corner of
  a card (timeline, detail page, Unser Jahr); `MoodPattern.jsx` – the faint
  line drawing of a mood group on the timeline cards (plain SVG); `HighlightSticker.jsx` – the 👑
  sticker on the top-left corner of a highlight's card and its golden frame (`HIGHLIGHT_FRAME`)
- `src/components/` – the React components; `MemoryForm.jsx` adds/edits a memory; `PhotoOrderGrid.jsx` is the photo grid of the add/edit
  form (drag to sort with [dnd-kit](https://docs.dndkit.com), ⭐ = cover photo, independent of the order, × = remove)
- `src/index.css` – Tailwind CSS (v4) setup
- `public/` – files copied to the build as they are (favicon, app icons)
- `app-icon.png` – the picture all app icons are made from
- `vite.config.js` – Vite settings (dev port, build folder, phone app name/colors/icons)

Files containing JSX (HTML-like tags in JavaScript) must end in `.jsx`.

## Phone app ("Zum Home-Bildschirm")

The storybook can be added to a phone's home screen and then opens like an app (own icon, no
browser bars). The app's own files are kept on the phone, so it starts quickly; memories and photos
always come from the server.

- **iPhone/iPad:** open the storybook in Safari → Share button → "Zum Home-Bildschirm". The app has
  its own storage on iOS, so you log in once more there.
- **Android:** open it in Chrome → menu (⋮) → "App installieren" / "Zum Startbildschirm hinzufügen".

Behaviour:
- after a deploy, the app switches to the new version by itself the next time it's opened or comes
  back to the screen – except while the add/edit form is open; then it waits until you leave it
- coming back to the app after more than a minute reloads the memories (e.g. to see new ones from
  the other person); without connection a "Keine Verbindung" notice with "Nochmal versuchen" appears
- in maintenance mode (the server answers 503, see `project_maintenance_commands.txt`) the app shows
  "Storybook macht gerade eine kurze Pause" with "Nochmal versuchen"
- in development (`npm run dev`) the service worker is off; to try the phone app behaviour locally use
  `npm run build && npm run preview`

Start screen: on Android, Chrome first shows its own short screen (icon and name on the color
`background_color` in `vite.config.js`). Then the app's own start screen appears: the element
`#splash` in `index.html` (styles `.splash` in `src/index.css`), so it's there before the app's
JavaScript has loaded. `src/splash.js` fades it out once nothing is loading any more – but not
before it has been on screen for 1 second after opening the app (`MIN_VISIBLE_MS`), so it never
just flashes by. Pages that load something keep it with `<Splash visible={isLoading} />`
(`src/components/Splash.jsx`); switching storybooks shows it again while loading (without the
1-second minimum).

**Content-Security-Policy:** nginx tells the browser to only run scripts and styles from the app's
own files. So don't put `<script>…</script>`, `<style>` or `style="…"` attributes into `index.html`
– put styles into `src/index.css` instead. (`style={{…}}` in React components is fine.) Pictures,
fonts and requests to other websites are blocked too; if a later feature needs one (e.g. map
tiles from OpenStreetMap in step 11), its address has to be added to the
`Content-Security-Policy` line in `ops/root/nginx/storybook.conf`.

**Changing the icon:** replace `app-icon.png` (a rounded-square icon on a plain light background,
like the current one, at least 1024 px), then
```sh
cd ../server && node scripts/make-app-icons.js
```
and rebuild. It creates all sizes in `public/`, including the start screen's `splash-icon.webp`
(see the comments in the script). If the new icon has other colors, adjust the start screen's
colors in `src/index.css` (`.splash`) and `background_color` in `vite.config.js`. Phones that already
have the app on the home screen may only show the new icon after removing and re-adding it.
