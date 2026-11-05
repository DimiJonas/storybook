// Personal settings of each user (⋮ → Einstellungen in the app), stored in users.settings.
// Some only change how the app shows things to that person (on all of their devices); the name
// and the perspective colour are what the others see too (GET /api/users).
// Only the settings listed here exist; each has a default and a check for its value.
// A new setting: add it here (and to DEFAULT_SETTINGS in client/src/settings.js) – no migration needed.

// Colours a person can choose for their perspectives (the app knows how they look)
const PERSPECTIVE_COLORS = ['violet', 'sky', 'rose', 'emerald', 'amber', 'fuchsia', 'teal', 'orange', 'indigo', 'lime'];

const MAX_NAME_LENGTH = 30;
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// default(user): the value as long as the person hasn't chosen one; prepare: tidies the value
// before it's checked (e.g. spaces around a name)
const SETTINGS = {
  // show a memory's tags on its card in the timeline (they're always shown in the detail view)
  showTagsOnCards: { default: () => false, valid: (value) => typeof value === 'boolean' },
  // the name shown to everyone ("von Anna", "Aus Annas Sicht"); at first the login name
  displayName: {
    default: (user) => capitalize(user.username),
    prepare: (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value),
    valid: (value) =>
      typeof value === 'string' && value.length > 0 && [...value].length <= MAX_NAME_LENGTH && !/\p{Cc}/u.test(value),
  },
  // the colour of this person's perspective boxes (everyone sees them in it); at first one per
  // person, so two people start with different colours
  perspectiveColor: {
    default: (user) => PERSPECTIVE_COLORS[(user.id - 1) % PERSPECTIVE_COLORS.length],
    valid: (value) => PERSPECTIVE_COLORS.includes(value),
  },
};

// All settings of `user` ({ id, username, settings }): the saved values, the default for the
// rest (saved values of settings that no longer exist, or are no longer valid, are left out)
const withDefaults = (user) =>
  Object.fromEntries(
    Object.entries(SETTINGS).map(([key, setting]) => {
      const saved = user.settings;
      const ok = saved && Object.hasOwn(saved, key) && setting.valid(saved[key]);
      return [key, ok ? saved[key] : setting.default(user)];
    }),
  );

// What everyone may know about a person: { id, name, color }
const publicProfile = (user) => {
  const all = withDefaults(user);
  return { id: user.id, name: all.displayName, color: all.perspectiveColor };
};

// Checks the changes the app sends, e.g. { showTagsOnCards: true }. Returns { error } or { changes }.
const validateSettings = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    return { error: 'Keine Einstellungen angegeben.' };
  }
  const changes = {};
  for (const [key, raw] of Object.entries(body)) {
    if (!Object.hasOwn(SETTINGS, key)) return { error: 'Diese Einstellung gibt es nicht.' };
    const value = SETTINGS[key].prepare ? SETTINGS[key].prepare(raw) : raw;
    if (!SETTINGS[key].valid(value)) {
      return {
        error: key === 'displayName'
          ? `Der Name muss 1 bis ${MAX_NAME_LENGTH} Zeichen lang sein.`
          : 'Der Wert der Einstellung ist ungültig.',
      };
    }
    changes[key] = value;
  }
  return { changes };
};

module.exports = { withDefaults, publicProfile, validateSettings, PERSPECTIVE_COLORS };
