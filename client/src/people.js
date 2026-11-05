// The people of the app (GET /api/users): their names and perspective colours, as everyone sees
// them. Loaded by StorybookLayout; every page gets them with usePeople().
import { useStorybook } from './storybook';

// The colours a person can choose for their perspectives (⋮ → Einstellungen). The server only
// knows the names (server/src/settings.js); the boxes use the colour for their border and, see-
// through, for their fill.
export const PERSPECTIVE_COLORS = {
  violet: { hex: '#8b5cf6', label: 'Violett' },
  sky: { hex: '#0ea5e9', label: 'Himmelblau' },
  rose: { hex: '#f43f5e', label: 'Rosé' },
  emerald: { hex: '#10b981', label: 'Smaragd' },
  amber: { hex: '#f59e0b', label: 'Bernstein' },
  fuchsia: { hex: '#d946ef', label: 'Fuchsia' },
  teal: { hex: '#14b8a6', label: 'Petrol' },
  orange: { hex: '#f97316', label: 'Orange' },
  indigo: { hex: '#6366f1', label: 'Indigo' },
  lime: { hex: '#84cc16', label: 'Limette' },
};
const UNKNOWN = { id: null, name: 'Unbekannt', color: null };
export const colorHex = (color) => PERSPECTIVE_COLORS[color]?.hex ?? '#9ca3af';

// The colours of a perspective box: border in the colour, fill see-through (about 12 %)
export const boxStyle = (color) => ({ borderColor: colorHex(color), backgroundColor: `${colorHex(color)}1f` });

// German possessive of a name: "Annas", "Lukas'", "Max'" (names ending in s, ß, x, z get only ')
export const possessive = (name) => (/[sßxz]$/i.test(name) ? `${name}'` : `${name}s`);

// const { users, me, person } = usePeople();  person(id) -> { id, name, color } (never empty)
export const usePeople = () => {
  const { users = [] } = useStorybook();
  const me = users.find((u) => u.me) ?? UNKNOWN;
  const person = (id) => users.find((u) => u.id === id) ?? UNKNOWN;
  return { users, me, person };
};
