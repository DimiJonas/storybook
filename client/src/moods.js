import { useStorybook } from './storybook';

// The six mood groups of the mood picker. The groups are fixed; which emojis belong to them is
// stored per storybook (table mood_emojis, edited on ⋮ → "Stimmungen bearbeiten", loaded by
// StorybookLayout as `book.moods`). A memory just stores the emoji itself, so changing the groups
// never changes a memory – only how it looks. Emojis in no group count as "Anderes".
// `key` is how the server knows the group; pattern and light: see "How a mood shows" below.
export const MOOD_GROUPS = [
  { key: 'gluecklich', label: 'Glücklich', pattern: 'sun', light: 'bright' },
  { key: 'verliebt', label: 'Verliebt', pattern: 'hearts', light: 'bright' },
  { key: 'entspannt', label: 'Entspannt', pattern: 'waves', light: 'quiet' },
  { key: 'abenteuer', label: 'Abenteuer', pattern: 'route', light: 'bright' },
  { key: 'nachdenklich', label: 'Nachdenklich', pattern: 'bubbles', light: 'quiet' },
  { key: 'schwierig', label: 'Schwierig', pattern: 'rain', light: 'muted' },
];

// Mood used when none is picked
export const DEFAULT_MOOD = '💖';

// The database stores at most this many characters per mood
export const MAX_MOOD_LENGTH = 32;

// How a mood shows on the timeline cards – without colour (colour stands for the two of you, gold
// for highlights):
//   - its group gets a faint line pattern in the card's top-right corner (`pattern`, drawn in
//     components/MoodPattern.jsx): hearts, sun rays, waves, a route with mountains, thought
//     bubbles, rain
//   - how heavy it feels sets the card's lightness (`light`): 'bright' (white with a soft glow),
//     'quiet' (a touch of grey) or 'muted' (grey card, greyer title and dot)
// Emojis in no group ("Anderes") have no pattern and the plain look ('plain').
const OTHER_LOOK = { group: '', pattern: null, light: 'plain' };

// The classes of each lightness (whole class names, so Tailwind finds them – don't build them from
// pieces). All cards share one soft base tone.
export const LIGHT_CLASSES = {
  plain: { card: 'bg-linear-to-br from-purple-50 to-white shadow-xl', title: 'text-gray-800', dot: 'bg-purple-500', badge: 'bg-white ring-purple-200', pattern: 'text-purple-300' },
  bright: { card: 'bg-linear-to-br from-purple-50 to-white shadow-[0_12px_32px_-8px_rgba(236,72,153,0.35)]', title: 'text-gray-800', dot: 'bg-purple-500', badge: 'bg-white ring-purple-200', pattern: 'text-purple-300' },
  quiet: { card: 'bg-linear-to-br from-slate-100 to-white shadow-xl', title: 'text-gray-800', dot: 'bg-purple-400', badge: 'bg-white ring-slate-300', pattern: 'text-slate-400' },
  muted: { card: 'bg-linear-to-br from-gray-200 to-gray-50 shadow-xl', title: 'text-gray-600', dot: 'bg-gray-400', badge: 'bg-gray-100 ring-gray-300', pattern: 'text-gray-400' },
};
// the badge outside the timeline: always the plain one
export const NEUTRAL_BADGE = LIGHT_CLASSES.plain.badge;

// The storybook's mood groups, worked out from its list (book.moods: [{ id, emoji, group, position }]):
//   const { groups, groupOf, look } = useMoods();
//   groups        MOOD_GROUPS, each with `emojis`: [{ id, emoji }] in their order
//   groupOf(e)    the group of an emoji, or null ("Anderes")
//   look(e)       how a memory with this mood looks on the timeline: { group (its label, '' for
//                 "Anderes"), pattern, light } – a memory without a mood shows DEFAULT_MOOD, so it
//                 looks like that one
export const moodGroups = (list = []) => {
  const byKey = new Map(MOOD_GROUPS.map((g) => [g.key, { ...g, emojis: [] }]));
  const ofEmoji = new Map();
  for (const item of [...list].sort((a, b) => a.position - b.position || a.id - b.id)) {
    const group = byKey.get(item.group);
    if (!group) continue;
    group.emojis.push({ id: item.id, emoji: item.emoji });
    ofEmoji.set(item.emoji, group);
  }
  const groupOf = (emoji) => ofEmoji.get(emoji) ?? null;
  const look = (emoji) => {
    const group = groupOf(emoji || DEFAULT_MOOD);
    return group ? { group: group.label, pattern: group.pattern, light: group.light } : OTHER_LOOK;
  };
  return { groups: [...byKey.values()], groupOf, look };
};

// (worked out once by StorybookLayout, from book.moods)
export const useMoods = () => useStorybook().moodGroups;

// The moods used most often in the most recent memories, most frequent first.
// `memories` is the list from the server (newest first).
export const recentMoods = (memories, { lookAt = 30, count = 6 } = {}) => {
  const counts = new Map();
  for (const memory of (memories || []).slice(0, lookAt)) {
    if (memory.mood) counts.set(memory.mood, (counts.get(memory.mood) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1]) // stable: equally frequent ones keep the "newest first" order
    .slice(0, count)
    .map(([emoji]) => emoji);
};

// Is `text` exactly one emoji? Returns the cleaned-up emoji, or null.
// Accepts combined emojis like 👨‍👩‍👧‍👦, skin tones 👍🏽, flags 🇩🇪 and keycaps 1️⃣.
export const asSingleEmoji = (text) => {
  const value = (text || '').trim();
  if (!value || [...value].length > MAX_MOOD_LENGTH) return null;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    // count what a person sees as characters ("👨‍👩‍👧‍👦" is one, even though it's 7 code points)
    const graphemes = [...new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(value)];
    if (graphemes.length !== 1) return null;
  }
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(value) ? value : null;
};
