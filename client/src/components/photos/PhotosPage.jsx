import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TimelineNav from '../home/TimelineNav';
import PhotoViewer, { usePhotoParam } from '../PhotoViewer';
import AddMemoryButton from '../AddMemoryButton';
import { fallbackToOriginal, imageUrl } from '../../config';
import { memoryDateText, parseDate } from '../../dates';
import { orderMemories, phaseRanges, yearRanges } from '../../phases';
import { aspectOf, justifyRows, targetRowHeight } from '../../photoLayout';
import { NO_FILTERS } from '../../search';
import { useStorybook } from '../../storybook';
import { useViewState } from '../../viewState';

// "/b/<id>/fotos" (☰ → Fotos): all photos of the memories as rows that fill the width (each photo
// in its own shape, see photoLayout.js), under month headings ("Oktober 2025 · 14 Fotos"), in the
// order of the memories (newest or oldest first, like the timeline) and within a memory in its
// photo order. The same navigation bar as the timeline: Kapitel/years highlight and jump, search
// and filters (shared with the timeline through the address). Tapping a photo opens the viewer,
// which goes through all photos shown.

export const photoMemoryAnchor = (memory) => `foto-erinnerung-${memory.id}`; // its first photo
export const photoYearAnchor = (year) => `fotos-jahr-${year}`; // the year's first month heading
const ANCHORS = { memory: photoMemoryAnchor, year: photoYearAnchor };
const GAP = 4; // px between photos

export const photosText = (count) => (count === 1 ? '1 Foto' : `${count} Fotos`);
const monthName = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });

// One month: its photos in rows
function MonthRows({ photos, width, firstPhotoOf, onOpen }) {
  const book = useStorybook();
  const target = targetRowHeight(width);
  const rows = useMemo(() => justifyRows(photos.map((p) => aspectOf(p.image)), width, target, GAP), [photos, width, target]);
  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.start} className="flex gap-1" style={{ height: row.height }}>
          {photos.slice(row.start, row.end).map(({ image, memory, index }) => {
            const aspect = aspectOf(image);
            return (
              <button
                key={image.id}
                type="button"
                id={firstPhotoOf.get(memory.id) === image.id ? photoMemoryAnchor(memory) : undefined}
                onClick={() => onOpen(index)}
                className="relative overflow-hidden rounded-md bg-purple-100 cursor-zoom-in focus-visible:outline-3 focus-visible:outline-purple-500"
                style={row.full ? { flex: `${aspect} 1 0px` } : { width: aspect * row.height, flex: 'none' }}
                aria-label={`Foto: ${memory.title}, ${memoryDateText(memory)}${memory.highlight ? ', Highlight' : ''}`}
                data-testid="photo-tile"
                data-image-id={image.id}
              >
                <img
                  src={imageUrl(book.id, image.filename, 'thumb')}
                  onError={fallbackToOriginal(book.id, image.filename)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="w-full h-full object-cover transition hover:opacity-90"
                />
                {/* 👑 on the first photo of a highlight */}
                {memory.highlight && firstPhotoOf.get(memory.id) === image.id && (
                  <span className="absolute top-1 left-1 text-lg leading-none drop-shadow" aria-hidden="true" data-testid="photo-crown">👑</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function PhotosPage({ memories }) {
  const book = useStorybook();
  const navigate = useNavigate();

  // only memories with photos count here (also for the filter choices)
  const withPhotos = useMemo(() => memories.filter((m) => m.images?.length > 0), [memories]);
  const totalPhotos = useMemo(() => withPhotos.reduce((n, m) => n + m.images.length, 0), [withPhotos]);
  const { order, toggleOrder, filters, filtering, changeFilters, options, shown, suffix } =
    useViewState(withPhotos, book.phases, book.tags);

  // the memories in reading order, where each year and Kapitel lies in it (for the bar)
  const list = useMemo(() => orderMemories(shown, order), [shown, order]);
  const years = useMemo(() => yearRanges(list), [list]);
  const phases = useMemo(() => phaseRanges(list, book.phases, order), [list, book.phases, order]);

  // all photos in reading order, and the months they're grouped in
  const { photos, months, firstPhotoOf } = useMemo(() => {
    const all = list.flatMap((memory) => memory.images.map((image) => ({ image, memory })));
    all.forEach((p, index) => { p.index = index; });
    const groups = [];
    for (const p of all) {
      const key = p.memory.date.slice(0, 7); // "2025-10" (the memory's first day)
      if (groups.at(-1)?.key !== key) groups.push({ key, year: Number(key.slice(0, 4)), photos: [] });
      groups.at(-1).photos.push(p);
    }
    groups.forEach((g, i) => { g.firstOfYear = i === 0 || groups[i - 1].year !== g.year; });
    return { photos: all, months: groups, firstPhotoOf: new Map(list.map((m) => [m.id, m.images[0].id])) };
  }, [list]);

  // the width available for the rows (measured, and again when it changes, e.g. turning the phone)
  const gridRef = useRef(null);
  const [width, setWidth] = useState(0);
  const hasPhotos = photos.length > 0; // (without photos there are no rows to measure)
  useLayoutEffect(() => {
    const element = gridRef.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPhotos]);

  // the viewer: the open photo is in the address (?foto=<id>)
  const { openId, open, show, close } = usePhotoParam();
  const viewerIndex = openId ? photos.findIndex((p) => p.image.id === openId) : -1;
  const openMemory = (memory) => navigate(book.path(`/memory/${memory.id}`) + suffix, { state: { from: 'fotos' } });

  if (totalPhotos === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center text-gray-500" data-testid="no-photos">
        <div className="text-5xl mb-4">📷</div>
        <p>Noch keine Fotos.</p>
        <p className="text-sm mt-1">Fotos fügt ihr beim Anlegen oder Bearbeiten einer Erinnerung hinzu.</p>
        <AddMemoryButton />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pt-4">
      <TimelineNav
        list={list}
        years={years}
        phases={phases}
        allPhases={book.phases}
        order={order}
        onToggleOrder={toggleOrder}
        filters={filters}
        onFiltersChange={changeFilters}
        options={options}
        total={totalPhotos}
        anchors={ANCHORS}
        resultText={filtering ? `${photos.length} von ${photosText(totalPhotos)}` : photosText(totalPhotos)}
        hitsText={photosText(photos.length)}
      />

      {filtering && photos.length === 0 ? (
        <div className="text-center py-16 text-gray-500" data-testid="no-results">
          <div className="text-4xl mb-3">🔍</div>
          <p className="mb-4">Nichts gefunden.</p>
          <button type="button" onClick={() => changeFilters(NO_FILTERS)} className="px-4 py-2 rounded-xl bg-purple-100 text-purple-800 font-semibold hover:bg-purple-200">
            Suche und Filter zurücksetzen
          </button>
        </div>
      ) : (
        <div ref={gridRef} className="pt-2">
          {width > 0 && months.map((month) => (
            <section key={month.key} className="mb-6" aria-label={monthName.format(parseDate(`${month.key}-01`))}>
              <h2
                id={month.firstOfYear ? photoYearAnchor(month.year) : undefined}
                className="flex items-baseline gap-2 mb-2 ml-0.5"
                data-testid="month-heading"
              >
                <span className="text-lg font-bold text-purple-700">{monthName.format(parseDate(`${month.key}-01`))}</span>
                <span className="text-sm text-gray-500">{photosText(month.photos.length)}</span>
              </h2>
              <MonthRows photos={month.photos} width={width} firstPhotoOf={firstPhotoOf} onOpen={(i) => open(photos[i].image.id)} />
            </section>
          ))}
          {/* room at the end, so the last photos can be scrolled up to the bar too */}
          <div className="min-h-[60vh] pt-8 text-center text-sm text-purple-400" data-testid="photos-end">
            {order === 'oldest' ? 'Fortsetzung folgt … ✨' : 'Hier beginnt eure Geschichte 💫'}
          </div>
        </div>
      )}

      <AddMemoryButton />

      {viewerIndex >= 0 && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onIndexChange={(i) => show(photos[i].image.id)}
          onClose={close}
          onOpenMemory={openMemory}
        />
      )}
    </div>
  );
}
