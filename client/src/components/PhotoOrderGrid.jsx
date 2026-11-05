import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImageOff, Star, X } from 'lucide-react';
import { imageUrl, fallbackToOriginal } from '../config';

// The photos of a memory in the add/edit form, in their order. One of them is the cover photo
// ("Titelbild", chosen with ⭐ – independent of the order). Photos can be dragged into another
// order (with the mouse; on phones:
// hold briefly, then drag; with the keyboard: space, arrow keys, space). Uses dnd-kit:
// https://docs.dndkit.com
//
// photos: [{ key, id, filename }]            already saved photos
//         [{ key, file, url, isNew: true }]  newly chosen photos (uploaded when saving)
// onChange(photos) gets the new order; onRemove(photo) removes one;
// coverKey = key of the cover photo, onCoverChange(key) when ⭐ is tapped.

// German texts for screen readers
const accessibility = (photos) => {
  const position = (key) => photos.findIndex((p) => p.key === key) + 1;
  return {
    screenReaderInstructions: {
      draggable:
        'Leertaste drücken, um das Foto aufzunehmen. Mit den Pfeiltasten verschieben, ' +
        'mit der Leertaste ablegen, mit Escape abbrechen.',
    },
    announcements: {
      onDragStart: ({ active }) => `Foto ${position(active.id)} aufgenommen.`,
      onDragOver: ({ over }) => (over ? `Position ${position(over.id)}.` : 'Außerhalb der Fotos.'),
      onDragEnd: ({ over }) => (over ? `Foto an Position ${position(over.id)} abgelegt.` : 'Foto abgelegt.'),
      onDragCancel: () => 'Verschieben abgebrochen.',
    },
  };
};

// Buttons on a photo must not start a drag with the keyboard (Space/Enter belong to the button)
const stopKeys = (event) => event.stopPropagation();

function PhotoTile({ photo, index, bookId, isCover, onRemove, onMakeCover }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.key,
  });
  const [noPreview, setNoPreview] = useState(false); // e.g. HEIC photos in most browsers

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={`Foto ${index + 1}${isCover ? ', Titelbild' : ''}`}
      // no "save image" menu when holding the photo on a phone
      onContextMenu={(e) => e.preventDefault()}
      className={`photo-tile relative aspect-square rounded-2xl overflow-hidden bg-purple-50 shadow-md touch-manipulation cursor-grab active:cursor-grabbing focus:outline-hidden focus-visible:ring-4 focus-visible:ring-purple-400 ${
        isDragging ? 'z-10 shadow-2xl ring-4 ring-purple-400 opacity-90' : ''
      }`}
    >
      {noPreview ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-purple-400 text-xs text-center p-2">
          <ImageOff className="w-8 h-8" />
          {photo.file?.name ?? 'Keine Vorschau'}
        </div>
      ) : (
        <img
          src={photo.isNew ? photo.url : imageUrl(bookId, photo.filename, 'thumb')}
          onError={(event) => {
            // saved photo without small version: try the original once; otherwise no preview
            if (!photo.isNew && !event.currentTarget.dataset.fallback) fallbackToOriginal(bookId, photo.filename)(event);
            else setNoPreview(true);
          }}
          alt=""
          draggable={false}
          className="w-full h-full object-cover pointer-events-none"
        />
      )}

      {isCover && (
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-purple-600/90 text-white text-xs font-semibold shadow">
          ⭐ Titelbild
        </span>
      )}
      {photo.isNew && (
        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-white/90 text-purple-700 text-xs font-semibold shadow">
          neu
        </span>
      )}

      <button
        type="button"
        onClick={() => onRemove(photo)}
        onKeyDown={stopKeys}
        className="absolute top-1.5 right-1.5 w-8 h-8 flex items-center justify-center rounded-full bg-red-500/90 text-white shadow hover:bg-red-600"
        title="Foto entfernen"
        aria-label={`Foto ${index + 1} entfernen`}
      >
        <X className="w-4 h-4" />
      </button>
      {!isCover && (
        <button
          type="button"
          onClick={() => onMakeCover(photo.key)}
          onKeyDown={stopKeys}
          className="absolute bottom-1.5 left-1.5 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-amber-500 shadow hover:bg-white"
          title="Als Titelbild"
          aria-label={`Foto ${index + 1} als Titelbild`}
        >
          <Star className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function PhotoOrderGrid({ photos, onChange, onRemove, bookId, coverKey, onCoverChange }) {
  const sensors = useSensors(
    // mouse: a drag starts after moving 5 px (so a click on a button stays a click)
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // touch: hold 0.25 s first – a normal swipe keeps scrolling the page
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = photos.findIndex((p) => p.key === active.id);
    const to = photos.findIndex((p) => p.key === over.id);
    onChange(arrayMove(photos, from, to));
  };

  if (photos.length === 0) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={accessibility(photos)}
    >
      <SortableContext items={photos.map((p) => p.key)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="photo-grid">
          {photos.map((photo, index) => (
            <PhotoTile
              key={photo.key}
              photo={photo}
              index={index}
              bookId={bookId}
              isCover={photo.key === coverKey}
              onRemove={onRemove}
              onMakeCover={onCoverChange}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
