// Search and filters of the timeline (step 8). Everything happens in the app: all memories are
// loaded anyway, so searching is instant.
//
// Search: titles, texts, perspectives, place names and moods (emoji). Upper/lower case and accents don't matter, and umlauts
// may be typed as ae/oe/ue ("muenchen", "munchen" and "München" all find "München"; "strasse"
// finds "Straße"). With several words, all of them must appear (anywhere, in any order).
// Filters: tags, years, Kapitel – within a group any chosen one counts, the groups combine.
// For tags you can switch to "all chosen tags" instead (allTags).
// The search only looks at the memories the filters leave.
import { phaseOf } from './phases.js';

// ---------------------------------------------------------------------------------------------
// Normalizing text for comparing: lower case, ß -> ss, without accents (é -> e, ä -> a), and
// ae/oe/ue -> a/o/u. Also returns, for every character of the result, where it came from in the
// original text (start/end), so that matches can be highlighted in the original text.
// ---------------------------------------------------------------------------------------------
export const normalize = (text) => {
  const chars = [];
  const starts = [];
  const ends = [];
  let index = 0;
  for (const char of String(text ?? '')) {
    const from = index;
    index += char.length;
    let folded = char.toLowerCase();
    if (folded === 'ß') folded = 'ss';
    folded = folded.normalize('NFD').replace(/\p{M}/gu, ''); // remove accents (and emoji variation marks)
    for (const c of folded) {
      // ae/oe/ue -> a/o/u: the "e" is dropped and the previous letter covers both original letters
      if (c === 'e' && /[aou]/.test(chars.at(-1) ?? '') && ends.at(-1) === from) {
        ends[ends.length - 1] = index;
        continue;
      }
      chars.push(c);
      starts.push(from);
      ends.push(index);
    }
  }
  return { text: chars.join(''), starts, ends };
};

// The words of a search ("Konzert  Hamburg" -> ['konzert', 'hamburg'])
export const searchWords = (query) => normalize(query).text.split(/\s+/).filter(Boolean);

const searchCache = new WeakMap(); // memory -> its normalized text (computed once per memory)
const searchText = (memory) => {
  let text = searchCache.get(memory);
  if (text === undefined) {
    const perspectives = (memory.perspectives ?? []).map((p) => p.text).join('\n');
    const places = (memory.place_names ?? []).join('\n');
    text = normalize(`${memory.title}\n${memory.content ?? ''}\n${memory.mood ?? ''}\n${perspectives}\n${places}`).text;
    searchCache.set(memory, text);
  }
  return text;
};

// Does the memory contain all words?
export const matchesSearch = (memory, words) => words.every((word) => searchText(memory).includes(word));

// Splits a text into parts to show, marking where the search words are:
//   highlight('Das Konzert', ['konzert']) -> [{ text: 'Das ', mark: false }, { text: 'Konzert', mark: true }]
export const highlight = (text, words) => {
  const original = String(text ?? '');
  if (!words.length || !original) return [{ text: original, mark: false }];
  const { text: norm, starts, ends } = normalize(original);
  const ranges = [];
  for (const word of words) {
    for (let at = norm.indexOf(word); at !== -1; at = norm.indexOf(word, at + 1)) {
      ranges.push([starts[at], ends[at + word.length - 1]]);
    }
  }
  if (!ranges.length) return [{ text: original, mark: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (const [from, to] of ranges.slice(1)) {
    if (from <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(merged.at(-1)[1], to);
    else merged.push([from, to]);
  }
  const parts = [];
  let pos = 0;
  for (const [from, to] of merged) {
    if (from > pos) parts.push({ text: original.slice(pos, from), mark: false });
    parts.push({ text: original.slice(from, to), mark: true });
    pos = to;
  }
  if (pos < original.length) parts.push({ text: original.slice(pos), mark: false });
  return parts;
};

// The part of a memory's text to show on a timeline card (at most `max` characters). Without
// search: the beginning. With search: if the first match is further in, the passage around it.
export const excerpt = (text, words, max = 150) => {
  const original = String(text ?? '');
  if (original.length <= max) return original;
  let at = -1;
  if (words.length) {
    const { text: norm, starts } = normalize(original);
    const found = words.map((w) => norm.indexOf(w)).filter((i) => i !== -1);
    if (found.length) at = starts[Math.min(...found)];
  }
  if (at === -1 || at < max - 40) return original.slice(0, max) + '...';
  let from = Math.max(0, at - 50);
  const space = original.lastIndexOf(' ', from + 10);
  if (space > from - 20 && space > 0) from = space + 1; // start at a word
  const end = Math.min(original.length, from + max);
  return `…${original.slice(from, end)}${end < original.length ? '…' : ''}`;
};

// ---------------------------------------------------------------------------------------------
// Filters and search together. `filters` = { query, tags: [ids], allTags, years: [numbers],
// kapitel: [ids or 'davor'] } (see filtersFromParams). allTags: a memory needs all chosen tags
// (otherwise one of them is enough). Returns the memories that remain,
// in the same order as given.
// ---------------------------------------------------------------------------------------------
export const applyFilters = (memories, filters, phases) => {
  const { tags = [], allTags = false, years = [], kapitel = [] } = filters;
  const words = searchWords(filters.query ?? '');
  return memories.filter((memory) => {
    const hasTag = (tag) => memory.tag_ids?.includes(tag);
    if (tags.length && !(allTags ? tags.every(hasTag) : tags.some(hasTag))) return false;
    if (years.length && !years.includes(Number(memory.date.slice(0, 4)))) return false;
    if (kapitel.length && !kapitel.includes(phaseOf(memory, phases)?.id ?? 'davor')) return false;
    return words.length === 0 || matchesSearch(memory, words);
  });
};

// Filters <-> address (so "back" and links keep them): ?q=konzert&tag=3,5&tagmodus=alle&jahr=2024&kapitel=2,davor
const list = (value) => (value ? value.split(',').filter(Boolean) : []);
export const filtersFromParams = (params) => ({
  query: params.get('q') ?? '',
  tags: list(params.get('tag')).map(Number).filter(Number.isInteger),
  allTags: params.get('tagmodus') === 'alle',
  years: list(params.get('jahr')).map(Number).filter(Number.isInteger),
  kapitel: list(params.get('kapitel')).map((k) => (k === 'davor' ? 'davor' : Number(k))).filter((k) => k === 'davor' || Number.isInteger(k)),
});
export const paramsFromFilters = ({ query, tags, allTags, years, kapitel }) => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (tags?.length) params.set('tag', tags.join(','));
  if (tags?.length && allTags) params.set('tagmodus', 'alle');
  if (years?.length) params.set('jahr', years.join(','));
  if (kapitel?.length) params.set('kapitel', kapitel.join(','));
  return params;
};

// How many filters are chosen (for "2 Filter")
export const filterCount = ({ tags, years, kapitel }) => (tags?.length ?? 0) + (years?.length ?? 0) + (kapitel?.length ?? 0);
// No search, no filters
export const NO_FILTERS = { query: '', tags: [], allTags: false, years: [], kapitel: [] };

export const isFiltering = (filters) => Boolean(filters.query?.trim()) || filterCount(filters) > 0;
