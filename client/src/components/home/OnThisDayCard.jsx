import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStorybook } from '../../storybook';
import { imageUrl, fallbackToOriginal } from '../../config';
import { coverPhoto } from '../../photos';

// "An diesem Tag in der Vergangenheit": entries from onThisDay() in dates.js,
// each { memory, year, day, days } – e.g. "2024 · Tag 2 von 3" for the 2nd day of a trip
const OnThisDayCard = ({ entries }) => {
  const navigate = useNavigate();
  const book = useStorybook();

  if (!entries.length) return null;

  return (
    <div className="mb-10 px-4">
      <h2 className="text-xl font-bold text-purple-700 mb-4">
        An diesem Tag in der Vergangenheit
      </h2>
      <div className="space-y-4">
        {entries.map(({ memory, year, day, days }) => {
          const cover = coverPhoto(memory);
          return (
            <div
              key={`${memory.id}-${year}`}
              className="border border-purple-200 bg-white p-4 rounded-2xl shadow-md hover:bg-purple-50 transition cursor-pointer"
              onClick={() => navigate(book.path(`/memory/${memory.id}`))}
            >
              <div className="flex gap-4">
                {/* the memory's cover photo */}
                {cover && (
                  <img
                    src={imageUrl(book.id, cover.filename, 'thumb')}
                    onError={fallbackToOriginal(book.id, cover.filename)}
                    alt=""
                    loading="lazy"
                    className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl object-cover bg-purple-50 shadow-sm"
                  />
                )}
                <div className="min-w-0 flex-1">
                  {/* title and date side by side when they fit – on a narrow phone the date wraps
                      below the title instead of being pushed past the card's edge */}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h3 className="min-w-0 text-lg font-semibold text-gray-800 break-words">
                      {memory.title}{' '}
                      <span className="text-xl whitespace-nowrap">{memory.mood || '💖'}</span>
                    </h3>
                    <span className="text-sm text-gray-500 whitespace-nowrap">
                      {year}
                      {days > 1 && ` · Tag ${day} von ${days}`}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm mt-2 line-clamp-3">
                    {memory.content}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OnThisDayCard;
