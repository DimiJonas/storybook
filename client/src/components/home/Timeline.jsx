import React from 'react';
import { Link } from 'react-router-dom';
import MemoryCard from './MemoryCard';
import { memoriesText } from '../../phases';
import { yearAnchor } from './TimelineNav';
import { useStorybook } from '../../storybook';

// The timeline: the memories in reading order (newest or oldest first), and before each year's
// memories a divider with the year ("2024 · 23 Erinnerungen", and "Unser Jahr →" to the year's
// review) – each year once. Kapitel aren't shown here: the navigation bar (TimelineNav) shows
// which Kapitel you're in.
// After the last memory: an end marker with some space, so that even the last memories can be
// scrolled up to the top (where the navigation bar looks for "the memory you're looking at").
// list: the memories in reading order; years: yearRanges(list) from phases.js; order: 'newest'/'oldest';
// words: search words to highlight; linkSuffix: "?q=..." kept when opening a memory
const Timeline = ({ list, years, order, words = [], linkSuffix = '' }) => {
  const book = useStorybook();
  return (
    <div className="space-y-4">
      {years.map(({ year, first, last }) => (
        <div key={year}>
          <div id={yearAnchor(year)} className="flex items-center gap-3 ml-1 mb-6 mt-4">
            <span className="text-2xl font-extrabold text-purple-700">{year}</span>
            <span className="text-sm text-gray-500 whitespace-nowrap">{memoriesText(last - first + 1)}</span>
            <span className="flex-1 h-px bg-purple-200" aria-hidden="true" />
            <Link
              to={book.path(`/jahr/${year}`)}
              className="text-sm font-semibold text-purple-600 hover:text-purple-800 whitespace-nowrap"
              data-testid="year-review-link"
            >
              Unser Jahr →
            </Link>
          </div>
          <div className="relative border-l-4 border-purple-300 ml-4 space-y-10 pb-6">
            {list.slice(first, last + 1).map((memory, i) => (
              <MemoryCard key={memory.id} memory={memory} index={first + i} words={words} linkSuffix={linkSuffix} />
            ))}
          </div>
        </div>
      ))}
      {list.length > 0 && (
        <div className="min-h-[70vh] pt-8 text-center text-sm text-purple-400" data-testid="timeline-end">
          {order === 'oldest' ? 'Fortsetzung folgt … ✨' : 'Hier beginnt eure Geschichte 💫'}
        </div>
      )}
    </div>
  );
};

export default Timeline;
