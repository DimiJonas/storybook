import { useState } from 'react';
import { asSingleEmoji, useMoods } from '../moods';

const EmojiButton = ({ emoji, selected, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(emoji)}
    aria-label={emoji}
    aria-pressed={selected}
    className={`text-2xl p-1.5 rounded-full border ${
      selected ? 'border-blue-500 bg-blue-100' : 'border-transparent'
    } hover:bg-gray-100 transition`}
  >
    {emoji}
  </button>
);

// One row: a small label and its emojis (label above on phones, to the left on bigger screens)
const Row = ({ label, children }) => (
  <div className="sm:flex sm:items-center sm:gap-3">
    <span className="block sm:w-32 sm:shrink-0 text-xs font-medium text-gray-500 mb-1 sm:mb-0">{label}</span>
    <div className="flex flex-wrap items-center gap-1">{children}</div>
  </div>
);

// `recent`: the most used moods of recent memories (shown first, as a shortcut). The groups and
// their emojis are the storybook's (⋮ → "Stimmungen bearbeiten"); empty groups aren't shown.
export default function MoodPicker({ value, onChange, recent = [] }) {
  const { groups, groupOf } = useMoods();
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [otherError, setOtherError] = useState('');

  // An emoji that isn't in any group (typed in "Anderes Emoji", or removed from its group since)
  const isCustom = Boolean(value) && !groupOf(value);

  const handleOtherChange = (text) => {
    setOtherText(text);
    const emoji = asSingleEmoji(text);
    if (emoji) {
      onChange(emoji);
      setOtherError('');
    } else {
      setOtherError(text.trim() ? 'Bitte genau ein Emoji eingeben.' : '');
    }
  };

  return (
    <div className="mt-2 space-y-2 sm:space-y-1">
      {recent.length > 0 && (
        <Row label="Zuletzt benutzt">
          {recent.map((emoji) => (
            <EmojiButton key={emoji} emoji={emoji} selected={value === emoji} onSelect={onChange} />
          ))}
        </Row>
      )}

      {groups.filter((group) => group.emojis.length > 0).map((group) => (
        <Row key={group.key} label={group.label}>
          {group.emojis.map(({ emoji }) => (
            <EmojiButton key={emoji} emoji={emoji} selected={value === emoji} onSelect={onChange} />
          ))}
        </Row>
      ))}

      <Row label="Anderes">
        {isCustom && <EmojiButton emoji={value} selected onSelect={onChange} />}
        {showOther ? (
          <>
            <input
              type="text"
              value={otherText}
              onChange={(e) => handleOtherChange(e.target.value)}
              // Enter would otherwise submit the whole form
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              placeholder="Emoji eingeben, z. B. 🐶"
              aria-label="Anderes Emoji"
              autoFocus
              className="w-48 p-1.5 border border-purple-200 rounded-xl bg-white/80 text-xl focus:outline-hidden focus:ring-2 focus:ring-purple-400"
            />
            {/* basis-full: always on its own line below the field */}
            {otherError ? (
              <span className="basis-full text-xs text-red-600">{otherError}</span>
            ) : (
              <span className="basis-full text-xs text-gray-500">
                Emoji-Tastatur: am Handy die 😊-Taste, am Mac Ctrl+Cmd+Leertaste, unter Windows Win+.
              </span>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowOther(true)}
            className="px-3 py-2 text-sm text-purple-700 rounded-full border border-purple-200 hover:bg-purple-50 transition"
          >
            ＋ Anderes Emoji…
          </button>
        )}
      </Row>
    </div>
  );
}
