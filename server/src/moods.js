// Mood groups: which emoji belongs to which of the six fixed groups (table mood_emojis, edited on
// ⋮ → "Stimmungen bearbeiten"). The groups' names, patterns and lightness live in the app
// (client/src/moods.js); the server only knows their keys.

const MOOD_GROUPS = ['gluecklich', 'verliebt', 'entspannt', 'abenteuer', 'nachdenklich', 'schwierig'];
const MAX_MOOD_LENGTH = 32; // like memories.mood (counted like Postgres: "👨‍👩‍👧‍👦" is 7)

// Is `text` exactly one emoji? Returns the cleaned-up emoji, or null. The same check as the app's
// "Anderes Emoji…" field (client/src/moods.js: asSingleEmoji).
const singleEmoji = (text) => {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value || [...value].length > MAX_MOOD_LENGTH) return null;
  const graphemes = [...new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(value)];
  if (graphemes.length !== 1) return null;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(value) ? value : null;
};

// Checks { emoji, group, move } for adding an emoji to a group
const validateMoodEmoji = (body) => {
  const emoji = singleEmoji(body?.emoji);
  if (!emoji) return { error: 'Bitte genau ein Emoji eingeben.' };
  if (!MOOD_GROUPS.includes(body?.group)) return { error: 'Unbekannte Stimmungsgruppe.' };
  return { emoji, group: body.group, move: body.move === true };
};

module.exports = { MOOD_GROUPS, singleEmoji, validateMoodEmoji };
