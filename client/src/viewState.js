// What the views of a storybook (Zeitstrahl, Fotos, later Karte) share:
//   - the order, newest or oldest first – switched in the navigation bar, remembered on this
//     device (for all storybooks and views)
//   - search and filters, kept in the address (?q=...&tag=...&jahr=...&kapitel=...), so that
//     "back" from a memory and switching between the views keep them
//   - what can be filtered by (all tags, years with memories, Kapitel + "Davor")
//   - coming from a link like /b/1#erinnerung-5: jumping there (then the #... is removed)
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { phaseOf, sortPhases } from './phases';
import { applyFilters, filtersFromParams, isFiltering, paramsFromFilters, searchWords } from './search';
import { scrollToElement } from './components/home/TimelineNav';

const readOrder = () => {
  try {
    return localStorage.getItem('timelineOrder') === 'oldest' ? 'oldest' : 'newest';
  } catch {
    return 'newest';
  }
};

// The search/filter part of the current address ("?q=konzert&tag=3", or ""), for links between
// the views and to memories. Other parameters (e.g. the open photo) are left out.
export const filterSuffix = (searchParams) => {
  const params = paramsFromFilters(filtersFromParams(searchParams)).toString();
  return params ? `?${params}` : '';
};

export const useViewState = (memories, phasesOfBook, tagsOfBook) => {
  const navigate = useNavigate();
  const { hash, pathname, search } = useLocation();

  const [order, setOrder] = useState(readOrder);
  const toggleOrder = () => {
    const next = order === 'oldest' ? 'newest' : 'oldest';
    setOrder(next);
    try {
      localStorage.setItem('timelineOrder', next);
    } catch {
      // not important if this can't be saved
    }
    window.scrollTo({ top: 0 }); // start reading from the top in the new order
  };

  // Changing search/filters starts again at the top
  const [searchParams, setSearchParams] = useSearchParams();
  // recomputed only when the filters change (not e.g. when another photo is opened: ?foto=...)
  const suffix = filterSuffix(searchParams);
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(suffix)), [suffix]);
  const changeFilters = (next) => {
    setSearchParams(paramsFromFilters(next), { replace: true });
    window.scrollTo({ top: 0 });
  };
  const words = useMemo(() => searchWords(filters.query), [filters.query]);

  const options = useMemo(() => {
    const sorted = sortPhases(phasesOfBook);
    const hasBefore = sorted.length > 0 && memories.some((m) => !phaseOf(m, sorted));
    const kapitel = [
      ...(hasBefore ? [{ key: 'davor', label: 'Davor', title: 'Vor dem ersten Kapitel' }] : []),
      ...sorted.map((p) => ({ key: p.id, label: `${p.emoji || '📖'} ${p.title}`, title: p.title })),
    ];
    const years = [...new Set(memories.map((m) => Number(m.date.slice(0, 4))))].sort((a, b) => b - a);
    return { tags: tagsOfBook, years, kapitel: order === 'oldest' ? kapitel : kapitel.reverse() };
  }, [memories, phasesOfBook, tagsOfBook, order]);

  const shown = useMemo(() => applyFilters(memories, filters, phasesOfBook), [memories, filters, phasesOfBook]);

  // Coming from a link with #...: jump there, then remove the #... from the address (so switching
  // the order later doesn't jump back)
  useEffect(() => {
    if (!hash) return undefined;
    const frame = requestAnimationFrame(() => {
      scrollToElement(decodeURIComponent(hash.slice(1)), { smooth: false });
      navigate(pathname + search, { replace: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, pathname, search, navigate]);

  return {
    order, toggleOrder, filters, filtering: isFiltering(filters), changeFilters, words, options, shown,
    suffix,
  };
};
