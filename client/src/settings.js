// Personal settings (⋮ → Einstellungen). Saved with the account on the server (GET/PUT /api/settings,
// see server/src/settings.js), so each person has their own, the same on all their devices.
// StorybookLayout loads them together with the storybook and provides them via SettingsContext.
import { createContext, useCallback, useContext } from 'react';

export const DEFAULT_SETTINGS = {
  showTagsOnCards: false, // show a memory's tags on its card in the timeline (always in the detail view)
  displayName: '', // the name everyone sees ("von Anna", "Aus Annas Sicht")
  perspectiveColor: 'violet', // the colour of your perspective boxes (see people.js)
};

// { settings, change(key, value) } – change saves right away and returns a promise
// (if saving fails, the old value comes back and the promise is rejected)
export const SettingsContext = createContext({ settings: DEFAULT_SETTINGS, change: async () => {} });

// const [value, setValue] = useSetting('showTagsOnCards')
export const useSetting = (key) => {
  const { settings, change } = useContext(SettingsContext);
  const set = useCallback((value) => change(key, value), [change, key]);
  return [settings[key] ?? DEFAULT_SETTINGS[key], set];
};
