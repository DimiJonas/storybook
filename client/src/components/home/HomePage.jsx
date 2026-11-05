import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import Timeline from './Timeline';
import ImportantDatesCard from './ImportantDatesCard';
import OnThisDayCard from './OnThisDayCard';
import TimelineNav from './TimelineNav';
import AddMemoryButton from '../AddMemoryButton';
import { orderMemories, phaseRanges, yearRanges } from '../../phases';
import { NO_FILTERS } from '../../search';
import { useViewState } from '../../viewState';
import { onThisDay } from '../../dates';
import { useStorybook } from '../../storybook';

const importantDates = [
  { label: 'Erstes Treffen', date: '2023-01-10' },
  { label: 'RSO MCR-T Party', date: '2025-03-28' },
  { label: 'Jahrestag', date: '2025-06-27' },
];

const HomePage = ({ memories }) => {
  const book = useStorybook();

  // Memories from earlier years on today's day (multi-day memories on each of their days)
  const onThisDayEntries = onThisDay(memories, new Date());

  // Order, search and filters (shared with the other views, see viewState.js)
  const { order, toggleOrder, filters, filtering, changeFilters, words, options, shown, suffix } =
    useViewState(memories, book.phases, book.tags);

  // The memories in reading order, where each year and Kapitel lies in it
  const list = useMemo(() => orderMemories(shown, order), [shown, order]);
  const years = useMemo(() => yearRanges(list), [list]);
  const phases = useMemo(() => phaseRanges(list, book.phases, order), [list, book.phases, order]);

  // Hint about Kapitel while there are none (can be closed; remembered on this device)
  const hintKey = `kapitelHintClosed-${book.id}`;
  const [hintClosed, setHintClosed] = useState(() => {
    try {
      return localStorage.getItem(hintKey) === '1';
    } catch {
      return false;
    }
  });
  const closeHint = () => {
    setHintClosed(true);
    try {
      localStorage.setItem(hintKey, '1');
    } catch {
      // not important if this can't be saved
    }
  };
  const showHint = book.phases.length === 0 && memories.length > 0 && !hintClosed && !filtering;

  const handleEditImportantDates = () => {
    // Open modal or navigate to /important-dates for editing
    alert('TODO: Implement editing UI');
  };

  return (
    <div className="container mx-auto px-4 pt-4">
      <TimelineNav
        list={list}
        years={years}
        phases={phases}
        allPhases={book.phases}
        order={order}
        onToggleOrder={toggleOrder}
        filters={filters}
        onFiltersChange={changeFilters}
        options={options}
        total={memories.length}
      />
      <div className="pt-6">
        {!filtering && <OnThisDayCard entries={onThisDayEntries} />}
        {!filtering && <ImportantDatesCard dates={importantDates} onEdit={handleEditImportantDates} />}
        {showHint && (
          <div className="mb-10 flex items-start gap-3 p-4 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900">
            <span className="text-2xl" aria-hidden="true">📚</span>
            <p className="flex-1 text-sm">
              Teilt eure Geschichte in <strong>Kapitel</strong> ein – z. B. „Kennenlernen“, „Zusammenleben“.
              Jedes Kapitel beginnt an einem Tag und dauert bis zum nächsten.{' '}
              <Link to={book.path('/kapitel')} className="font-semibold underline">Kapitel anlegen</Link>
            </p>
            <button type="button" onClick={closeHint} className="text-purple-400 hover:text-purple-700" aria-label="Hinweis schließen">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {filtering && list.length === 0 ? (
          <div className="text-center py-16 text-gray-500" data-testid="no-results">
            <div className="text-4xl mb-3">🔍</div>
            <p className="mb-4">Nichts gefunden.</p>
            <button type="button" onClick={() => changeFilters(NO_FILTERS)} className="px-4 py-2 rounded-xl bg-purple-100 text-purple-800 font-semibold hover:bg-purple-200">
              Suche und Filter zurücksetzen
            </button>
          </div>
        ) : (
          <Timeline list={list} years={years} order={order} words={words} linkSuffix={suffix} />
        )}
      </div>

      <AddMemoryButton />
    </div>
  );
};

export default HomePage;
