// The storybook that is open, for every page inside it:
//   const book = useStorybook();
//   book.id, book.name, book.path('/memory/5') -> '/b/1/memory/5'
//   book.phases (the Kapitel, oldest first), book.tags (the tags, by name: [{ id, name, memories }]),
//   book.users (everyone's name and colour – use usePeople() from people.js),
//   book.places (the storybook's places: [{ id, name, latitude, longitude, memories, photos }]),
//   book.moods (which emoji is in which mood group – use useMoods() from moods.js),
//   book.reload() (loads memories, Kapitel, tags, users, places and mood groups again)
import { createContext, useContext } from 'react';

export const StorybookContext = createContext(null);
export const useStorybook = () => useContext(StorybookContext);

// Address of a page inside a storybook
export const storybookPath = (id, page = '') => `/b/${id}${page}`;
