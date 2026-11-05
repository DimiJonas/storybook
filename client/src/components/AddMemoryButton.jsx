import React from 'react';
import { Link } from 'react-router-dom';
import { useStorybook } from '../storybook';

// The round "+" button at the bottom right of the views (Zeitstrahl, Fotos): new memory
export default function AddMemoryButton() {
  const book = useStorybook();
  return (
    <div className="fixed bottom-8 right-8 z-50">
      <Link
        to={book.path('/add')}
        className="block bg-linear-to-br from-pink-400 to-purple-600 text-white p-4 rounded-full shadow-2xl"
        title="Neue Erinnerung hinzufügen"
        aria-label="Neue Erinnerung hinzufügen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </Link>
    </div>
  );
}
