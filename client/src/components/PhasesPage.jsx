import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { de } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { ChevronLeft, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import MoodPicker from './MoodPicker';
import { api } from '../api';
import { useStorybook } from '../storybook';
import { formatDate, parseDate, toDateText } from '../dates';
import { memoriesText, phaseEnd, phaseOf, sortPhases } from '../phases';

registerLocale('de', de);

// "/b/<id>/kapitel": create, edit and delete Kapitel (life phases). Opened from the ⋮ menu.
// A Kapitel lasts from its start date until the next one starts; deleting one leaves its
// memories untouched (they then belong to the previous Kapitel).

const inputClass =
  'w-full p-3 border border-purple-200 rounded-2xl shadow-inner bg-white/80 focus:outline-hidden focus:ring-2 focus:ring-purple-400';

// "27.06.2023 – 31.05.2025" or "seit 01.06.2025"
const periodText = (phase, phases) => {
  const end = phaseEnd(phase, phases);
  if (!end) return `seit ${formatDate(phase.start_date)}`;
  return end === phase.start_date ? formatDate(end) : `${formatDate(phase.start_date)} – ${formatDate(end)}`;
};

const countIn = (phase, phases, memories) => memories.filter((m) => phaseOf(m, phases)?.id === phase.id).length;

function PhaseForm({ phase, phases, memories, onDone }) {
  const book = useStorybook();
  const isNew = !phase;
  const [title, setTitle] = useState(phase?.title ?? '');
  const [emoji, setEmoji] = useState(phase?.emoji ?? '');
  const [date, setDate] = useState(phase ? parseDate(phase.start_date) : new Date());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Preview: which period the Kapitel would cover and how many memories fall into it
  const draft = { id: phase?.id ?? 'neu', start_date: date ? toDateText(date) : null };
  const others = phases.filter((p) => p.id !== draft.id);
  const sameDay = draft.start_date && others.find((p) => p.start_date === draft.start_date);
  const withDraft = draft.start_date ? [...others, draft] : others;

  const save = async (e) => {
    e.preventDefault();
    if (!date) return setError('Bitte wähle den ersten Tag des Kapitels.');
    setSaving(true);
    setError('');
    const body = { title, emoji: emoji || null, start_date: toDateText(date) };
    try {
      if (isNew) await api.post(`/api/books/${book.id}/phases`, body);
      else await api.put(`/api/books/${book.id}/phases/${phase.id}`, body);
      await book.reload();
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Das Kapitel konnte nicht gespeichert werden.');
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError('');
    try {
      await api.delete(`/api/books/${book.id}/phases/${phase.id}`);
      await book.reload();
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Das Kapitel konnte nicht gelöscht werden.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5 p-5 sm:p-6 rounded-3xl bg-white border border-purple-200 shadow-lg">
      <h3 className="text-xl font-bold text-purple-700">{isNew ? 'Neues Kapitel' : 'Kapitel bearbeiten'}</h3>
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div>
        <label htmlFor="phase-title" className="block text-sm font-medium text-purple-800 mb-1">Titel</label>
        <input
          id="phase-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          required
          placeholder="z. B. Zusammenleben"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="phase-start" className="block text-sm font-medium text-purple-800 mb-1">Beginnt am</label>
        <DatePicker
          id="phase-start"
          selected={date}
          onChange={setDate}
          locale="de"
          dateFormat="dd.MM.yyyy"
          className={inputClass}
        />
        <p className={`text-xs mt-1 ml-1 ${sameDay ? 'text-red-600' : 'text-purple-700/80'}`} data-testid="phase-preview">
          {sameDay
            ? `An diesem Tag beginnt schon das Kapitel „${sameDay.title}“.`
            : draft.start_date &&
              `Dauert ${phaseEnd(draft, withDraft) ? `vom ${formatDate(draft.start_date)} bis ${formatDate(phaseEnd(draft, withDraft))}` : `ab ${formatDate(draft.start_date)} (bis ein neues Kapitel beginnt)`} · ${memoriesText(countIn(draft, withDraft, memories))}`}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="block text-sm font-medium text-purple-800">Emoji</span>
          {emoji && (
            <button type="button" onClick={() => setEmoji('')} className="text-xs text-purple-600 underline">
              ohne Emoji
            </button>
          )}
        </div>
        <MoodPicker value={emoji} onChange={setEmoji} />
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 min-w-36 bg-linear-to-r from-purple-500 to-fuchsia-500 text-white p-3 rounded-2xl font-semibold shadow-lg disabled:opacity-50"
        >
          {saving ? <Loader2 className="inline animate-spin w-4 h-4" /> : 'Speichern'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-1 min-w-36 bg-gray-100 text-gray-700 p-3 rounded-2xl font-semibold hover:bg-gray-200"
        >
          Abbrechen
        </button>
      </div>

      {!isNew && (
        <div className="pt-3 border-t border-purple-100">
          {confirmDelete ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Kapitel „{phase.title}“ wirklich löschen? Die Erinnerungen bleiben erhalten – sie gehören dann
                zum Kapitel davor.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={remove} disabled={saving} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                  Ja, löschen
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200">
                  Nein
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" /> Kapitel löschen
            </button>
          )}
        </div>
      )}
    </form>
  );
}

export default function PhasesPage({ memories }) {
  const book = useStorybook();
  const phases = useMemo(() => sortPhases(book.phases), [book.phases]);
  // which form is open: null, 'new' or a Kapitel's id
  const [editing, setEditing] = useState(null);
  const close = () => setEditing(null);
  const before = memories.filter((m) => !phaseOf(m, phases)).length;

  return (
    <motion.div
      className="container mx-auto px-4 py-8 max-w-2xl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Link to={book.path()} className="inline-flex items-center text-purple-600 hover:text-purple-800 mb-6">
        <ChevronLeft className="w-5 h-5 mr-1" /> Zurück zum Zeitstrahl
      </Link>

      <h2 className="text-3xl font-bold text-purple-700 mb-2">📚 Kapitel</h2>
      <p className="text-sm text-gray-600 mb-6">
        Jedes Kapitel beginnt an einem Tag und dauert, bis das nächste beginnt. Die Erinnerungen ordnen sich
        nach ihrem Datum von selbst zu.
      </p>

      {editing === 'new' ? (
        <div className="mb-6">
          <PhaseForm phase={null} phases={phases} memories={memories} onDone={close} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="mb-6 w-full flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-dashed border-purple-300 text-purple-700 font-semibold hover:bg-purple-50"
        >
          <Plus className="w-5 h-5" /> Neues Kapitel
        </button>
      )}

      {phases.length === 0 && editing !== 'new' && (
        <p className="text-gray-500 text-center py-6">Noch keine Kapitel.</p>
      )}

      <ol className="space-y-4">
        {phases.map((phase) =>
          editing === phase.id ? (
            <li key={phase.id}>
              <PhaseForm phase={phase} phases={phases} memories={memories} onDone={close} />
            </li>
          ) : (
            <li key={phase.id} className="p-5 rounded-2xl bg-white border border-purple-200 shadow-md flex items-start gap-4">
              <span className="text-4xl leading-none" aria-hidden="true">{phase.emoji || '📖'}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-gray-800 break-words">{phase.title}</h3>
                <div className="text-sm text-gray-500">
                  {periodText(phase, phases)} · {memoriesText(countIn(phase, phases, memories))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(phase.id)}
                className="p-2 rounded-full text-purple-500 hover:text-purple-700 hover:bg-purple-100"
                title="Bearbeiten"
                aria-label={`Kapitel „${phase.title}“ bearbeiten`}
              >
                <Pencil className="w-5 h-5" />
              </button>
            </li>
          )
        )}
      </ol>

      {phases.length > 0 && before > 0 && (
        <p className="text-sm text-gray-500 mt-6">
          {memoriesText(before)} {before === 1 ? 'liegt' : 'liegen'} vor dem ersten Kapitel.
        </p>
      )}
    </motion.div>
  );
}
