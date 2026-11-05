import React from 'react';

// 👑 as a sticker on the top-left corner of a highlight's card, tilted and reaching over the
// card's border (the card needs `relative` and must not cut off what sticks out). Only a marker –
// the highlight is set and removed with the 👑 button on the memory's page.
export default function HighlightSticker({ testId }) {
  return (
    <span
      className="absolute -top-5 -left-4 z-10 text-4xl leading-none -rotate-12 drop-shadow-md select-none"
      title="Highlight"
      aria-label="Highlight"
      role="img"
      data-testid={testId}
    >
      👑
    </span>
  );
}

// the golden frame around a highlight's card (together with the sticker)
export const HIGHLIGHT_FRAME = 'ring-2 ring-amber-300';
