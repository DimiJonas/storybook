// "Unser Jahr" (step 12): what the yearly review shows, worked out from the loaded memories.
// A memory belongs to the year of its first day (as in the timeline and the year filter).
import { daysBetween, memoryDays, toDateText } from './dates.js';
import { coverPhoto } from './photos.js';

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const HIGHLIGHT_FALLBACK = 3; // without 👑: this many memories with the most photos
const YEAR_PHOTOS = 12; // "Fotos des Jahres"
const TOP_PLACES = 5;

export const yearOf = (memory) => Number(memory.date.slice(0, 4));
const byDate = (a, b) => a.date.localeCompare(b.date) || a.id - b.id; // oldest first

// The years that have memories, newest first: [{ year, memories, photos, highlights, cover }]
// (cover: the cover photo of its first highlight – or of its memory with the most photos)
export const reviewYears = (memories) => {
  const years = new Map();
  for (const memory of memories) {
    const year = yearOf(memory);
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(memory);
  }
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => {
      const sorted = [...list].sort(byDate);
      const pick = sorted.find((m) => m.highlight && m.images?.length) ?? [...sorted].sort(mostPhotos)[0];
      return {
        year,
        memories: list.length,
        photos: list.reduce((n, m) => n + (m.images?.length ?? 0), 0),
        highlights: list.filter((m) => m.highlight).length,
        cover: pick && coverPhoto(pick) ? { image: coverPhoto(pick), memory: pick } : null,
      };
    });
};

// most photos first, then the longer text, then the older one
const mostPhotos = (a, b) =>
  (b.images?.length ?? 0) - (a.images?.length ?? 0) || (b.content?.length ?? 0) - (a.content?.length ?? 0) || byDate(a, b);

// The days a list of memories covers (each day once; a memory of several days counts every day)
const dayCount = (list) => {
  const days = new Set();
  for (const memory of list) {
    const { start, end } = memoryDays(memory);
    const count = daysBetween(start, end) + 1;
    for (let i = 0; i < count; i += 1) days.add(toDateText(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  }
  return days.size;
};

// The numbers of a year's memories
const numbersOf = (list) => {
  const places = new Set(list.flatMap((m) => m.place_ids ?? []));
  return {
    memories: list.length,
    photos: list.reduce((n, m) => n + (m.images?.length ?? 0), 0),
    places: places.size,
    days: dayCount(list),
  };
};

// The 3 moods used most: [{ mood, count }] (equal counts: the one used first in the year first)
const topMoods = (list) => {
  const counts = new Map();
  for (const memory of [...list].sort(byDate)) {
    if (memory.mood) counts.set(memory.mood, (counts.get(memory.mood) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([mood, count], order) => ({ mood, count, order }))
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, 3)
    .map(({ mood, count }) => ({ mood, count }));
};

// Everything the review of `year` shows (null if the year has no memories):
//   numbers      { memories, photos, places, days }
//   previous     the same for the year before, or null if that year has no memories
//   moods        [{ mood, count }]  the 3 used most
//   busiestMonth { month (0–11), count } – the month with the most memories (equal: the earlier)
//   highlights   the memories marked 👑, oldest first; markedHighlights = false if none are marked
//                and these are instead the 3 with the most photos
//   months       12 × { month, count, first (its oldest memory, for "show in the timeline"), cover }
//   places       [{ place, count }] the places with the most memories (at most 5), and allPlaces
//                (every place of the year, for the small map)
//   people       [{ user, memories, perspectives }] what each of you wrote this year
//   photos       up to 12 [{ image, memory }] for "Fotos des Jahres": the highlights' cover photos
//                first, then the cover photos of the memories with the most photos, then more
//                photos of those – shown in the order of the year
// users: [{ id, name, color }]; places: the storybook's places [{ id, name, latitude, longitude }]
export const yearReview = (memories, year, { users = [], places = [] } = {}) => {
  const list = memories.filter((m) => yearOf(m) === year).sort(byDate);
  if (list.length === 0) return null;
  const before = memories.filter((m) => yearOf(m) === year - 1);

  // months
  const months = MONTHS.map((_, month) => ({ month, count: 0, first: null, cover: null }));
  for (const memory of list) {
    const entry = months[Number(memory.date.slice(5, 7)) - 1];
    entry.count += 1;
    entry.first ??= memory;
  }
  for (const entry of months) {
    const inMonth = list.filter((m) => Number(m.date.slice(5, 7)) - 1 === entry.month && m.images?.length);
    const pick = inMonth.find((m) => m.highlight) ?? [...inMonth].sort(mostPhotos)[0];
    entry.cover = pick ? { image: coverPhoto(pick), memory: pick } : null;
  }
  const busiest = months.reduce((best, m) => (m.count > best.count ? m : best), months[0]);

  // highlights
  const marked = list.filter((m) => m.highlight);
  const highlights = marked.length ? marked : [...list].sort(mostPhotos).slice(0, HIGHLIGHT_FALLBACK).sort(byDate);

  // places
  const placeById = new Map(places.map((p) => [p.id, p]));
  const placeCounts = new Map();
  for (const memory of list) {
    for (const id of new Set(memory.place_ids ?? [])) {
      if (placeById.has(id)) placeCounts.set(id, (placeCounts.get(id) ?? 0) + 1);
    }
  }
  const allPlaces = [...placeCounts.entries()]
    .map(([id, count]) => ({ place: placeById.get(id), count }))
    .sort((a, b) => b.count - a.count || a.place.name.localeCompare(b.place.name, 'de'));

  // the two of you
  const people = users.map((user) => ({
    user,
    memories: list.filter((m) => m.user_id === user.id).length,
    perspectives: list.filter((m) => (m.perspectives ?? []).some((p) => p.author_id === user.id && p.text)).length,
  }));

  // photos of the year
  const chosen = [];
  const take = (memory, image) => {
    if (chosen.length < YEAR_PHOTOS && image && !chosen.some((p) => p.image.id === image.id)) chosen.push({ image, memory });
  };
  for (const memory of marked) take(memory, coverPhoto(memory));
  const others = list.filter((m) => !m.highlight && m.images?.length).sort(mostPhotos);
  for (const memory of others) take(memory, coverPhoto(memory));
  // still room: more photos, taking turns between the memories (highlights first)
  const rest = [...marked, ...others].map((m) => (m.images ?? []).map((image) => ({ memory: m, image })));
  for (let round = 0; chosen.length < YEAR_PHOTOS && rest.some((r) => r.length > round); round += 1) {
    for (const photos of rest) if (photos[round]) take(photos[round].memory, photos[round].image);
  }
  const position = new Map(list.map((m, i) => [m.id, i]));
  const photoIndex = (p) => p.memory.images.findIndex((i) => i.id === p.image.id);
  chosen.sort((a, b) => position.get(a.memory.id) - position.get(b.memory.id) || photoIndex(a) - photoIndex(b));

  return {
    year,
    numbers: numbersOf(list),
    previous: before.length ? numbersOf(before) : null,
    moods: topMoods(list),
    busiestMonth: { month: busiest.month, count: busiest.count },
    highlights,
    markedHighlights: marked.length > 0,
    months,
    places: allPlaces.slice(0, TOP_PLACES),
    allPlaces: allPlaces.map((p) => p.place),
    people,
    photos: chosen,
  };
};

// "+5 gegenüber 2024", "−3 gegenüber 2024", "so viele wie 2024"
export const comparisonText = (now, before, year) => {
  const diff = now - before;
  if (diff === 0) return `so viele wie ${year - 1}`;
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} gegenüber ${year - 1}`;
};
