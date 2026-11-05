import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import FullscreenImage from './FullscreenImage';
import { gridSize, imageUrl } from '../config';
import { memoryDateText } from '../dates';
import { useStorybook } from '../storybook';
import { useAddressParam } from '../useAddressParam';

// Full-screen photo viewer, used by the Fotos view and the detail page of a memory.
//   phones: swipe left/right for the next/previous photo – the photos sit side by side on a strip
//           that follows the finger, so the next one is pulled in while the current one moves
//           out; swipe down (or tap next to the photo) to close; pinching zooms (the phone's own
//           zoom) – while zoomed in, swiping doesn't switch photos
//   laptop: ‹ › buttons, arrow keys, Esc
// At the bottom: the memory's title and date, the position ("17 / 230") and, if `onOpenMemory`
// is given, "Zur Erinnerung →".
// photos: [{ image, memory }] in order; index: the one shown; onIndexChange(i); onClose()
//
// The open photo is part of the address (?foto=<id>, see usePhotoParam), so the phone's back
// button closes the viewer instead of leaving the page.

const SWIPE_DISTANCE = 60; // px a finger has to move to switch photos
const CLOSE_DISTANCE = 100; // px down to close
const GAP = 16; // px between the photos on the strip
const SLIDE = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'; // moving the strip on/back

const isZoomedIn = () => (window.visualViewport?.scale ?? 1) > 1.01;

export default function PhotoViewer({ photos, index, onIndexChange, onClose, onOpenMemory }) {
  const book = useStorybook();
  const reduceMotion = useReducedMotion();
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const [drag, setDrag] = useState({ x: 0, y: 0 }); // how far the finger has moved the strip
  const [dragging, setDragging] = useState(false); // the strip follows the finger (no animation)
  // -1/1 while the strip moves on to the previous/next photo; when it's there, the new index
  // comes from the parent and the strip is put back to 0 without animation (the same photo
  // is then in the middle, so nothing visibly changes)
  const [slide, setSlide] = useState(0);
  const [instant, setInstant] = useState(false);
  const [shownIndex, setShownIndex] = useState(index);
  // where the viewer is heading (updated at once, so quick key presses in a row all count)
  const target = useRef(index);
  const sliding = useRef(0);
  if (shownIndex !== index) {
    setShownIndex(index);
    setSlide(0);
    setDrag({ x: 0, y: 0 });
    setInstant(true);
    target.current = index;
    sliding.current = 0;
  }
  useEffect(() => {
    if (!instant) return undefined;
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setInstant(false)); });
    return () => cancelAnimationFrame(frame);
  }, [instant]);
  const { memory, image: shownImage } = photos[index + slide] ?? photos[index]; // the caption follows the swipe
  const photoPlace = shownImage.place_id ? book.places?.find((p) => p.id === shownImage.place_id) : null;
  const [zoomed, setZoomed] = useState(isZoomedIn);
  const gesture = useRef(null); // the finger that's moving: { id, x, y, axis, time }
  const pointers = useRef(new Set());
  const dragged = useRef(false); // suppresses the click that follows a swipe
  const dialogRef = useRef(null);

  // to the next (1) / previous (-1) photo: the strip slides over, then the index changes
  const setSliding = (step) => {
    sliding.current = step;
    setSlide(step);
  };
  const go = useCallback((step) => {
    const from = target.current;
    const next = Math.min(photos.length - 1, Math.max(0, from + step));
    if (next === from) return;
    target.current = next;
    if (reduceMotion) onIndexChange(next);
    else if (sliding.current === 0) setSliding(next - index); // slide over to it
    else if (next === index) setSliding(0); // pressed back while sliding: slide back
    else onIndexChange(next); // pressed again while sliding: straight there, no waiting
  }, [index, photos.length, onIndexChange, reduceMotion]);
  const onStripMoved = (e) => {
    if (e.target === e.currentTarget && e.propertyName === 'transform' && sliding.current !== 0) onIndexChange(target.current);
  };
  // in case the browser skips the end of the animation (e.g. the app went into the background)
  useEffect(() => {
    if (slide === 0) return undefined;
    const timer = setTimeout(() => onIndexChange(target.current), 600);
    return () => clearTimeout(timer);
  }, [slide, onIndexChange]);

  // keys; no scrolling of the page behind; focus on the viewer (for the keys and screen readers)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = before; };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => setZoomed(isZoomedIn());
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);

  // load the neighbours ahead, so the next swipe shows them right away
  useEffect(() => {
    for (const step of [1, -1, 2, -2]) {
      const neighbour = photos[index + step]?.image;
      if (!neighbour) continue;
      new Image().src = imageUrl(book.id, neighbour.filename, gridSize());
      if (Math.abs(step) === 1) new Image().src = imageUrl(book.id, neighbour.filename, 'original');
    }
  }, [index, photos, book.id]);

  // --- swiping (one finger or the mouse) -------------------------------------------------------
  const onPointerDown = (e) => {
    pointers.current.add(e.pointerId);
    if (pointers.current.size > 1 || isZoomedIn() || sliding.current !== 0 || (e.pointerType === 'mouse' && e.button !== 0)) {
      gesture.current = null; // pinching, zoomed in or still sliding: leave it
      setDragging(false);
      setDrag({ x: 0, y: 0 });
      return;
    }
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, time: performance.now() };
    dragged.current = false;
  };
  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      dragged.current = true;
      setDragging(true);
    }
    if (g.axis === 'x') {
      const atEnd = (dx > 0 && !hasPrev) || (dx < 0 && !hasNext);
      setDrag({ x: atEnd ? dx / 4 : dx, y: 0 }); // at the first/last photo it only gives a little
    } else {
      setDrag({ x: 0, y: Math.max(0, dy) });
    }
  };
  const onPointerEnd = (e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const fast = Math.abs(dx) / Math.max(1, performance.now() - g.time) > 0.5; // a quick flick
    // from where the finger left it, the strip slides on to the neighbour – or back
    setDragging(false);
    setDrag({ x: 0, y: 0 });
    if (e.type === 'pointercancel') return;
    if (g.axis === 'x' && (Math.abs(dx) > SWIPE_DISTANCE || (fast && Math.abs(dx) > 20))) go(dx < 0 ? 1 : -1);
    else if (g.axis === 'y' && dy > CLOSE_DISTANCE) onClose();
  };
  // tap next to the photo closes (but not the tap at the end of a swipe)
  const onBackgroundClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onClose();
  };

  const fade = drag.y ? Math.max(0.3, 1 - drag.y / 400) : 1;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Foto"
      data-testid="photo-viewer"
      className={`fixed inset-0 z-[60] flex items-center justify-center select-none outline-none ${zoomed ? 'touch-auto' : 'touch-pinch-zoom'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClick={onBackgroundClick}
    >
      <div className="absolute inset-0 bg-black" style={{ opacity: 0.92 * fade }} aria-hidden="true" />

      {/* the strip: previous, current and next photo side by side, moving with the finger */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(calc(${-slide * 100}% + ${drag.x - slide * GAP}px), ${drag.y}px) scale(${drag.y ? fade * 0.3 + 0.7 : 1})`,
          transition: dragging || instant ? 'none' : SLIDE,
        }}
        onTransitionEnd={onStripMoved}
        data-testid="photo-strip"
      >
        {[-1, 0, 1].map((place) => {
          const photo = photos[index + place];
          if (!photo) return null;
          return (
            // keyed by photo: after a swipe the same photo stays the same element (no reload, no flash)
            <div
              key={photo.image.id}
              className="absolute inset-0 flex items-center justify-center"
              style={{ transform: `translateX(calc(${place * 100}% + ${place * GAP}px))` }}
              aria-hidden={place !== 0}
              data-testid="photo-slide"
              data-place={place}
            >
              <FullscreenImage filename={photo.image.filename} alt={photo.memory.title} />
            </div>
          );
        })}
      </div>

      {/* top: position, close */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 text-white bg-linear-to-b from-black/50 to-transparent pointer-events-none">
        <span className="text-sm font-medium tabular-nums" data-testid="photo-position">{index + slide + 1} / {photos.length}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="pointer-events-auto p-1 rounded-full hover:bg-white/15"
          aria-label="Schließen"
        >
          <X className="w-7 h-7" />
        </button>
      </div>

      {/* ‹ › (not on touch screens: there you swipe) */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(-1); }}
          className="pointer-coarse:hidden absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
          aria-label="Vorheriges Foto"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(1); }}
          className="pointer-coarse:hidden absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
          aria-label="Nächstes Foto"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}

      {/* bottom: which memory */}
      <div
        className="absolute bottom-0 inset-x-0 flex items-end gap-3 px-4 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))] text-white bg-linear-to-t from-black/70 to-transparent"
        onClick={(e) => e.stopPropagation()}
        data-testid="photo-caption"
      >
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{memory.title} {memory.mood}</div>
          <div className="text-sm text-white/75">
            {memoryDateText(memory)}
            {photoPlace && <span data-testid="photo-place"> · 📍 {photoPlace.name}</span>}
          </div>
        </div>
        {onOpenMemory && (
          <button
            type="button"
            onClick={() => onOpenMemory(memory)}
            className="shrink-0 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-sm font-semibold whitespace-nowrap"
          >
            Zur Erinnerung →
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

// The open photo in the address (?foto=<id>, see useAddressParam), so the phone's back button
// closes the viewer:
//   const { openId, open, show, close } = usePhotoParam();
export const usePhotoParam = () => {
  const { value, open, show, close } = useAddressParam('foto');
  return { openId: Number(value) || null, open, show, close };
};
