import React, { useState } from 'react';
import { imageUrl, BIG_SCREEN } from '../config';
import { useStorybook } from '../storybook';

// Shows one photo in the timeline or a photo grid: the medium version on big screens,
// the thumbnail otherwise. If that fails, the original; if that fails too, a
// "not available" box. The browser only starts loading it when it gets close to the
// visible part of the page (loading="lazy").
const ImageComponent = ({ filename, title }) => {
  const book = useStorybook();
  // 0 = small version, 1 = original, 2 = failed
  const [attempt, setAttempt] = useState(0);

  if (attempt === 2) {
    return (
      <div className="flex items-center justify-center h-64 bg-rose-100 text-rose-500 text-sm rounded-2xl border border-rose-200 shadow-inner">
        📷 Foto nicht verfügbar
      </div>
    );
  }

  const img = (
    // Zooms in slightly when the surrounding card/photo (the "group") is hovered.
    <img
      key={attempt}
      src={imageUrl(book.id, filename, attempt === 0 ? 'thumb' : 'original')}
      alt={title}
      onError={() => setAttempt((a) => a + 1)}
      className="w-full h-64 object-cover rounded-2xl shadow-lg bg-purple-50 transition-transform duration-300 group-hover:scale-[1.03]"
      loading="lazy"
      decoding="async"
    />
  );

  if (attempt > 0) return img;

  // <picture> lets the browser pick the medium version on big screens.
  return (
    <picture className="block">
      <source media={BIG_SCREEN} srcSet={imageUrl(book.id, filename, 'medium')} />
      {img}
    </picture>
  );
};

export default ImageComponent;
