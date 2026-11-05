// Checking what the app sends for a Kapitel (life phase, "phase" in the code) before saving it.
const { isDateText } = require('./memories');

const MAX_TITLE_LENGTH = 100;
const MAX_EMOJI_LENGTH = 32; // like a memory's mood: one emoji, counted like Postgres does

const length = (text) => [...text].length;

// Returns { error } or { phase } with the values to save (empty emoji -> null)
const validatePhase = (body) => {
  const { title, emoji, start_date: startDate } = body ?? {};
  if (typeof title !== 'string' || !title.trim()) return { error: 'Bitte gib dem Kapitel einen Titel.' };
  if (length(title.trim()) > MAX_TITLE_LENGTH) {
    return { error: `Der Titel darf höchstens ${MAX_TITLE_LENGTH} Zeichen lang sein.` };
  }
  if (emoji != null && (typeof emoji !== 'string' || length(emoji) > MAX_EMOJI_LENGTH)) {
    return { error: 'Das Emoji muss ein einzelnes Emoji sein.' };
  }
  if (!isDateText(startDate)) return { error: 'Bitte wähle ein gültiges Anfangsdatum.' };
  return {
    phase: {
      title: title.trim(),
      emoji: emoji?.trim() || null,
      startDate,
    },
  };
};

module.exports = { validatePhase };
