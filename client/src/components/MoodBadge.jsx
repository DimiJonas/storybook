import React from 'react';
import { DEFAULT_MOOD, LIGHT_CLASSES, NEUTRAL_BADGE } from '../moods';

// A memory's mood in its own round slot (top-right corner of a card). Memories without a mood show
// DEFAULT_MOOD, as before.
//   size     'md' (timeline, Unser Jahr) or 'lg' (detail page)
//   light    the timeline card's lightness ('bright' / 'quiet' / 'muted' / 'plain', see moods.js),
//            so the ring matches the card; elsewhere the badge is always plain
//   marked   a search word matches the mood: shown marked like the words in the text
//   className  where it sits (e.g. "absolute top-5 right-5")
export default function MoodBadge({ mood, size = 'md', light, marked = false, className = '' }) {
  const emoji = mood || DEFAULT_MOOD;
  const colours = marked ? 'bg-yellow-200 ring-yellow-400' : LIGHT_CLASSES[light]?.badge ?? NEUTRAL_BADGE;
  const circle = size === 'lg' ? 'w-16 h-16 text-4xl' : 'w-12 h-12 text-2xl';
  return (
    <span className={`flex ${className}`} data-testid="mood-badge">
      <span
        className={`${circle} rounded-full ring-2 shadow-sm flex items-center justify-center leading-none select-none ${colours}`}
        role="img"
        aria-label={`Stimmung: ${emoji}`}
        title="Stimmung"
      >
        {emoji}
      </span>
    </span>
  );
}
