import React, { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, Crosshair, GitMerge, Map as MapIcon, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useStorybook } from '../storybook';
import { memoriesText } from '../phases';
// the map for moving a place (and its library) only downloads when it's opened
const PlaceMover = lazy(() => import('./map/PlaceMover'));

// "/b/<id>/orte" (⋮ → "Orte bearbeiten"): the storybook's places. Places are added in the
// add/edit form of a memory (and from the towns of photos); here they can be renamed, moved on the
// map (PlaceMover), merged (e.g. "Peschiera del Garda" and "Sirmione" into "Gardasee") and deleted
// (the memories stay).

const photosText = (n) => (n === 1 ? '1 Foto' : `${n} Fotos`);
const inputClass =
  'flex-1 min-w-0 p-2.5 border border-purple-200 rounded-xl bg-white/80 focus:outline-hidden focus:ring-2 focus:ring-purple-400';

function PlaceRow({ place, others }) {
  const book = useStorybook();
  const [mode, setMode] = useState('show'); // 'show' | 'rename' | 'merge' | 'delete'
  const [moving, setMoving] = useState(false); // the map for moving it is open
  const [name, setName] = useState(place.name);
  const [into, setInto] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (request) => {
    setBusy(true);
    setError('');
    try {
      await request();
      await book.reload();
      setMode('show');
    } catch (err) {
      setError(err.response?.data?.error || 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };
  const used = [place.memories > 0 && memoriesText(place.memories), place.photos > 0 && photosText(place.photos)].filter(Boolean);
  const target = others.find((p) => p.id === Number(into));

  return (
    <li className="p-3 rounded-2xl bg-white border border-purple-200 shadow-sm" data-testid="place-row">
      {mode === 'rename' ? (
        <form onSubmit={(e) => { e.preventDefault(); run(() => api.put(`/api/books/${book.id}/places/${place.id}`, { name })); }} className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus aria-label="Neuer Name" className={inputClass} />
          <button type="submit" disabled={busy} className="p-2 rounded-full bg-purple-600 text-white" aria-label="Speichern"><Check className="w-4 h-4" /></button>
          <button type="button" onClick={() => { setMode('show'); setName(place.name); setError(''); }} className="p-2 rounded-full bg-gray-100 text-gray-700" aria-label="Abbrechen"><X className="w-4 h-4" /></button>
        </form>
      ) : mode === 'merge' ? (
        <div className="space-y-2">
          <label className="block text-sm text-gray-700">
            „{place.name}“ zusammenführen mit:
            <select value={into} onChange={(e) => setInto(e.target.value)} className="mt-1 block w-full p-2.5 border border-purple-200 rounded-xl bg-white">
              <option value="">– Ort wählen –</option>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {target && (
            <p className="text-sm text-gray-600">Alle Erinnerungen und Fotos von „{place.name}“ kommen zu „{target.name}“; „{place.name}“ verschwindet.</p>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={busy || !target} onClick={() => run(() => api.post(`/api/books/${book.id}/places/${place.id}/merge`, { into: target.id }))} className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-sm font-semibold disabled:opacity-40">
              Zusammenführen
            </button>
            <button type="button" onClick={() => setMode('show')} className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold">Abbrechen</button>
          </div>
        </div>
      ) : mode === 'delete' ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            Ort „{place.name}“ löschen?{' '}
            {used.length ? `Er wird von ${used.join(' und ')} entfernt – die bleiben.` : 'Er wird noch nicht benutzt.'}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => run(() => api.delete(`/api/books/${book.id}/places/${place.id}`))} className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-sm font-semibold">Ja, löschen</button>
            <button type="button" onClick={() => setMode('show')} className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold">Nein</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="min-w-0">
            <span className="block font-medium text-purple-900 break-words">📍 {place.name}</span>
            <span className="block text-xs text-gray-500">{used.join(' · ') || 'noch nicht benutzt'}</span>
          </span>
          <span className="flex-1" />
          <Link to={book.path(`/karte?ort=${place.id}`)} className="p-2 rounded-full text-purple-500 hover:bg-purple-100" aria-label={`„${place.name}“ auf der Karte`} title="Auf der Karte">
            <MapIcon className="w-4 h-4" />
          </Link>
          <button type="button" onClick={() => setMoving(true)} className="p-2 rounded-full text-purple-500 hover:bg-purple-100" aria-label={`Ort „${place.name}“ auf der Karte verschieben`} title="Auf der Karte verschieben"><Crosshair className="w-4 h-4" /></button>
          <button type="button" onClick={() => setMode('rename')} className="p-2 rounded-full text-purple-500 hover:bg-purple-100" aria-label={`Ort „${place.name}“ umbenennen`} title="Umbenennen"><Pencil className="w-4 h-4" /></button>
          {others.length > 0 && (
            <button type="button" onClick={() => setMode('merge')} className="p-2 rounded-full text-purple-500 hover:bg-purple-100" aria-label={`Ort „${place.name}“ zusammenführen`}><GitMerge className="w-4 h-4" /></button>
          )}
          <button type="button" onClick={() => setMode('delete')} className="p-2 rounded-full text-red-500 hover:bg-red-50" aria-label={`Ort „${place.name}“ löschen`}><Trash2 className="w-4 h-4" /></button>
        </div>
      )}
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      {moving && (
        <Suspense fallback={null}>
          <PlaceMover place={place} onClose={() => setMoving(false)} />
        </Suspense>
      )}
    </li>
  );
}

export default function PlacesPage() {
  const book = useStorybook();
  return (
    <motion.div className="container mx-auto px-4 py-8 max-w-2xl" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Link to={book.path()} className="inline-flex items-center text-purple-600 hover:text-purple-800 mb-6">
        <ChevronLeft className="w-5 h-5 mr-1" /> Zurück zum Zeitstrahl
      </Link>
      <h2 className="text-3xl font-bold text-purple-700 mb-2">📍 Orte</h2>
      <p className="text-sm text-gray-600 mb-6">
        Orte fügt ihr beim Anlegen oder Bearbeiten einer Erinnerung hinzu; Fotos bringen ihre Stadt mit. Hier könnt
        ihr sie umbenennen, auf der Karte verschieben, zusammenführen (z. B. zwei Orte am See zu „Gardasee“) oder
        löschen.
      </p>
      {book.places.length === 0 ? (
        <p className="text-gray-500 text-center py-6">Noch keine Orte.</p>
      ) : (
        <ul className="space-y-2">
          {book.places.map((place) => (
            <PlaceRow key={place.id} place={place} others={book.places.filter((p) => p.id !== place.id)} />
          ))}
        </ul>
      )}
    </motion.div>
  );
}
