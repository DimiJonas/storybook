import React, { useEffect, useRef } from 'react';
import { L, createMap, fitPoints, pinIcon } from '../../map/mapTools';

// The small map on a memory's detail page (after its photos; as wide as the card on phones, at most
// 36rem on bigger screens): a still picture of its places (it can't be moved, so
// it never catches the finger while scrolling the page). Tapping it calls onOpen (-> the Karte).
export default function PlacesMiniMap({ places, onOpen }) {
  const elementRef = useRef(null);
  const key = JSON.stringify(places.map((p) => [p.id, p.latitude, p.longitude])); // redrawn only when they change
  useEffect(() => {
    const map = createMap(elementRef.current, { interactive: false });
    for (const place of places) L.marker([place.latitude, place.longitude], { icon: pinIcon(), interactive: false, keyboard: false }).addTo(map);
    fitPoints(map, places, { maxZoom: 11, padding: 30, animate: false });
    return () => map.remove();
  }, [key]); // (places itself is a new list on every render)
  return (
    // (a div, not a <button>: the map puts links – the attribution – inside it)
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="block w-full h-36 sm:h-44 sm:max-w-xl rounded-2xl overflow-hidden border border-purple-200 shadow-inner cursor-pointer"
      aria-label="Auf der Karte zeigen"
      title="Auf der Karte zeigen"
      data-testid="mini-map"
    >
      <div ref={elementRef} className="w-full h-full pointer-events-none" />
    </div>
  );
}
