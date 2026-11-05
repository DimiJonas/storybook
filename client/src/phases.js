// Kapitel (life phases, "phases" in the code). A Kapitel lasts from its start date until the day
// before the next Kapitel starts; the newest one lasts "until today". A memory belongs to the
// Kapitel in which its first day (date) falls; memories before the first Kapitel have none.
// Dates are "YYYY-MM-DD" texts, which sort like the dates they stand for.
import { parseDate, toDateText } from './dates.js';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// "1 Erinnerung" / "23 Erinnerungen"
export const memoriesText = (count) => (count === 1 ? '1 Erinnerung' : `${count} Erinnerungen`);

// Oldest first
export const sortPhases = (phases) => [...(phases || [])].sort((a, b) => a.start_date.localeCompare(b.start_date));

// The Kapitel a memory belongs to (or null)
export const phaseOf = (memory, phases) => {
  let found = null;
  for (const phase of sortPhases(phases)) {
    if (phase.start_date <= memory.date) found = phase;
    else break;
  }
  return found;
};

// Last day of a Kapitel ("YYYY-MM-DD"), or null if it's the newest one (it lasts until today)
export const phaseEnd = (phase, phases) => {
  const next = sortPhases(phases).find((p) => p.start_date > phase.start_date);
  if (!next) return null;
  const start = parseDate(next.start_date);
  return toDateText(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1));
};

const monthYear = (text) => {
  const date = parseDate(text);
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

// Period for the Kapitel banner: "Juni 2023 – Mai 2025", "März 2024" (within one month),
// or "seit Juni 2025" for the newest Kapitel
export const phasePeriodText = (phase, phases) => {
  const end = phaseEnd(phase, phases);
  if (!end) return `seit ${monthYear(phase.start_date)}`;
  const from = monthYear(phase.start_date);
  const to = monthYear(end);
  return from === to ? from : `${from} – ${to}`;
};

// ---------------------------------------------------------------------------------------------
// The timeline: the memories in reading order, a divider per year, and for the navigation bar
// where each Kapitel and year lies in that order.
// ---------------------------------------------------------------------------------------------

// order 'newest' (newest first – as the server sends them) or 'oldest' (oldest first)
export const orderMemories = (memories, order) => (order === 'oldest' ? [...memories].reverse() : memories);

// Consecutive memories of the same year (in reading order): [{ year, first, last }] – first/last are
// positions in the list. Each year appears once, because the list is sorted by date.
export const yearRanges = (list) => {
  const years = [];
  list.forEach((memory, index) => {
    const year = Number(memory.date.slice(0, 4));
    if (years.at(-1)?.year === year) years.at(-1).last = index;
    else years.push({ year, first: index, last: index });
  });
  return years;
};

// The Kapitel in reading order with the positions of their memories in the list:
// [{ phase, first, last }] – first/last are null for a Kapitel without memories.
// With memories before the first Kapitel, an entry with phase = null ("Davor") is added.
// A Kapitel's memories are always next to each other in the list (Kapitel are date ranges).
export const phaseRanges = (list, phases, order) => {
  const sorted = sortPhases(phases);
  if (sorted.length === 0) return [];
  const ranges = new Map(sorted.map((phase) => [phase.id, { phase, first: null, last: null }]));
  const before = { phase: null, first: null, last: null };
  list.forEach((memory, index) => {
    const phase = phaseOf(memory, sorted);
    const range = phase ? ranges.get(phase.id) : before;
    if (range.first === null) range.first = index;
    range.last = index;
  });
  const result = [...(before.first !== null ? [before] : []), ...ranges.values()]; // oldest first
  return order === 'oldest' ? result : result.reverse();
};

// Where to jump for a Kapitel/year { first, last }: to its memory closest to where you are
// (position `current` in the list, -1 = above the first memory). Further down: its first one in
// reading order; further up: its last one (as if you scrolled there). Inside it: its first one.
export const closestIndex = (range, current) => {
  if (range.first === null) return null;
  if (current > range.last) return range.last;
  return range.first;
};
