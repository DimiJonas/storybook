import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api, isOnForm, isMaintenance, isServerUnreachable, rememberStorybook } from '../api';
import { StorybookContext, storybookPath } from '../storybook';
import { DEFAULT_SETTINGS, SettingsContext } from '../settings';
import { moodGroups, recentMoods } from '../moods';
import Header from './Header';
import HomePage from './home/HomePage';
import PhotosPage from './photos/PhotosPage';
import MemoryForm from './MemoryForm';
import MemoryDetail from './MemoryDetail';
import PhasesPage from './PhasesPage';
import TagsPage from './TagsPage';
import MoodsPage from './MoodsPage';
import SettingsPage from './SettingsPage';
import PlacesPage from './PlacesPage';
import YearsPage from './year/YearsPage';
import YearPage from './year/YearPage';
// the map (with its library) is only downloaded when it's opened
const MapPage = lazy(() => import('./map/MapPage'));
import Splash from './Splash';
import ConnectionNotice from './ConnectionNotice';

// Reload the memories when coming back to the app after this long (e.g. to see what the other
// person added) – an app on the home screen has no reload button
const REFRESH_AFTER_MS = 60 * 1000;

// Everything inside one storybook (/b/<id>/...): loads its name and memories, provides them to
// all pages via StorybookContext, and shows the header. Also loads the personal settings of whoever
// is logged in (SettingsContext, see settings.js).
export default function StorybookLayout() {
  const bookId = Number(useParams().bookId);
  const [books, setBooks] = useState([]); // all storybooks (for the name and "Storybook wechseln")
  const [memories, setMemories] = useState([]);
  const [phases, setPhases] = useState([]); // Kapitel, oldest first
  const [tags, setTags] = useState([]); // the storybook's tags, by name: [{ id, name, memories }]
  const [settings, setSettings] = useState(DEFAULT_SETTINGS); // personal settings (of the account)
  const [users, setUsers] = useState([]); // everyone's name and perspective colour (see people.js)
  const [moods, setMoods] = useState([]); // which emoji is in which mood group: [{ id, emoji, group, position }]
  const [places, setPlaces] = useState([]); // the storybook's places: [{ id, name, latitude, longitude, memories, photos }]
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [isLoading, setIsLoading] = useState(true);
  const [connectionLost, setConnectionLost] = useState(false);
  const [maintenance, setMaintenance] = useState(false); // server in maintenance mode (503)
  const [notFound, setNotFound] = useState(false);
  const lastFetch = useRef(0);

  const load = useCallback(async () => {
    try {
      const [booksRes, memoriesRes, phasesRes, tagsRes, settingsRes, usersRes, placesRes, moodsRes] = await Promise.all([
        api.get('/api/books'),
        api.get(`/api/books/${bookId}/memories`),
        api.get(`/api/books/${bookId}/phases`),
        api.get(`/api/books/${bookId}/tags`),
        api.get('/api/settings'),
        api.get('/api/users'),
        api.get(`/api/books/${bookId}/places`),
        api.get(`/api/books/${bookId}/moods`),
      ]);
      setBooks(booksRes.data);
      // each memory also gets the names of its places (for the search)
      const placeNames = new Map(placesRes.data.map((p) => [p.id, p.name]));
      setMemories(memoriesRes.data.map((m) => ({ ...m, place_names: (m.place_ids ?? []).map((id) => placeNames.get(id)).filter(Boolean) })));
      setPlaces(placesRes.data);
      setMoods(moodsRes.data);
      setPhases(phasesRes.data);
      setTags(tagsRes.data);
      setSettings(settingsRes.data);
      setUsers(usersRes.data);
      setConnectionLost(false);
      setMaintenance(false);
      setNotFound(false);
      rememberStorybook(bookId);
    } catch (err) {
      console.error('Error loading the storybook:', err);
      if (isServerUnreachable(err)) {
        // no answer at all (offline), the backend is down, or maintenance mode
        setConnectionLost(true);
        setMaintenance(isMaintenance(err));
      } else if (err.response.status === 404) setNotFound(true);
    } finally {
      lastFetch.current = Date.now();
      setIsLoading(false);
    }
  }, [bookId]);

  // (Re)load when the storybook changes
  useEffect(() => {
    setIsLoading(true);
    setMemories([]);
    setPhases([]);
    setTags([]);
    setPlaces([]);
    setMoods([]);
    load();
  }, [load]);

  // Reload when the app comes back to the screen or the connection returns – but not while
  // the add/edit form is open (reloading would reset what you're typing)
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const refresh = () => { if (!isOnForm()) loadRef.current(); };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > REFRESH_AFTER_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
    };
  }, []);

  const name = books.find((b) => b.id === bookId)?.name ?? '';
  useEffect(() => {
    document.title = name || 'Storybook';
  }, [name]);

  const rename = useCallback(async (newName) => {
    const { data } = await api.put(`/api/books/${bookId}`, { name: newName });
    setBooks((list) => list.map((b) => (b.id === bookId ? { ...b, name: data.name } : b)));
  }, [bookId]);

  // Change one setting: shown right away, then saved (back to the old value if that fails)
  const changeSetting = useCallback(async (key, value) => {
    const before = settingsRef.current[key];
    setSettings((current) => ({ ...current, [key]: value }));
    try {
      const { data } = await api.put('/api/settings', { [key]: value });
      setSettings(data);
      // name and colour are what the others see too: show them everywhere right away
      if (key === 'displayName' || key === 'perspectiveColor') setUsers((await api.get('/api/users')).data);
    } catch (err) {
      setSettings((current) => ({ ...current, [key]: before }));
      throw err;
    }
  }, []);
  // Change one memory in the loaded list right away (e.g. its 👑 highlight), without reloading all
  const updateMemory = useCallback((id, changes) => {
    setMemories((list) => list.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }, []);

  const settingsValue = useMemo(() => ({ settings, change: changeSetting }), [settings, changeSetting]);

  // the mood groups with their emojis (moods.js: useMoods), worked out once for all cards
  const groupsOfMoods = useMemo(() => moodGroups(moods), [moods]);

  const storybook = useMemo(() => ({
    id: bookId,
    name,
    path: (page = '') => storybookPath(bookId, page),
    storybookCount: books.length,
    rename,
    phases,
    tags,
    users,
    places,
    moods,
    moodGroups: groupsOfMoods,
    reload: load,
    updateMemory,
  }), [bookId, name, books.length, rename, phases, tags, users, places, moods, groupsOfMoods, load, updateMemory]);

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="text-2xl text-purple-700 font-bold">Dieses Storybook gibt es nicht (mehr) 📚</div>
        <Link to="/books" className="text-purple-600 underline">Zu den Storybooks</Link>
      </div>
    );
  }

  return (
    <StorybookContext.Provider value={storybook}>
      <SettingsContext.Provider value={settingsValue}>
        <Splash visible={isLoading} />
        <div className="min-h-screen bg-linear-to-b from-pink-50 to-white">
          <Header />
          {connectionLost && <ConnectionNotice onRetry={load} maintenance={maintenance} />}
          {!isLoading && (
            <Routes>
              <Route index element={<HomePage memories={memories} />} />
              <Route path="fotos" element={<PhotosPage memories={memories} />} />
              <Route path="karte" element={<Suspense fallback={<p className="text-center text-gray-500 py-20">Karte lädt …</p>}><MapPage memories={memories} /></Suspense>} />
              <Route path="orte" element={<PlacesPage />} />
              <Route path="jahre" element={<YearsPage memories={memories} />} />
              <Route path="jahr/:year" element={<YearPage memories={memories} />} />
              <Route path="add" element={<MemoryForm recentMoods={recentMoods(memories)} onSuccess={load} />} />
              <Route
                path="edit/:id"
                element={<MemoryForm memories={memories} recentMoods={recentMoods(memories)} onSuccess={load} />}
              />
              <Route path="memory/:id" element={<MemoryDetail memories={memories} />} />
              <Route path="kapitel" element={<PhasesPage memories={memories} />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="stimmungen" element={<MoodsPage memories={memories} />} />
              <Route path="einstellungen" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to={storybookPath(bookId)} replace />} />
            </Routes>
          )}
        </div>
      </SettingsContext.Provider>
    </StorybookContext.Provider>
  );
}
