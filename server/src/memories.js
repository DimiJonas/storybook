// Checking what the app sends for a memory before it goes into the database, so wrong input
// gets a clear German message (400) instead of a database error ("Server error", 500).

const MAX_TITLE_LENGTH = 255; // the column has room for 255 characters
const MAX_CONTENT_LENGTH = 100000;
// A mood is one emoji, stored in a column with room for 32 characters
// (counted like Postgres does: "👨‍👩‍👧‍👦" is 7 characters)
const MAX_MOOD_LENGTH = 32;

// Characters as Postgres counts them (an emoji is 1, not 2 like JavaScript's .length)
const length = (text) => [...text].length;

// Is this a real day written as "2025-10-22"? (rejects "2025-02-30", "22.10.2025", ...)
const isDateText = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

// Checks a memory from a request body. Returns { error } or { memory } with the values to save.
//   end_date: the last day of a multi-day memory; empty/null for a single day. A range that ends
//   on its first day is saved as a single day. `keepEndDate` is true when the request didn't
//   mention end_date at all (an older app version): then the saved value is kept.
//   tag_ids: the memory's tags (IDs from the storybook's tag list). Not mentioned at all
//   (older app version) -> `keepTags`: the saved tags stay as they are.
//   place_ids: the memory's places, in order (IDs from the storybook's place list). Not mentioned
//   at all (older app version) -> `keepPlaces`: the saved places stay as they are.
//   perspectives: your own perspective, if you changed it: [{ author_id: <you>, text }] – text ''
//   removes it. Only the author may change a perspective (checked in the route); the others' stay
//   as they are.
const validateMemory = (body) => {
  const { title, content, date, mood } = body ?? {};

  if (typeof title !== 'string' || !title.trim()) return { error: 'Bitte gib einen Titel ein.' };
  if (length(title) > MAX_TITLE_LENGTH) {
    return { error: `Der Titel darf höchstens ${MAX_TITLE_LENGTH} Zeichen lang sein.` };
  }
  if (content != null && typeof content !== 'string') return { error: 'Der Text ist ungültig.' };
  if (content && length(content) > MAX_CONTENT_LENGTH) {
    return { error: `Der Text darf höchstens ${MAX_CONTENT_LENGTH} Zeichen lang sein.` };
  }
  if (!isDateText(date)) return { error: 'Bitte wähle ein gültiges Datum.' };
  if (mood != null && (typeof mood !== 'string' || length(mood) > MAX_MOOD_LENGTH)) {
    return { error: 'Die Stimmung muss ein einzelnes Emoji sein.' };
  }

  const keepEndDate = !(body && 'end_date' in body);
  let endDate = keepEndDate ? null : body.end_date;
  if (endDate === '' || endDate === date) endDate = null;
  if (endDate != null) {
    if (!isDateText(endDate)) return { error: 'Bitte wähle einen gültigen letzten Tag.' };
    // "YYYY-MM-DD" texts sort like the dates they stand for
    if (endDate < date) return { error: 'Der letzte Tag muss nach dem ersten Tag liegen.' };
  }

  const keepTags = !(body && 'tag_ids' in body);
  const tagIds = keepTags ? [] : body.tag_ids;
  if (!Array.isArray(tagIds) || tagIds.length > 500 || !tagIds.every((t) => Number.isInteger(t) && t > 0)) {
    return { error: 'Die Tags sind ungültig.' };
  }

  const keepPlaces = !(body && 'place_ids' in body);
  const placeIds = keepPlaces ? [] : body.place_ids;
  if (!Array.isArray(placeIds) || placeIds.length > 50 || !placeIds.every((t) => Number.isInteger(t) && t > 0)) {
    return { error: 'Die Orte sind ungültig.' };
  }

  const perspectives = body && 'perspectives' in body ? body.perspectives : [];
  if (!Array.isArray(perspectives) || perspectives.length > 50) return { error: 'Die Perspektiven sind ungültig.' };
  for (const p of perspectives) {
    if (!p || !Number.isInteger(p.author_id) || p.author_id < 1 || typeof p.text !== 'string') {
      return { error: 'Die Perspektiven sind ungültig.' };
    }
    if (length(p.text) > MAX_CONTENT_LENGTH) {
      return { error: `Eine Perspektive darf höchstens ${MAX_CONTENT_LENGTH} Zeichen lang sein.` };
    }
  }
  if (new Set(perspectives.map((p) => p.author_id)).size !== perspectives.length) {
    return { error: 'Pro Person gibt es nur eine Perspektive.' };
  }

  return {
    memory: {
      title: title.trim(), content: content ?? '', date, endDate, mood: mood ?? null, keepEndDate,
      tagIds: [...new Set(tagIds)], keepTags,
      placeIds: [...new Set(placeIds)], keepPlaces,
      // blank (only spaces) = remove; otherwise kept as written, without spaces at the end
      perspectives: perspectives.map((p) => ({ authorId: p.author_id, text: p.text.trim() ? p.text.trimEnd() : '' })),
    },
  };
};

module.exports = { isDateText, validateMemory };
