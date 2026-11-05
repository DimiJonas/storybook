import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useStorybook } from '../storybook';
import { useSetting } from '../settings';
import { PERSPECTIVE_COLORS, boxStyle, possessive } from '../people';

// "/b/<id>/einstellungen" (⋮ → "Einstellungen"): your name and perspective colour (everyone sees
// them) and how the app shows things to you – saved with your account, so they're the same on all
// your devices (see src/settings.js).

const sectionTitle = 'text-sm font-semibold text-purple-800 uppercase tracking-wide mt-8 mb-2';

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-purple-200 shadow-sm cursor-pointer">
      <span className="flex-1">
        <span className="block font-semibold text-gray-800">{label}</span>
        {hint && <span className="block text-sm text-gray-500 mt-0.5">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <span
        aria-hidden="true"
        className="relative shrink-0 w-11 h-6 mt-0.5 rounded-full bg-gray-300 transition peer-checked:bg-purple-600 peer-focus-visible:ring-2 peer-focus-visible:ring-purple-400 after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
    </label>
  );
}

export default function SettingsPage() {
  const book = useStorybook();
  const [showTagsOnCards, setShowTagsOnCards] = useSetting('showTagsOnCards');
  const [displayName, setDisplayName] = useSetting('displayName');
  const [color, setColor] = useSetting('perspectiveColor');
  const [name, setName] = useState(displayName);
  const [nameSaved, setNameSaved] = useState(false);
  const [error, setError] = useState('');

  // Saves right away; if that fails, the old value comes back and a message says so
  const save = (setter) => async (value) => {
    setError('');
    try {
      await setter(value);
      return true;
    } catch (err) {
      // the server's own words only for wrong input (e.g. "Der Name muss 1 bis 30 Zeichen lang sein.")
      setError(err.response?.status === 400 && err.response.data?.error
        ? err.response.data.error
        : 'Die Einstellung konnte nicht gespeichert werden. Bitte versuch es nochmal.');
      return false;
    }
  };
  const saveName = async (e) => {
    e.preventDefault();
    if (await save(setDisplayName)(name)) setNameSaved(true);
  };
  const shownName = name.trim() || displayName;

  return (
    <motion.div className="container mx-auto px-4 py-8 max-w-2xl" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Link to={book.path()} className="inline-flex items-center text-purple-600 hover:text-purple-800 mb-6">
        <ChevronLeft className="w-5 h-5 mr-1" /> Zurück zum Zeitstrahl
      </Link>
      <h2 className="text-3xl font-bold text-purple-700">⚙️ Einstellungen</h2>

      <h3 className={sectionTitle}>Du</h3>
      <div className="space-y-3">
        <form onSubmit={saveName} className="p-4 rounded-2xl bg-white border border-purple-200 shadow-sm">
          <label htmlFor="display-name" className="block font-semibold text-gray-800">Dein Name</label>
          <span className="block text-sm text-gray-500 mt-0.5 mb-2">So sehen die anderen dich: „von {displayName}“, „Aus {possessive(displayName)} Sicht“.</span>
          <div className="flex gap-2">
            <input
              id="display-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameSaved(false); }}
              maxLength={30}
              className="flex-1 min-w-0 p-2.5 border border-purple-200 rounded-xl bg-white/80 focus:outline-hidden focus:ring-2 focus:ring-purple-400"
            />
            <button
              type="submit"
              disabled={name.trim() === displayName || !name.trim()}
              className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold disabled:opacity-40"
            >
              {nameSaved && name.trim() === displayName ? 'Gespeichert ✓' : 'Speichern'}
            </button>
          </div>
        </form>

        <div className="p-4 rounded-2xl bg-white border border-purple-200 shadow-sm">
          <span className="block font-semibold text-gray-800">Farbe deiner Perspektiven</span>
          <span className="block text-sm text-gray-500 mt-0.5 mb-3">Alle sehen deine Perspektiven in dieser Farbe.</span>
          <div role="radiogroup" aria-label="Farbe deiner Perspektiven" className="flex flex-wrap gap-2.5">
            {Object.entries(PERSPECTIVE_COLORS).map(([key, { hex, label }]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={color === key}
                aria-label={label}
                title={label}
                onClick={() => save(setColor)(key)}
                className={`w-9 h-9 rounded-full border-2 transition ${color === key ? 'ring-2 ring-offset-2 ring-gray-700 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: `${hex}33`, borderColor: hex }}
              />
            ))}
          </div>
          <div className="mt-4 p-3 rounded-xl border-2" style={boxStyle(color)} data-testid="color-preview">
            <div className="text-sm font-semibold text-gray-800 mb-1">Aus {possessive(shownName)} Sicht</div>
            <p className="text-gray-700 text-sm">So sieht eine Perspektive von dir aus.</p>
          </div>
        </div>
      </div>

      <h3 className={sectionTitle}>Anzeige</h3>
      <div className="space-y-3">
        <Toggle
          label="Tags im Zeitstrahl zeigen"
          hint="Die Tags einer Erinnerung erscheinen auch auf ihrer Karte im Zeitstrahl, nicht nur in der Detailansicht."
          checked={showTagsOnCards}
          onChange={save(setShowTagsOnCards)}
        />
      </div>
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
    </motion.div>
  );
}
