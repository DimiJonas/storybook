import React, { useEffect, useState } from 'react';
import { ChevronLeft, History } from 'lucide-react';
import { api } from '../api';
import { memoryDateText } from '../dates';
import { compactDiff, diffWords } from '../diff';
import { colorHex, possessive, usePeople } from '../people';
import { useStorybook } from '../storybook';

// The back of a memory's card in the detail view: its history ("Änderungshistorie") (GET .../memories/:id/history,
// see server/src/history.js), newest first. Only for reading. For title, text and perspectives
// the changed words are marked (added green, removed red and crossed out); date and mood show
// old → new; tags and photos only that they changed.

const when = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Changed words of a text, with a few words around each change
function TextChange({ label, before, after }) {
  const parts = compactDiff(diffWords(before ?? '', after ?? ''));
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 mb-0.5">{label}</div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed" data-testid="text-change">
        {parts.map((part, i) =>
          part.type === 'gap' ? <span key={i} className="text-gray-400"> … </span>
            : part.type === 'added' ? <ins key={i} className="no-underline bg-emerald-100 text-emerald-900 rounded-sm">{part.text}</ins>
              : part.type === 'removed' ? <del key={i} className="bg-red-100 text-red-800 rounded-sm">{part.text}</del>
                : <span key={i}>{part.text}</span>,
        )}
      </p>
    </div>
  );
}

const Line = ({ label, children }) => (
  <div className="text-sm text-gray-800">
    <span className="text-xs font-semibold text-gray-500">{label}: </span>
    {children}
  </div>
);

const photosText = ({ added, removed }) =>
  [
    added && `${added === 1 ? '1 Foto' : `${added} Fotos`} hinzugefügt`,
    removed && `${removed === 1 ? '1 Foto' : `${removed} Fotos`} entfernt`,
  ].filter(Boolean).join(' · ');

function Entry({ entry }) {
  const { person } = usePeople();
  const c = entry.changes;
  const who = entry.user_id ? person(entry.user_id) : null;
  const time = new Date(c.created ? entry.created_at : entry.updated_at);
  return (
    <li className="relative pl-5 pb-5 border-l-2 border-purple-200 last:border-transparent" data-testid="history-entry">
      <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: who ? colorHex(who.color) : '#9ca3af' }} aria-hidden="true" />
      <div className="text-sm mb-1.5">
        {who && <span className="font-semibold text-gray-800">{who.name}</span>}
        {!who && c.places && <span className="font-semibold text-gray-800">Automatisch (aus den Fotos)</span>}
        {(who || c.places) && <span className="text-gray-400"> · </span>}
        <span className="text-gray-500">{when.format(time)}</span>
      </div>
      <div className="space-y-2">
        {c.created && <p className="text-sm text-gray-800">{who ? 'hat die Erinnerung angelegt' : 'Erinnerung angelegt'}{c.photos?.added ? ` – mit ${c.photos.added === 1 ? '1 Foto' : `${c.photos.added} Fotos`}` : ''}</p>}
        {c.editedBeforeHistory && <p className="text-sm text-gray-600">Bearbeitet – was genau, ist von vor dem Beginn der Änderungshistorie nicht bekannt.</p>}
        {c.title && <TextChange label="Titel" before={c.title.before} after={c.title.after} />}
        {c.date && <Line label="Datum">{memoryDateText(c.date.before)} → {memoryDateText(c.date.after)}</Line>}
        {c.mood && <Line label="Stimmung">{c.mood.before || 'keine'} → {c.mood.after || 'keine'}</Line>}
        {c.content && <TextChange label="Text" before={c.content.before} after={c.content.after} />}
        {Object.entries(c.perspectives ?? {}).map(([authorId, change]) => {
          const name = person(Number(authorId)).name;
          const what = !change.before ? ' (neu)' : !change.after ? ' (entfernt)' : '';
          return <TextChange key={authorId} label={`${possessive(name)} Perspektive${what}`} before={change.before} after={change.after} />;
        })}
        {c.places && (
          <Line label="Orte">
            {[...c.places.added.map((name) => `+ ${name}`), ...c.places.removed.map((name) => `− ${name}`)].join(' · ')}
          </Line>
        )}
        {c.tags && <p className="text-sm text-gray-800">{who ? 'hat die Tags geändert' : 'Tags geändert'}</p>}
        {!c.created && c.photos && <p className="text-sm text-gray-800">{photosText(c.photos)}</p>}
      </div>
    </li>
  );
}

export default function MemoryHistory({ memory, onClose, active }) {
  const book = useStorybook();
  const [entries, setEntries] = useState(null); // null = loading
  const [error, setError] = useState('');

  // (re)load whenever the back is shown – someone may have changed the memory meanwhile
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setError('');
    api.get(`/api/books/${book.id}/memories/${memory.id}/history`)
      .then(({ data }) => { if (!cancelled) setEntries(data); })
      .catch(() => { if (!cancelled) setError('Die Änderungshistorie konnte nicht geladen werden.'); });
    return () => { cancelled = true; };
  }, [active, book.id, memory.id, memory.updated_at, memory.last_edit?.at]);

  return (
    <div className="bg-linear-to-br from-slate-50 via-white to-purple-50 border border-purple-100 rounded-3xl shadow-xl p-6 sm:p-8" data-testid="history-card">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-purple-700">
          <History className="w-6 h-6" /> Änderungshistorie
        </h2>
        <button type="button" onClick={onClose} className="flex items-center text-sm font-semibold text-purple-600 hover:text-purple-800">
          <ChevronLeft className="w-4 h-4 mr-0.5" /> Zurück zur Erinnerung
        </button>
      </div>
      <p className="text-sm text-gray-500 -mt-4 mb-6 truncate">„{memory.title}“</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && entries === null && <p className="text-sm text-gray-500">Lädt …</p>}
      {entries && (
        <ol className="ml-1.5">
          {entries.map((entry) => <Entry key={entry.id} entry={entry} />)}
        </ol>
      )}
    </div>
  );
}
