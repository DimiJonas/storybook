// The start screen ("splash"): the element #splash in index.html, styled by .splash in index.css.
// It's on screen from the very first moment (before the app's JavaScript has loaded). The app
// never draws its own copy – it only fades this one out when nothing is loading any more, and
// shows it again when needed (e.g. while switching storybooks).
//
// Pages that load something use the <Splash visible={isLoading} /> component (Splash.jsx), which
// calls useSplash(). The start screen stays while at least one of them is loading – and, when the
// app has just been opened, at least MIN_VISIBLE_MS, so it doesn't just flash by.
import { useEffect } from 'react';

const MIN_VISIBLE_MS = 1000; // counted from opening the app (so only matters at app start)
const FADE_MS = 450; // same as the transition of .splash in index.css

const loading = new Set(); // the pages that are loading right now
let started = false; // set by splashReady() once the app has been drawn for the first time
let hideTimer;

const element = () => document.getElementById('splash');

const show = () => {
  clearTimeout(hideTimer);
  const splash = element();
  if (!splash) return;
  splash.hidden = false;
  splash.classList.remove('splash--hidden');
};

const hide = () => {
  clearTimeout(hideTimer);
  // performance.now() = milliseconds since the app was opened
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  hideTimer = setTimeout(() => {
    const splash = element();
    if (!splash) return;
    splash.classList.add('splash--hidden'); // fades out (CSS transition)
    hideTimer = setTimeout(() => { splash.hidden = true; }, FADE_MS); // then gone completely
  }, wait);
};

const update = () => {
  if (loading.size > 0) show();
  else if (started) hide();
};

// Called once by App after its first drawing: from now on, the start screen goes away as soon
// as no page is loading (e.g. right away on the login page – after the minimum time).
export const splashReady = () => {
  started = true;
  update();
};

// Keep the start screen on screen while `active` is true
export const useSplash = (active) => {
  useEffect(() => {
    if (!active) return undefined;
    const token = {};
    loading.add(token);
    update();
    return () => {
      loading.delete(token);
      update();
    };
  }, [active]);
};
