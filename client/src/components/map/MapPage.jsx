import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TimelineNav from '../home/TimelineNav';
import { L, createMap, fitPoints, pinIcon } from '../../map/mapTools';
import { imageUrl } from '../../config';
import { memoryDateText } from '../../dates';
import { coverPhoto } from '../../photos';
import { orderMemories, phaseRanges, yearRanges, memoriesText } from '../../phases';
import { applyFilters, NO_FILTERS } from '../../search';
import { useStorybook } from '../../storybook';
import { useViewState } from '../../viewState';

// "/b/<id>/karte" (☰ → Karte): the places of the memories on an OpenStreetMap map. One pin per
// place (with the number of its memories); pins close together are grouped when zoomed out.
// Tapping a pin shows its memories (cover photo, title, date) – tapping one opens it.
// The bar is the one of the timeline: ∨ search and filters (they decide which memories – and so
// which pins – are on the map); tapping a Kapitel or year *highlights* its pins (the others fade,
// the map shows the highlighted ones), tapping it again ends that.
// The address can ask for one place (?ort=<id>: shown, its memories open) or one memory
// (?erinnerung=<id>: its places highlighted) – used by the detail page.

const placesText = (n) => (n === 1 ? '1 Ort' : `${n} Orte`);

export default function MapPage({ memories }) {
  const book = useStorybook();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusPlace = Number(searchParams.get('ort')) || null;
  const focusMemory = Number(searchParams.get('erinnerung')) || null;

  // only memories with places are on the map (also for the filter choices)
  const withPlaces = useMemo(() => memories.filter((m) => m.place_ids?.length > 0), [memories]);
  const { order, toggleOrder, filters, filtering, changeFilters, options, shown, suffix } =
    useViewState(withPlaces, book.phases, book.tags);
  const list = useMemo(() => orderMemories(shown, order), [shown, order]);
  const years = useMemo(() => yearRanges(list), [list]);
  const phases = useMemo(() => phaseRanges(list, book.phases, order), [list, book.phases, order]);
  const withoutPlaces = useMemo(
    () => applyFilters(memories.filter((m) => !m.place_ids?.length), filters, book.phases).length,
    [memories, filters, book.phases]
  );

  // highlighted: a Kapitel or year picked in the bar – or the memory from the address
  const [picked, setPicked] = useState(focusMemory ? { kind: 'memory', key: focusMemory } : null);
  const pick = (kind, range) => {
    const key = kind === 'year' ? range.year : range.phase?.id ?? 'davor';
    setPicked((p) => (p?.kind === kind && p.key === key ? null : { kind, key }));
  };
  const highlighted = useMemo(() => {
    if (!picked) return null;
    if (picked.kind === 'memory') return new Set([picked.key]);
    const range = picked.kind === 'year'
      ? years.find((r) => r.year === picked.key)
      : phases.find((r) => (r.phase?.id ?? 'davor') === picked.key);
    if (!range || range.first === null) return new Set();
    return new Set(list.slice(range.first, range.last + 1).map((m) => m.id));
  }, [picked, years, phases, list]);

  // the pins: each place with its memories (in reading order)
  const pins = useMemo(() => {
    const byPlace = new Map(book.places.map((p) => [p.id, { place: p, memories: [] }]));
    for (const memory of list) {
      for (const id of memory.place_ids) byPlace.get(id)?.memories.push(memory);
    }
    return [...byPlace.values()].filter((pin) => pin.memories.length > 0);
  }, [book.places, list]);

  // --- the map (made once) -----------------------------------------------------------------------
  const mapRef = useRef(null);
  const elementRef = useRef(null);
  const groupRef = useRef(null);
  const markersRef = useRef(new Map()); // place id -> marker
  const openRef = useRef(null);
  openRef.current = (memory, placeId) =>
    navigate(book.path(`/memory/${memory.id}`) + suffix, { state: { from: 'karte', place: placeId } });

  useEffect(() => {
    const map = createMap(elementRef.current);
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      iconCreateFunction: (cluster) => {
        const markers = cluster.getAllChildMarkers();
        const count = markers.reduce((n, m) => n + m.options.memoryCount, 0);
        const states = markers.map((m) => m.options.state);
        const state = states.includes('highlight') ? 'highlight' : states.every((s) => s === 'dim') ? 'dim' : '';
        return L.divIcon({ html: `<div>${count}</div>`, className: `marker-cluster sb-cluster ${state}`.trim(), iconSize: L.point(40, 40) });
      },
    });
    map.addLayer(group);
    mapRef.current = map;
    groupRef.current = group;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // the map fills the rest of the screen below the bar
  const [height, setHeight] = useState(400);
  useLayoutEffect(() => {
    const measure = () => {
      const top = elementRef.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(260, window.innerHeight - top - window.scrollY - 12));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  useEffect(() => { mapRef.current?.invalidateSize(); }, [height]);

  // the popup of a place: its memories (built as elements – no HTML strings, no inline styles)
  const popupFor = (pin) => () => {
    const box = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'sb-popup-title';
    title.textContent = `📍 ${pin.place.name}`;
    const items = document.createElement('div');
    items.className = 'sb-popup-list';
    for (const memory of pin.memories) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `sb-popup-item${highlighted?.has(memory.id) ? ' highlight' : ''}`;
      const cover = coverPhoto(memory);
      const picture = document.createElement(cover ? 'img' : 'span');
      if (cover) {
        picture.src = imageUrl(book.id, cover.filename, 'thumb');
        picture.alt = '';
        picture.loading = 'lazy';
      } else {
        picture.className = 'sb-popup-noimg';
      }
      // a highlight: 👑 on the corner of the picture (not in the title)
      const pictureBox = document.createElement('span');
      pictureBox.className = 'sb-popup-pic';
      pictureBox.append(picture);
      if (memory.highlight) {
        const crown = document.createElement('span');
        crown.className = 'sb-popup-crown';
        crown.textContent = '👑';
        crown.title = 'Highlight';
        crown.setAttribute('role', 'img');
        crown.setAttribute('aria-label', 'Highlight');
        pictureBox.append(crown);
      }
      const text = document.createElement('span');
      text.className = 'sb-popup-text';
      const strong = document.createElement('strong');
      strong.textContent = `${memory.title} ${memory.mood ?? ''}`.trim();
      const date = document.createElement('span');
      date.textContent = memoryDateText(memory);
      text.append(strong, date);
      item.append(pictureBox, text);
      item.addEventListener('click', () => openRef.current(memory, pin.place.id));
      items.append(item);
    }
    box.append(title, items);
    return box;
  };

  // the pins on the map (again whenever the memories or the highlight change)
  useEffect(() => {
    const group = groupRef.current;
    group.clearLayers();
    markersRef.current = new Map();
    for (const pin of pins) {
      const state = !highlighted ? '' : pin.memories.some((m) => highlighted.has(m.id)) ? 'highlight' : 'dim';
      const marker = L.marker([pin.place.latitude, pin.place.longitude], {
        icon: pinIcon({ count: pin.memories.length, state }),
        title: pin.place.name,
        alt: pin.place.name,
        memoryCount: pin.memories.length,
        state,
        zIndexOffset: state === 'highlight' ? 1000 : 0,
      });
      marker.bindPopup(popupFor(pin), { className: 'sb-popup' });
      group.addLayer(marker);
      markersRef.current.set(pin.place.id, marker);
    }
  }, [pins, highlighted]); // (popupFor reads the newest highlight itself)

  // where the map looks: at the asked-for place, the highlighted pins, or all pins
  const fitKey = JSON.stringify([suffix, picked, focusPlace, pins.length]);
  const firstFit = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const animate = !firstFit.current;
    firstFit.current = false;
    const marker = focusPlace && markersRef.current.get(focusPlace);
    if (marker && !picked) {
      map.setView(marker.getLatLng(), 13, { animate });
      groupRef.current.zoomToShowLayer(marker, () => marker.openPopup());
      return;
    }
    const points = pins.filter((pin) => !highlighted || pin.memories.some((m) => highlighted.has(m.id))).map((pin) => pin.place);
    fitPoints(map, points, { animate, maxZoom: picked ? 13 : 11 });
  }, [fitKey]); // (only when what should be shown changes – not on every new pin list)

  const placesWithMemories = book.places.filter((p) => p.memories > 0).length;

  return (
    <div className="container mx-auto px-4 pt-4">
      {withPlaces.length > 0 && (
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
          total={withPlaces.length}
          onPick={pick}
          picked={picked}
          resultText={filtering ? `${list.length} von ${memoriesText(withPlaces.length)} mit Ort` : `${memoriesText(withPlaces.length)} mit Ort`}
          hitsText={memoriesText(list.length)}
        />
      )}
      <div className="relative">
        <div ref={elementRef} className="w-full rounded-2xl overflow-hidden border border-purple-200 shadow-inner z-0" style={{ height }} data-testid="map" />
        {/* what's on the map */}
        <div className="absolute left-2 bottom-6 z-[500] max-w-[85%] rounded-xl bg-white/90 backdrop-blur-sm px-3 py-1.5 text-xs text-gray-700 shadow" data-testid="map-info">
          {placesWithMemories === 0 ? (
            <>Noch keine Orte – ihr fügt sie beim Bearbeiten einer Erinnerung hinzu.</>
          ) : filtering && pins.length === 0 ? (
            <>Nichts gefunden. <button type="button" onClick={() => changeFilters(NO_FILTERS)} className="font-semibold text-purple-700 underline">Zurücksetzen</button></>
          ) : (
            <>{placesText(pins.length)} · {memoriesText(list.length)}{withoutPlaces > 0 && ` · ${withoutPlaces} ohne Ort`}</>
          )}
        </div>
      </div>
    </div>
  );
}
