import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Search, X } from 'lucide-react';
import { filterCount, isFiltering, NO_FILTERS } from '../../search';
import { memoriesText } from '../../phases';
import { closestIndex, phasePeriodText, sortPhases } from '../../phases';

// Navigation bar above the timeline (stays at the top while scrolling):
//   row 1  the Kapitel, in reading order (only if there are Kapitel)
//   row 2  the years, each once – and ⤒ (to the top), ⤓ (to the end), ∨ (more)
//   ∨ opens a panel with the search, the filters (tags, years, Kapitel) and the order switch
//   (with 2+ tags chosen also: memories with one of them or with all of them);
//   ∧ closes it. While a search/filter is active and the panel is closed, a slim line shows it.
// It highlights the Kapitel and the year of the memory you're looking at (the topmost one that's
// still visible below the bar). Tapping a Kapitel or year jumps to its memory closest to where you are
// (closestIndex in phases.js), as if you had scrolled there.
//
// list: the memories in reading order; years/phases: yearRanges()/phaseRanges() of that list.
// Used by the Zeitstrahl and the Fotos view: `anchors` says where a memory and a year are on the
// page (element IDs), `resultText`/`hitsText` what is counted (default: memories).
// The Karte uses it to pick instead: with `onPick(kind, range)` ('kapitel' | 'year'), tapping a
// chip picks it (`picked` = { kind, key } is highlighted) instead of scrolling, and ⤒ ⤓ are hidden.

export const NAV_ID = 'timeline-nav';
export const memoryAnchor = (memory) => `erinnerung-${memory.id}`;
export const yearAnchor = (year) => `jahr-${year}`;
const TIMELINE_ANCHORS = { memory: memoryAnchor, year: yearAnchor };

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Position of an element on the page, without its fade-in movement (offsetTop ignores transforms;
// a memory card that hasn't faded in yet is still 20 px lower)
const pageTop = (element) => {
  let top = 0;
  for (let e = element; e; e = e.offsetParent) top += e.offsetTop;
  return top;
};

// Scroll so that the element is just below the navigation bar
export const scrollToElement = (id, { smooth = true } = {}) => {
  const element = document.getElementById(id);
  if (!element) return;
  const barHeight = document.getElementById(NAV_ID)?.getBoundingClientRect().height ?? 0;
  const top = pageTop(element) - barHeight - 12;
  window.scrollTo({ top: Math.max(0, top), behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
};

const chipClass = (active, disabled) =>
  `shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition max-w-[13rem] truncate ${
    active
      ? 'bg-purple-600 border-purple-600 text-white shadow'
      : disabled
        ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-default'
        : 'bg-white border-purple-200 text-purple-800 hover:bg-purple-50'
  }`;
const iconButton =
  'shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-purple-200 bg-white text-purple-700 hover:bg-purple-50';
const iconButtonActive =
  'shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-purple-600 bg-purple-600 text-white hover:bg-purple-700';

// One sideways-scrolling row of chips that keeps the highlighted chip visible
function ChipRow({ label, children, activeKey }) {
  const rowRef = useRef(null);
  useEffect(() => {
    const row = rowRef.current;
    const chip = activeKey != null && row?.querySelector(`[data-key="${activeKey}"]`);
    if (!chip) return;
    const left = chip.offsetLeft - row.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2;
    row.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [activeKey]);
  return (
    <div ref={rowRef} role="group" aria-label={label} className="flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar">
      {children}
    </div>
  );
}

// A chip that switches a filter on/off
const FilterChip = ({ on, onClick, children, title }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    title={title}
    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition max-w-[13rem] truncate ${
      on ? 'bg-fuchsia-600 border-fuchsia-600 text-white' : 'bg-white border-fuchsia-200 text-fuchsia-800 hover:bg-fuchsia-50'
    }`}
  >
    {on && '✓ '}
    {children}
  </button>
);

const FilterGroup = ({ label, children }) => (
  <div className="flex items-center gap-2">
    <span className="w-14 shrink-0 text-xs font-semibold text-gray-500">{label}</span>
    <div role="group" aria-label={`Filter ${label}`} className="flex flex-1 min-w-0 gap-1.5 overflow-x-auto no-scrollbar">
      {children}
    </div>
  </div>
);

// list/years/phases: the memories that are shown (after search/filters) and their ranges.
// filters, onFiltersChange: see search.js; options: what can be filtered by ({ tags, years, kapitel });
// total: number of memories without filters.
export default function TimelineNav({
  list, years, phases, allPhases, order, onToggleOrder, filters, onFiltersChange, options, total,
  anchors = TIMELINE_ANCHORS, resultText, hitsText, onPick, picked,
}) {
  const [open, setOpen] = useState(false); // the panel with search, filters and order
  const barRef = useRef(null);
  // position (in list) of the memory you're looking at: the topmost one that's still visible
  // below the bar (also when part of it is already hidden behind the bar)
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (barRef.current?.getBoundingClientRect().bottom ?? 0) + 8;
      const bottom = (i) => document.getElementById(anchors.memory(list[i]))?.getBoundingClientRect().bottom ?? -Infinity;
      // the first memory whose bottom is still below the bar (binary search: the cards are in page order)
      let low = 0;
      let high = list.length - 1;
      let found = list.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (bottom(mid) > line) {
          found = mid;
          high = mid - 1;
        } else low = mid + 1;
      }
      setCurrent(found);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // also when the page changes size without scrolling (e.g. the photo rows appear once their
    // width is known, or photos load)
    const observer = new ResizeObserver(onScroll);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [list, anchors]);

  if (total === 0) return null;

  // Jump to a memory: to its year divider if it's the first of its year in reading order
  const jumpTo = (index) => {
    if (index == null) return;
    const year = years.find((y) => y.first === index);
    scrollToElement(year ? anchors.year(year.year) : anchors.memory(list[index]));
  };

  const inRange = (range) => range.first !== null && current >= range.first && current <= range.last;
  const phaseKey = (range) => range.phase?.id ?? 'davor';
  const activePhase = onPick
    ? phases.find((r) => picked?.kind === 'kapitel' && phaseKey(r) === picked.key)
    : phases.find(inRange);
  const activeYear = onPick ? years.find((r) => picked?.kind === 'year' && r.year === picked.key) : years.find(inRange);
  const sorted = sortPhases(allPhases);
  const newestFirst = order !== 'oldest';
  const filtering = isFiltering(filters);
  const count = filterCount(filters);

  const toggle = (group, value) => {
    const values = filters[group];
    onFiltersChange({ ...filters, [group]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value] });
  };
  const reset = () => onFiltersChange(NO_FILTERS);

  return (
    <nav
      id={NAV_ID}
      ref={barRef}
      aria-label="Zeitstrahl-Navigation"
      className="sticky top-0 z-30 -mx-4 px-4 py-2 mb-6 bg-white/90 backdrop-blur-md border-b border-purple-100 space-y-1.5"
    >
      {phases.length > 0 && (
        <ChipRow label="Kapitel" activeKey={activePhase && (activePhase.phase?.id ?? 'davor')}>
          {phases.map((range) => {
            const key = range.phase?.id ?? 'davor';
            const empty = range.first === null;
            return (
              <button
                key={key}
                type="button"
                data-key={key}
                disabled={empty}
                onClick={() => (onPick ? onPick('kapitel', range) : jumpTo(closestIndex(range, current)))}
                className={chipClass(activePhase === range, empty)}
                aria-current={!onPick && activePhase === range ? 'location' : undefined}
                aria-pressed={onPick ? activePhase === range : undefined}
                title={
                  range.phase
                    ? `${range.phase.title} · ${phasePeriodText(range.phase, sorted)}${empty ? ' · keine Erinnerungen' : ''}`
                    : 'Vor dem ersten Kapitel'
                }
              >
                {range.phase ? `${range.phase.emoji || '📖'} ${range.phase.title}` : 'Davor'}
              </button>
            );
          })}
        </ChipRow>
      )}
      <div className="flex items-center gap-1.5">
        <ChipRow label="Jahre" activeKey={activeYear?.year}>
          {years.map((range) => (
            <button
              key={range.year}
              type="button"
              data-key={range.year}
              onClick={() => (onPick ? onPick('year', range) : jumpTo(closestIndex(range, current)))}
              className={chipClass(activeYear === range, false)}
              aria-current={!onPick && activeYear === range ? 'location' : undefined}
              aria-pressed={onPick ? activeYear === range : undefined}
            >
              {range.year}
            </button>
          ))}
        </ChipRow>
        {!onPick && (<>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })}
          className={iconButton}
          title={newestFirst ? 'Nach oben (neueste Erinnerung)' : 'Nach oben (älteste Erinnerung)'}
          aria-label="Nach oben"
        >
          <ChevronsUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => jumpTo(list.length - 1)}
          disabled={list.length === 0}
          className={iconButton}
          title={newestFirst ? 'Zum Ende (älteste Erinnerung)' : 'Zum Ende (neueste Erinnerung)'}
          aria-label="Zum Ende"
        >
          <ChevronsDown className="w-4 h-4" />
        </button>
        </>)}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`${open ? iconButtonActive : iconButton} relative`}
          aria-expanded={open}
          aria-label={open ? 'Suche und Filter schließen' : 'Suche, Filter und Reihenfolge'}
          title={open ? 'Schließen' : 'Suche, Filter und Reihenfolge'}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {filtering && !open && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-fuchsia-500 border-2 border-white" />}
        </button>
      </div>

      {/* closed, but searching/filtering: a slim line that shows it (tap opens the panel) */}
      {filtering && !open && (
        <div className="flex items-center gap-2 text-xs text-fuchsia-900 bg-fuchsia-50 border border-fuchsia-200 rounded-full pl-3 pr-1 py-0.5" data-testid="filter-line">
          <button type="button" onClick={() => setOpen(true)} className="flex-1 min-w-0 truncate text-left">
            {filters.query.trim() && <>🔍 „{filters.query.trim()}“ · </>}
            {count > 0 && <>{count} Filter{filters.allTags && filters.tags.length > 1 ? ' (alle Tags)' : ''} · </>}
            {hitsText ?? (list.length === 1 ? '1 Treffer' : `${list.length} Treffer`)}
          </button>
          <button type="button" onClick={reset} className="p-1 rounded-full hover:bg-fuchsia-100" aria-label="Suche und Filter zurücksetzen">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {open && (
        <div className="pt-1.5 pb-1 space-y-2.5 max-h-[60vh] overflow-y-auto" data-testid="nav-panel">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
            <input
              type="search"
              value={filters.query}
              onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
              placeholder="Suchen in Titeln, Texten, Stimmungen …"
              aria-label="Suchen"
              enterKeyHint="search"
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-purple-200 bg-white text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-400"
            />
            {filters.query && (
              <button type="button" onClick={() => onFiltersChange({ ...filters, query: '' })} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700" aria-label="Suche leeren">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {options.tags.length > 0 && (
            <FilterGroup label="Tags">
              {options.tags.map((tag) => (
                <FilterChip key={tag.id} on={filters.tags.includes(tag.id)} onClick={() => toggle('tags', tag.id)}>{tag.name}</FilterChip>
              ))}
            </FilterGroup>
          )}
          {/* with 2 or more tags chosen: memories with one of them, or with all of them? */}
          {filters.tags.length > 1 && (
            <div className="flex items-center gap-2 pl-16 text-xs text-gray-500">
              <span>Erinnerungen mit</span>
              <div role="radiogroup" aria-label="Tags verknüpfen" className="flex rounded-full border border-fuchsia-200 overflow-hidden">
                {[[false, 'einem der Tags'], [true, 'allen Tags']].map(([all, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={filters.allTags === all}
                    onClick={() => onFiltersChange({ ...filters, allTags: all })}
                    className={`px-2.5 py-1 font-medium transition ${
                      filters.allTags === all ? 'bg-fuchsia-600 text-white' : 'bg-white text-fuchsia-800 hover:bg-fuchsia-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <FilterGroup label="Jahre">
            {options.years.map((year) => (
              <FilterChip key={year} on={filters.years.includes(year)} onClick={() => toggle('years', year)}>{year}</FilterChip>
            ))}
          </FilterGroup>
          {options.kapitel.length > 0 && (
            <FilterGroup label="Kapitel">
              {options.kapitel.map((k) => (
                <FilterChip key={k.key} on={filters.kapitel.includes(k.key)} onClick={() => toggle('kapitel', k.key)} title={k.title}>{k.label}</FilterChip>
              ))}
            </FilterGroup>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={onToggleOrder}
              className="shrink-0 h-8 px-2.5 flex items-center justify-center gap-1 rounded-full border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 text-xs font-semibold"
              title={newestFirst ? 'Jetzt: neueste zuerst – umdrehen' : 'Jetzt: älteste zuerst – umdrehen'}
              aria-label={newestFirst ? 'Reihenfolge: neueste zuerst. Umdrehen' : 'Reihenfolge: älteste zuerst. Umdrehen'}
            >
              <ArrowDownUp className="w-3.5 h-3.5" />
              {newestFirst ? 'Neu → Alt' : 'Alt → Neu'}
            </button>
            <span className="flex-1 text-xs text-gray-500 text-right" data-testid="result-count">
              {resultText ?? (filtering ? `${list.length} von ${memoriesText(total)}` : memoriesText(total))}
            </span>
            {filtering && (
              <button type="button" onClick={reset} className="text-xs font-semibold text-fuchsia-700 underline">
                Zurücksetzen
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
