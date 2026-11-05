import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { imageUrl, fallbackToOriginal } from '../../config';
import { memoriesText } from '../../phases';
import { photosText } from '../photos/PhotosPage';
import { reviewYears } from '../../yearReview';
import { useStorybook } from '../../storybook';

// "/b/<id>/jahre" (☰ → Unser Jahr): every year with memories, newest first – tapping one opens
// its review (YearPage).
export default function YearsPage({ memories }) {
  const book = useStorybook();
  const years = useMemo(() => reviewYears(memories), [memories]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-purple-700 mb-1">Unser Jahr ✨</h1>
      <p className="text-gray-500 mb-6">Eure Jahresrückblicke – was ihr in jedem Jahr erlebt habt.</p>
      {years.length === 0 ? (
        <p className="text-center text-gray-500 py-16" data-testid="no-years">Noch keine Erinnerungen – sobald ihr welche habt, gibt es hier euer Jahr.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="year-list">
          {years.map(({ year, memories: count, photos, highlights, cover }) => (
            <Link
              key={year}
              to={book.path(`/jahr/${year}`)}
              className="group relative block h-40 rounded-3xl overflow-hidden shadow-xl border border-purple-100 bg-linear-to-br from-purple-500 to-pink-400"
              data-testid="year-entry"
            >
              {cover && (
                <img
                  src={imageUrl(book.id, cover.image.filename, 'medium')}
                  onError={fallbackToOriginal(book.id, cover.image.filename)}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute left-5 bottom-4 right-5 text-white">
                <div className="text-4xl font-extrabold drop-shadow">{year}</div>
                <div className="text-sm opacity-90">
                  {memoriesText(count)} · {photosText(photos)}
                  {highlights > 0 && ` · 👑 ${highlights}`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
