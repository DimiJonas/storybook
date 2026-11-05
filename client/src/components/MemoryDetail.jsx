import React, { lazy, Suspense, useState } from 'react';
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Crown, Edit, History, MapPin } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import MemoryHistory from './MemoryHistory';
// the small map (and its library) only downloads when a memory has places
const PlacesMiniMap = lazy(() => import('./map/PlacesMiniMap'));
import { useAddressParam } from '../useAddressParam';
import { boxStyle, possessive, usePeople } from '../people';
import ImageComponent from './ImageComponent';
import PhotoViewer, { usePhotoParam } from './PhotoViewer';
import { photoMemoryAnchor } from './photos/PhotosPage';
import { filterSuffix } from '../viewState';
import { dayChips, formatDate } from '../dates';
import { phaseOf } from '../phases';
import { applyFilters, filtersFromParams, isFiltering, searchWords } from '../search';
import TagChips from './TagChips';
import MoodBadge from './MoodBadge';
import HighlightSticker, { HIGHLIGHT_FRAME } from './HighlightSticker';
import { Marked } from './home/MemoryCard';
import { useStorybook } from '../storybook';
import { api } from '../api';

// "von Anna · zuletzt bearbeitet von Ben am 03.11.2025"
function AuthorLine({ memory }) {
  const { person } = usePeople();
  const parts = [];
  if (memory.user_id) parts.push(`von ${person(memory.user_id).name}`);
  if (memory.last_edit) {
    const day = formatDate(new Date(memory.last_edit.at).toLocaleDateString('sv-SE')); // "2025-11-03" -> "03.11.2025"
    parts.push(`zuletzt bearbeitet${memory.last_edit.user_id ? ` von ${person(memory.last_edit.user_id).name}` : ''} am ${day}`);
  }
  if (parts.length === 0) return null;
  return <p className="-mt-3 mb-5 text-xs text-gray-500" data-testid="author-line">{parts.join(' · ')}</p>;
}

// 👑: marks the memory as a highlight of its year (or not any more) – saved right away, not
// recorded in the Änderungshistorie (like the cover photo). Shown first in "Unser Jahr".
function HighlightButton({ memory }) {
  const book = useStorybook();
  const [error, setError] = useState('');
  const on = Boolean(memory.highlight);
  const toggle = async () => {
    setError('');
    book.updateMemory(memory.id, { highlight: !on }); // shown right away
    try {
      const { data } = await api.put(`/api/books/${book.id}/memories/${memory.id}/highlight`, { highlight: !on });
      book.updateMemory(memory.id, { highlight: data.highlight });
    } catch {
      book.updateMemory(memory.id, { highlight: on });
      setError('Konnte nicht gespeichert werden.');
    }
  };
  return (
    <span className="relative">
      <button
        type="button"
        onClick={toggle}
        className={`p-2 transition-colors rounded-full ${on ? 'bg-amber-400 text-white hover:bg-amber-500' : 'text-purple-500 hover:text-purple-700 hover:bg-purple-100'}`}
        title={on ? 'Highlight – nochmal tippen zum Entfernen' : 'Als Highlight des Jahres markieren'}
        aria-label="Highlight"
        aria-pressed={on}
      >
        <Crown className="w-5 h-5" />
      </button>
      {error && <span className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-red-600" role="alert">{error}</span>}
    </span>
  );
}

const MemoryDetail = ({ memories: allMemories }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const book = useStorybook();
  // Opened from search/filter results (?q=...): "Vorherige/Nächste" go through the results, "Zurück"
  // returns to them, and the search words are highlighted
  const [searchParams] = useSearchParams();
  const filters = filtersFromParams(searchParams);
  const results = isFiltering(filters) ? applyFilters(allMemories, filters, book.phases) : allMemories;
  const inResults = results.some((c) => c.id === parseInt(id));
  const memories = inResults ? results : allMemories;
  const suffix = inResults && results !== allMemories ? filterSuffix(searchParams) : '';
  const words = suffix ? searchWords(filters.query) : [];
  const memoryIndex = memories.findIndex((c) => c.id === parseInt(id));
  const memory = memories[memoryIndex];
  // Opened from the Fotos view ("Zur Erinnerung →"), the Karte or "Unser Jahr": "Zurück" goes back
  // there (kept through Vorherige/Nächste)
  const location = useLocation();
  const from = ['fotos', 'karte', 'jahr'].includes(location.state?.from) ? location.state.from : null;
  const fromYear = from === 'jahr' ? Number(location.state.year) || null : null;
  const keepFrom = from ? { state: { from, year: fromYear ?? undefined } } : undefined;
  // full-screen photo (in the address: ?foto=<id>, so the phone's back button closes it)
  const { openId, open, show, close } = usePhotoParam();
  // the history on the back of the card (in the address: ?verlauf=1, so "back" turns it round again)
  const historyParam = useAddressParam('verlauf');
  const flipped = historyParam.value === '1';
  const reduceMotion = useReducedMotion();
  // while turning, both sides are laid out; afterwards only the visible one (so the card has its height)
  const [turning, setTurning] = useState(false);
  const [wasFlipped, setWasFlipped] = useState(flipped);
  if (wasFlipped !== flipped) {
    setWasFlipped(flipped);
    if (!reduceMotion) setTurning(true);
  }
  const { person } = usePeople();

  const phase = memory ? phaseOf(memory, book.phases) : null;
  const viewerPhotos = (memory?.images ?? []).map((image) => ({ image, memory }));
  const memoryPlaces = (memory?.place_ids ?? []).map((id) => book.places.find((p) => p.id === id)).filter(Boolean);
  const viewerIndex = openId ? viewerPhotos.findIndex((p) => p.image.id === openId) : -1;

  if (!memory) {
    // nothing loaded at all (e.g. no connection – the notice above explains it)
    if (memories.length === 0) return null;
    return (
      <div className="text-center text-gray-500 py-20">
        Erinnerung nicht gefunden 💭
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto px-4 py-10">
        {/* Top Controls */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => navigate(
              from === 'fotos' ? book.path(`/fotos${suffix}#${photoMemoryAnchor(memory)}`)
                : from === 'jahr' && fromYear ? book.path(`/jahr/${fromYear}`)
                : from === 'karte' ? book.path(`/karte${suffix ? `${suffix}&` : '?'}erinnerung=${memory.id}`)
                  : book.path(`${suffix}#erinnerung-${memory.id}`),
            )}
            className="flex items-center text-purple-600 hover:text-purple-800 transition"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            {from === 'fotos' ? 'Zurück zu den Fotos' : from === 'karte' ? 'Zurück zur Karte' : from === 'jahr' && fromYear ? `Zurück zum Rückblick ${fromYear}` : 'Zurück zum Zeitstrahl'}
          </button>

          <div className="flex items-center gap-1">
            <HighlightButton memory={memory} />
            <button
              onClick={() => (flipped ? historyParam.close() : historyParam.open('1'))}
              className={`p-2 transition-colors rounded-full ${flipped ? 'bg-purple-600 text-white hover:bg-purple-700' : 'text-purple-500 hover:text-purple-700 hover:bg-purple-100'}`}
              title={flipped ? 'Zurück zur Erinnerung' : 'Änderungshistorie'}
              aria-label="Änderungshistorie"
              aria-pressed={flipped}
            >
              <History className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate(book.path(`/edit/${memory.id}`))}
              className="p-2 text-purple-500 hover:text-purple-700 transition-colors rounded-full hover:bg-purple-100"
              title="Bearbeiten"
              aria-label="Bearbeiten"
            >
              <Edit className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Upper Navigation Buttons */}
        <div className="flex justify-between">
          <button
            onClick={() => navigate(book.path(`/memory/${memories[memoryIndex + 1]?.id}`) + suffix, keepFrom)}
            className={`px-4 py-2 rounded-xl font-semibold flex items-center transition ${
              memoryIndex < memories.length - 1
                ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
            disabled={memoryIndex >= memories.length - 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Vorherige
          </button>

          <button
            onClick={() => navigate(book.path(`/memory/${memories[memoryIndex - 1]?.id}`) + suffix, keepFrom)}
            className={`px-4 py-2 rounded-xl font-semibold flex items-center transition ${
              memoryIndex > 0
                ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
            disabled={memoryIndex <= 0}
          >
            Nächste <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>

        {/* The card: the memory on the front, its history on the back (🕓 turns it over) */}
        <div className="mt-10 grid perspective-[2000px]">
          <div
            className={`grid transform-3d transition-transform duration-700 motion-reduce:transition-none ${flipped ? 'rotate-y-180' : ''}`}
            onTransitionEnd={(e) => { if (e.target === e.currentTarget) setTurning(false); }}
            data-testid="flip-card"
            data-flipped={flipped}
          >
            <div className={`col-start-1 row-start-1 backface-hidden ${!turning && flipped ? 'invisible h-0 overflow-hidden' : ''}`} inert={flipped}>
        {/* Memory Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={`relative bg-linear-to-br from-purple-50 via-white to-rose-50 border border-purple-100 rounded-3xl shadow-xl p-8 ${memory.highlight ? HIGHLIGHT_FRAME : ''}`}
        >
          {/* 👑 sticker on the corner of a highlight; the mood in the top-right corner – the title
              flows around it, so long titles still use the whole width */}
          {memory.highlight && <HighlightSticker testId="detail-crown" />}
          <MoodBadge mood={memory.mood} size="lg" className="float-right -mt-2 -mr-2 ml-3 mb-2" />
          <h1 className="text-4xl font-bold text-purple-700 mb-2 break-words">
            <Marked text={memory.title} words={words} />
          </h1>
          {/* The Kapitel it belongs to – shows this memory in the timeline (where the navigation bar
              highlights its Kapitel) */}
          {phase && (
            <button
              type="button"
              onClick={() => navigate(book.path(`${suffix}#erinnerung-${memory.id}`))}
              className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-linear-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold shadow hover:opacity-90"
              title="Im Zeitstrahl zeigen"
            >
              <span aria-hidden="true">{phase.emoji || '📖'}</span> {phase.title}
            </button>
          )}
          {/* The memory's day(s): "Fr 10.10." · "Sa" · "So 12.10.2025" */}
          <div className="flex flex-wrap gap-1.5 mb-6" aria-label="Datum">
            {dayChips(memory).map((text, i) => (
              <span
                key={i}
                className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-sm font-medium whitespace-nowrap"
              >
                {text}
              </span>
            ))}
          </div>
          {/* who wrote it and who changed it last ("von Anna · zuletzt bearbeitet von Ben am 03.11.2025") */}
          <AuthorLine memory={memory} />
          {/* tags: tapping one shows all memories with this tag */}
          <TagChips tagIds={memory.tag_ids} onSelect={(tag) => navigate(book.path(`?tag=${tag.id}`))} className="-mt-3 mb-6" />

          <p className="text-gray-800 whitespace-pre-wrap mb-8 text-lg leading-relaxed">
            <Marked text={memory.content} words={words} />
          </p>

          {/* the text may flow around the mood; what follows starts below it */}
          <div className="clear-both" />

          {/* perspectives: each person's own text, in their colour (only here, not on the timeline cards) */}
          {memory.perspectives?.length > 0 && (
            <div className="space-y-4 mb-8">
              {memory.perspectives.map((p) => {
                const author = person(p.author_id);
                return (
                  <section key={p.author_id} className="p-4 rounded-2xl border-2" style={boxStyle(author.color)} data-testid="perspective" aria-label={`Aus ${possessive(author.name)} Sicht`}>
                    <h2 className="text-sm font-semibold text-gray-800 mb-1">Aus {possessive(author.name)} Sicht</h2>
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed"><Marked text={p.text} words={words} /></p>
                  </section>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* the server sends the photos already in their order */}
            {memory.images?.map((image) => (
                <div
                  key={image.id}
                  onClick={() => open(image.id)}
                  className="cursor-zoom-in group"
                  data-testid="detail-photo"
                >
                  <ImageComponent filename={image.filename} title={memory.title} />
                </div>
              ))}
          </div>

          {/* places, after the photos: tapping one shows it on the Karte; the small map shows them all
              (a still picture – tapping it opens the Karte with this memory's places highlighted) */}
          {memoryPlaces.length > 0 && (
            <div className="mt-8 space-y-3" data-testid="memory-places">
              <div className="flex flex-wrap gap-1.5" aria-label="Orte">
                {memoryPlaces.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => navigate(book.path(`/karte?ort=${place.id}`))}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-sm font-medium hover:bg-purple-200"
                  >
                    <MapPin className="w-3.5 h-3.5" /> {place.name}
                  </button>
                ))}
              </div>
              <Suspense fallback={<div className="h-36 sm:h-44 w-full sm:max-w-xl rounded-2xl bg-purple-50" />}>
                <PlacesMiniMap places={memoryPlaces} onOpen={() => navigate(book.path(`/karte?erinnerung=${memory.id}`))} />
              </Suspense>
            </div>
          )}
        </motion.div>
            </div>
            <div className={`col-start-1 row-start-1 backface-hidden rotate-y-180 ${!turning && !flipped ? 'invisible h-0 overflow-hidden' : ''}`} inert={!flipped}>
              <MemoryHistory memory={memory} active={flipped} onClose={historyParam.close} />
            </div>
          </div>
        </div>

        {/* Lower Navigation Buttons */}
        <div className="flex justify-between mt-10">
          <button
            onClick={() => navigate(book.path(`/memory/${memories[memoryIndex + 1]?.id}`) + suffix, keepFrom)}
            className={`px-4 py-2 rounded-xl font-semibold flex items-center transition ${
              memoryIndex < memories.length - 1
                ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
            disabled={memoryIndex >= memories.length - 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Vorherige
          </button>

          <button
            onClick={() => navigate(book.path(`/memory/${memories[memoryIndex - 1]?.id}`) + suffix, keepFrom)}
            className={`px-4 py-2 rounded-xl font-semibold flex items-center transition ${
              memoryIndex > 0
                ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
            disabled={memoryIndex <= 0}
          >
            Nächste <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>

      {/* full-screen photo: swiping goes through this memory's photos */}
      {viewerIndex >= 0 && (
        <PhotoViewer
          photos={viewerPhotos}
          index={viewerIndex}
          onIndexChange={(i) => show(viewerPhotos[i].image.id)}
          onClose={close}
        />
      )}
    </>
  );
};

export default MemoryDetail;
