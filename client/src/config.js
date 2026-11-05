// Where the Express backend lives: at the app's own address (/api, /uploads). On the server nginx
// passes those on to the backend; on the laptop the Vite dev server does it (see vite.config.js).
// Same address = the login cookie works the same in both (step 14).
export const API_URL = '';

// URL of a photo of storybook `bookId` (each storybook has its own folder book_<id>).
// The server stores each upload in three sizes:
//   'thumb'    ~800 px wide  – timeline and photo grids on phones/tablets, edit form
//   'medium'   ~1600 px wide – timeline and photo grids on big screens (see BIG_SCREEN)
//   'original' the uploaded file as it was – full-screen view
export const imageUrl = (bookId, filename, size = 'thumb') =>
  size === 'original'
    ? `${API_URL}/uploads/book_${bookId}/${filename}`
    : `${API_URL}/uploads/book_${bookId}/${size}/${filename}.webp`;

// Screens at least this wide (laptops, desktops) get the 'medium' photos in the timeline and grids
export const BIG_SCREEN = '(min-width: 1024px)';

// The size the timeline/grids use on the current screen (the full-screen view shows it while
// the original is loading; it's usually already in the browser cache)
export const gridSize = () => (window.matchMedia(BIG_SCREEN).matches ? 'medium' : 'thumb');

// Use as onError on an <img> showing a 'thumb' or 'medium' version: if that version doesn't
// exist (e.g. a photo format that couldn't be converted), switch to the original once.
export const fallbackToOriginal = (bookId, filename) => (event) => {
  const img = event.currentTarget;
  if (img.dataset.fallback) return;
  img.dataset.fallback = 'true';
  img.src = imageUrl(bookId, filename, 'original');
};
