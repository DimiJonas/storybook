import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useStorybook } from '../storybook';
import { memoriesText } from '../phases';

// "/b/<id>/tags": the storybook's list of tags (⋮ → "Tags bearbeiten"). Tags are chosen in the
// add/edit form of a memory and used as filters in the timeline. Renaming changes the tag on all
// its memories; deleting removes it from them (the memories stay).

const inputClass =
  'flex-1 min-w-0 p-2.5 border border-purple-200 rounded-xl bg-white/80 focus:outline-hidden focus:ring-2 focus:ring-purple-400';

function TagRow({ tag }) {
  const book = useStorybook();
  const [mode, setMode] = useState('show'); // 'show' | 'rename' | 'delete'
  const [name, setName] = useState(tag.name);
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
  const rename = (e) => {
    e.preventDefault();
    run(() => api.put(`/api/books/${book.id}/tags/${tag.id}`, { name }));
  };

  return (
    <li className="p-3 rounded-2xl bg-white border border-purple-200 shadow-sm" data-testid="tag-row">
      {mode === 'rename' ? (
        <form onSubmit={rename} className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus aria-label="Neuer Name" className={inputClass} />
          <button type="submit" disabled={busy} className="p-2 rounded-full bg-purple-600 text-white" aria-label="Speichern">
            <Check className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => { setMode('show'); setName(tag.name); setError(''); }} className="p-2 rounded-full bg-gray-100 text-gray-700" aria-label="Abbrechen">
            <X className="w-4 h-4" />
          </button>
        </form>
      ) : mode === 'delete' ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            Tag „{tag.name}“ löschen?{' '}
            {tag.memories > 0 ? `Er wird von ${memoriesText(tag.memories)} entfernt – die Erinnerungen bleiben.` : 'Er wird noch nicht benutzt.'}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => run(() => api.delete(`/api/books/${book.id}/tags/${tag.id}`))} className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-sm font-semibold">
              Ja, löschen
            </button>
            <button type="button" onClick={() => setMode('show')} className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold">
              Nein
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-medium break-all">{tag.name}</span>
          <span className="flex-1 text-xs text-gray-500">{memoriesText(tag.memories)}</span>
          <button type="button" onClick={() => setMode('rename')} className="p-2 rounded-full text-purple-500 hover:bg-purple-100" aria-label={`Tag „${tag.name}“ umbenennen`}>
            <Pencil className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setMode('delete')} className="p-2 rounded-full text-red-500 hover:bg-red-50" aria-label={`Tag „${tag.name}“ löschen`}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
    </li>
  );
}

export default function TagsPage() {
  const book = useStorybook();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/books/${book.id}/tags`, { name });
      await book.reload();
      setName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Der Tag konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div className="container mx-auto px-4 py-8 max-w-2xl" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Link to={book.path()} className="inline-flex items-center text-purple-600 hover:text-purple-800 mb-6">
        <ChevronLeft className="w-5 h-5 mr-1" /> Zurück zum Zeitstrahl
      </Link>
      <h2 className="text-3xl font-bold text-purple-700 mb-2">🏷️ Tags</h2>
      <p className="text-sm text-gray-600 mb-6">
        Tags wählt ihr beim Anlegen oder Bearbeiten einer Erinnerung aus (z. B. „Reise“, „Familie“). Im Zeitstrahl
        könnt ihr danach filtern.
      </p>

      <form onSubmit={add} className="flex items-center gap-2 mb-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Neuer Tag, z. B. Reise" aria-label="Neuer Tag" className={inputClass} />
        <button type="submit" disabled={busy || !name.trim()} className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-linear-to-r from-purple-500 to-fuchsia-500 text-white font-semibold disabled:opacity-50">
          <Plus className="w-4 h-4" /> Anlegen
        </button>
      </form>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}

      {book.tags.length === 0 ? (
        <p className="text-gray-500 text-center py-6">Noch keine Tags.</p>
      ) : (
        <ul className="space-y-2 mt-4">
          {book.tags.map((tag) => <TagRow key={tag.id} tag={tag} />)}
        </ul>
      )}
    </motion.div>
  );
}
