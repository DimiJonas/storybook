import React, { lazy, Suspense, useMemo, useState } from 'react';
import { Camera, Map as MapIcon, MapPin, Search, X } from 'lucide-react';
import { api } from '../api';
import { normalize } from '../search';
import { useStorybook } from '../storybook';

// The places of a memory in the add/edit form (step 11). Places come from the storybook's shared
// list (⋮ → Orte bearbeiten), and new ones are added to it:
//   - typing shows matching places you already have
//   - "Suchen": OpenStreetMap's place search (only when pressed – its rules forbid search-as-you-type)
//   - "Auf der Karte wählen": tap a spot and name it
//   - "Aus Fotos": the towns of the memory's saved photos that aren't among its places yet
// placeIds: the chosen places, in order; onChange(ids); photoPlaceIds: the towns of its photos
const PlacePicker = lazy(() => import('./map/PlacePicker'));

export default function PlacesField({ placeIds, onChange, photoPlaceIds = [] }) {
  const book = useStorybook();
  const [created, setCreated] = useState([]); // places made in this form (not yet in book.places)
  const [text, setText] = useState('');
  const [results, setResults] = useState(null); // search results, null = no search yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  const known = useMemo(() => new Map([...book.places, ...created].map((p) => [p.id, p])), [book.places, created]);
  const add = (id) => { if (!placeIds.includes(id)) onChange([...placeIds, id]); };
  const remove = (id) => onChange(placeIds.filter((x) => x !== id));
  const reset = () => { setText(''); setResults(null); setError(''); };

  // places you already have that match what's typed
  const matches = useMemo(() => {
    const words = normalize(text).text.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return [...known.values()]
      .filter((p) => !placeIds.includes(p.id) && words.every((w) => normalize(p.name).text.includes(w)))
      .slice(0, 6);
  }, [text, known, placeIds]);

  // a place from OpenStreetMap or the map: into the list (or the one that's already there), then here
  const takeNew = async (place) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/api/books/${book.id}/places`, place);
      if (!known.has(data.id)) setCreated((list) => [...list, data]);
      add(data.id);
      reset();
    } catch (err) {
      setError(err.response?.data?.error || 'Der Ort konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  };

  const search = async (e) => {
    e?.preventDefault();
    if (text.trim().length < 2) return setError('Bitte gib mindestens 2 Zeichen ein.');
    setBusy(true);
    setError('');
    try {
      const { data } = await api.get(`/api/books/${book.id}/places/search`, { params: { q: text.trim() } });
      setResults(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Die Ortssuche hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  const fromPhotos = [...new Set(photoPlaceIds)].filter((id) => id && !placeIds.includes(id) && known.has(id));
  const chip = 'inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium';

  return (
    <div>
      <span className="block text-sm font-medium text-purple-800 mb-1">Orte</span>
      {placeIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2" role="list" aria-label="Orte der Erinnerung">
          {placeIds.map((id) => (
            <span key={id} role="listitem" className={`${chip} bg-purple-600 text-white`}>
              <MapPin className="w-3.5 h-3.5" /> {known.get(id)?.name ?? 'Ort'}
              <button type="button" onClick={() => remove(id)} className="ml-0.5 -mr-1 p-0.5 rounded-full hover:bg-white/20" aria-label={`${known.get(id)?.name ?? 'Ort'} entfernen`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {fromPhotos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs text-gray-600" data-testid="photo-places">
          <Camera className="w-3.5 h-3.5" /> Aus den Fotos:
          {fromPhotos.map((id) => (
            <button key={id} type="button" onClick={() => add(id)} className={`${chip} bg-white border border-purple-200 text-purple-800 hover:bg-purple-50`}>
              + {known.get(id).name}
            </button>
          ))}
        </div>
      )}

      {/* typing: places you have; "Suchen": OpenStreetMap (not a <form>: this is inside the memory's form) */}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setResults(null); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') search(e); }}
          placeholder="Ort hinzufügen, z. B. Gardasee"
          aria-label="Ort hinzufügen"
          maxLength={200}
          className="flex-1 min-w-0 p-3 border border-purple-200 rounded-2xl shadow-inner bg-white/80 focus:outline-hidden focus:ring-2 focus:ring-purple-400"
        />
        <button type="button" onClick={search} disabled={busy} className="flex items-center gap-1 px-3 rounded-2xl bg-purple-600 text-white text-sm font-semibold disabled:opacity-50">
          <Search className="w-4 h-4" /> Suchen
        </button>
      </div>
      {matches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Eure Orte">
          {matches.map((p) => (
            <button key={p.id} type="button" onClick={() => { add(p.id); reset(); }} className={`${chip} bg-purple-50 border border-purple-200 text-purple-800 hover:bg-purple-100`}>
              <MapPin className="w-3.5 h-3.5" /> {p.name}
            </button>
          ))}
        </div>
      )}
      {results && (
        <ul className="mt-2 rounded-2xl border border-purple-200 bg-white divide-y divide-purple-100 overflow-hidden" aria-label="Suchergebnisse">
          {results.length === 0 && <li className="p-3 text-sm text-gray-500">Nichts gefunden.</li>}
          {results.map((r, i) => (
            <li key={`${r.osm_key ?? i}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => (r.place_id ? (add(r.place_id), reset()) : takeNew({ name: r.name, latitude: r.latitude, longitude: r.longitude, osm_key: r.osm_key }))}
                className="w-full text-left p-3 hover:bg-purple-50"
              >
                <span className="block font-medium text-gray-800">{r.name}</span>
                <span className="block text-xs text-gray-500 truncate">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <button type="button" onClick={() => setPicking(true)} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-purple-700 hover:text-purple-900">
        <MapIcon className="w-4 h-4" /> Auf der Karte wählen
      </button>
      <p className="mt-1 text-xs text-gray-500">Ortssuche: © OpenStreetMap-Mitwirkende</p>

      {picking && (
        <Suspense fallback={null}>
          <PlacePicker onClose={() => setPicking(false)} onPick={(place) => { setPicking(false); takeNew(place); }} />
        </Suspense>
      )}
    </div>
  );
}
