import React from 'react';
import { useStorybook } from '../storybook';

// The tags of a memory as small chips (by name). With `onSelect`, each chip is a button.
export default function TagChips({ tagIds, onSelect, className = '' }) {
  const book = useStorybook();
  const tags = book.tags.filter((tag) => tagIds?.includes(tag.id));
  if (tags.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Tags">
      {tags.map((tag) =>
        onSelect ? (
          <button
            key={tag.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(tag); }}
            className="px-2.5 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-800 text-xs font-medium hover:bg-fuchsia-200"
            title={`Alle Erinnerungen mit „${tag.name}“`}
          >
            🏷️ {tag.name}
          </button>
        ) : (
          <span key={tag.id} className="px-2.5 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-800 text-xs font-medium">
            🏷️ {tag.name}
          </span>
        )
      )}
    </div>
  );
}
