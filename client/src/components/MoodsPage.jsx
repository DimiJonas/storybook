import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Plus } from 'lucide-react';
import { api } from '../api';
import { useStorybook } from '../storybook';
import { memoriesText } from '../phases';
import { asSingleEmoji, MOOD_GROUPS, useMoods } from '../moods';

// "/b/<id>/stimmungen": which emojis belong to which mood group (⋮ → "Stimmungen bearbeiten").
// The six groups are fixed; emojis can be added to a group (at its end) and removed from it. A
// memory keeps its emoji either way – one removed from its group counts as "Anderes" (plain card on
// the timeline). At the bottom: the emojis your memories use that are in no group, to add them.

const LOOK_TEXT = { sun: 'Sonnenstrahlen', hearts: 'Herzen', waves: 'Wellen', route: 'Route', bubbles: 'Gedankenblasen', rain: 'Regen' };
const LIGHT_TEXT = { bright: 'hell', quiet: 'ruhig', muted: 'gedämpft' };
const groupLabel = (key) => MOOD_GROUPS.find((g) => g.key === key)?.label ?? key;

const chipClass = (selected) =>
  `w-11 h-11 rounded-full text-2xl flex items-center justify-center leading-none transition ${
    selected ? 'bg-purple-100 ring-2 ring-purple-500' : 'bg-white ring-1 ring-purple-200 hover:bg-purple-50'
  }`;
const boxClass = 'mt-3 p-3 rounded-xl bg-purple-50 space-y-2';
const primary = 'px-3 py-1.5 rounded-xl bg-purple-600 text-white text-sm font-semibold disabled:opacity-50';
const secondary = 'px-3 py-1.5 rounded-xl bg-white text-gray-700 text-sm font-semibold border border-gray-200';

// how many memories use each emoji
const useMoodCounts = (memories) =>
  useMemo(() => {
    const counts = new Map();
    for (const m of memories) if (m.mood) counts.set(m.mood, (counts.get(m.mood) ?? 0) + 1);
    return counts;
  }, [memories]);

// Runs a request, then loads the storybook again (so picker and timeline follow right away)
function useRequest() {
  const book = useStorybook();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (request, onError) => {
    setBusy(true);
    setError('');
    try {
      await request();
      await book.reload();
      return true;
    } catch (err) {
      if (!onError?.(err)) setError(err.response?.data?.error || 'Das hat nicht geklappt.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

// Adding an emoji to `group`: the emoji keyboard field, and – if it's already in another group –
// the question whether to move it here. `initial`: an emoji to add right away (from "Anderes").
function AddEmoji({ group, initial = '', onDone }) {
  const book = useStorybook();
  const [text, setText] = useState(initial);
  const [elsewhere, setElsewhere] = useState(null); // the group it's in already
  const { busy, error, setError, run } = useRequest();

  const add = async (move = false) => {
    const emoji = asSingleEmoji(text);
    if (!emoji) return setError('Bitte genau ein Emoji eingeben.');
    const ok = await run(
      () => api.post(`/api/books/${book.id}/moods`, { emoji, group: group.key, move }),
      (err) => {
        const other = err.response?.status === 409 && err.response.data?.group;
        if (other && other !== group.key) {
          setElsewhere(other);
          return true;
        }
        return false;
      }
    );
    if (ok) onDone();
  };

  if (elsewhere) {
    return (
      <div className={boxClass} data-testid="mood-move">
        <p className="text-sm text-gray-700">
          {asSingleEmoji(text)} ist schon in {groupLabel(elsewhere)}. Hierher nach {group.label} verschieben?
        </p>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => add(true)} className={primary}>Verschieben</button>
          <button type="button" onClick={onDone} className={secondary}>Abbrechen</button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
  return (
    <form className={boxClass} onSubmit={(e) => { e.preventDefault(); add(); }} data-testid="mood-add">
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setError(''); }}
          placeholder="🐶"
          aria-label={`Emoji für ${group.label}`}
          autoFocus
          className="w-24 p-2 border border-purple-200 rounded-xl bg-white text-2xl text-center focus:outline-hidden focus:ring-2 focus:ring-purple-400"
        />
        <button type="submit" disabled={busy || !text.trim()} className={primary}>Hinzufügen</button>
        <button type="button" onClick={onDone} className={secondary}>Abbrechen</button>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <p className="text-xs text-gray-500">Emoji-Tastatur: am Handy die 😊-Taste, am Mac Ctrl+Cmd+Leertaste, unter Windows Win+.</p>
      )}
    </form>
  );
}

// Removing an emoji from its group (with how many memories use it)
function RemoveEmoji({ group, item, count, onDone }) {
  const book = useStorybook();
  const { busy, error, run } = useRequest();
  const remove = async () => {
    if (await run(() => api.delete(`/api/books/${book.id}/moods/${item.id}`))) onDone();
  };
  return (
    <div className={boxClass} data-testid="mood-remove">
      <p className="text-sm text-gray-700">
        {item.emoji} aus {group.label} entfernen?
        {count > 0 && ` ${memoriesText(count)} behalten ${item.emoji} – es zählt dann als „Anderes“.`}
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={remove} className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
          Entfernen
        </button>
        <button type="button" onClick={onDone} className={secondary}>Abbrechen</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function GroupCard({ group, counts, open, setOpen }) {
  const selected = open?.group === group.key ? open : null;
  const close = () => setOpen(null);
  return (
    <section className="rounded-2xl bg-white border border-purple-200 shadow-sm p-3" data-testid="mood-group" data-group={group.key}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="font-bold text-gray-800">{group.label}</h3>
        <span className="text-xs text-gray-500">{LOOK_TEXT[group.pattern]} · {LIGHT_TEXT[group.light]}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {group.emojis.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpen(selected?.remove?.id === item.id ? null : { group: group.key, remove: item })}
            className={chipClass(selected?.remove?.id === item.id)}
            aria-label={`${item.emoji} aus ${group.label} entfernen …`}
            aria-pressed={selected?.remove?.id === item.id}
            data-testid="mood-chip"
          >
            {item.emoji}
          </button>
        ))}
        {!selected?.add && (
          <button
            type="button"
            onClick={() => setOpen({ group: group.key, add: true })}
            className="h-11 px-3 rounded-full text-sm text-purple-700 border border-dashed border-purple-300 hover:bg-purple-50 inline-flex items-center gap-1"
            aria-label={`Emoji zu ${group.label} hinzufügen`}
          >
            <Plus className="w-4 h-4" /> Emoji
          </button>
        )}
      </div>
      {selected?.remove && <RemoveEmoji key={selected.remove.id} group={group} item={selected.remove} count={counts.get(selected.remove.emoji) ?? 0} onDone={close} />}
      {selected?.add && <AddEmoji key={`${selected.initial ?? ''}`} group={group} initial={selected.initial} onDone={close} />}
    </section>
  );
}

// "Anderes": emojis your memories use that are in no group – tap one to put it into a group
function OtherEmojis({ emojis, counts, groups, setOpen }) {
  const [picked, setPicked] = useState(null);
  if (emojis.length === 0) return null;
  return (
    <section className="rounded-2xl bg-gray-50 border border-gray-200 p-3" data-testid="mood-other">
      <h3 className="font-bold text-gray-800 mb-2">Anderes</h3>
      <div className="flex flex-wrap gap-2">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => setPicked(picked === emoji ? null : emoji)}
            className={`flex items-center gap-1 pl-1 pr-2.5 h-11 rounded-full transition ${picked === emoji ? 'bg-purple-100 ring-2 ring-purple-500' : 'bg-white ring-1 ring-gray-200 hover:bg-gray-100'}`}
            aria-pressed={picked === emoji}
            data-testid="mood-other-chip"
          >
            <span className="w-9 text-2xl text-center leading-none">{emoji}</span>
            <span className="text-xs text-gray-500">×{counts.get(emoji)}</span>
          </button>
        ))}
      </div>
      {picked && (
        <div className="mt-3 p-3 rounded-xl bg-white border border-gray-200">
          <p className="text-sm text-gray-700 mb-2">{picked} hinzufügen zu:</p>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => { setOpen({ group: g.key, add: true, initial: picked }); setPicked(null); }}
                className="px-3 py-1.5 rounded-full text-sm text-purple-800 bg-purple-100 hover:bg-purple-200"
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function MoodsPage({ memories }) {
  const book = useStorybook();
  const { groups, groupOf } = useMoods();
  const counts = useMoodCounts(memories);
  // what's open: { group, remove: item } or { group, add: true, initial? } – one at a time
  const [open, setOpen] = useState(null);
  const others = [...counts.keys()].filter((emoji) => !groupOf(emoji)).sort((a, b) => counts.get(b) - counts.get(a));

  // a group's add box opened from "Anderes": scroll it into view
  const openAndShow = (value) => {
    setOpen(value);
    requestAnimationFrame(() => document.querySelector(`[data-group="${value.group}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  return (
    <motion.div className="container mx-auto px-4 py-8 max-w-2xl" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Link to={book.path()} className="inline-flex items-center text-purple-600 hover:text-purple-800 mb-6">
        <ChevronLeft className="w-5 h-5 mr-1" /> Zurück zum Zeitstrahl
      </Link>
      <h2 className="text-3xl font-bold text-purple-700 mb-6">😊 Stimmungen</h2>
      <div className="space-y-3">
        {groups.map((group) => <GroupCard key={group.key} group={group} counts={counts} open={open} setOpen={setOpen} />)}
        <OtherEmojis emojis={others} counts={counts} groups={groups} setOpen={openAndShow} />
      </div>
    </motion.div>
  );
}
