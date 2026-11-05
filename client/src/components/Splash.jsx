import { useSplash } from '../splash';

// Keeps the start screen on screen while `visible` is true; when it becomes false, the start
// screen fades out (at app start not before it has been visible for a second).
// The start screen itself is the element #splash in index.html – see src/splash.js.
export default function Splash({ visible }) {
  useSplash(visible);
  return null;
}
