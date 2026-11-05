import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { L, createMap, fitPoints, pinIcon } from '../../map/mapTools';
import { api } from '../../api';
import { useStorybook } from '../../storybook';

// "Auf der Karte wählen" in the form: tap a spot on the map, give it a name (a suggestion comes
// from OpenStreetMap), "Übernehmen" -> onPick({ name, latitude, longitude }).
export default function PlacePicker({ onPick, onClose }) {
  const book = useStorybook();
  const elementRef = useRef(null);
  const markerRef = useRef(null);
  const [spot, setSpot] = useState(null); // { latitude, longitude }
  const [name, setName] = useState('');
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState('');
  const asked = useRef(0);
  const typed = useRef(false); // the person typed a name: suggestions don't replace it

  useEffect(() => {
    const map = createMap(elementRef.current);
    fitPoints(map, book.places, { maxZoom: 10, animate: false }); // around the places you have
    map.on('click', async (e) => {
      const latitude = Math.round(e.latlng.lat * 1e5) / 1e5; // about 1 m – plenty
      const longitude = Math.round(L.Util.wrapNum(e.latlng.lng, [-180, 180], true) * 1e5) / 1e5;
      if (markerRef.current) markerRef.current.setLatLng(e.latlng);
      else markerRef.current = L.marker(e.latlng, { icon: pinIcon({ state: 'highlight' }), interactive: false }).addTo(map);
      setSpot({ latitude, longitude });
      setError('');
      // suggest a name for the spot (the person can change it)
      const question = ++asked.current;
      setLooking(true);
      try {
        const { data } = await api.get(`/api/books/${book.id}/places/name`, { params: { lat: latitude, lon: longitude } });
        if (question === asked.current && !typed.current) setName(data.name);
      } catch {
        // no suggestion – the person types a name
      } finally {
        if (question === asked.current) setLooking(false);
      }
    });
    return () => map.remove();
  }, [book.id]); // (made once; book.places only sets the first view)

  const take = (e) => {
    e.preventDefault();
    // the picker is drawn over the page, but React still passes its events on to the memory's
    // form around it – which would save the whole memory
    e.stopPropagation();
    if (!spot) return setError('Tippe zuerst auf die Karte.');
    if (!name.trim()) return setError('Bitte gib dem Ort einen Namen.');
    onPick({ name: name.trim(), ...spot });
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Ort auf der Karte wählen">
      <form onSubmit={take} className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-purple-700">📍 Ort auf der Karte wählen</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-gray-100" aria-label="Schließen"><X className="w-5 h-5" /></button>
        </div>
        <div ref={elementRef} className="w-full h-[55vh] rounded-2xl overflow-hidden border border-purple-200" data-testid="picker-map" />
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => { typed.current = e.target.value !== ''; setName(e.target.value); }}
            maxLength={100}
            placeholder={spot ? (looking ? 'Name wird gesucht …' : 'Name des Orts') : 'Tippe auf die Karte'}
            aria-label="Name des Orts"
            className="flex-1 min-w-0 p-2.5 border border-purple-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-400"
          />
          <button type="submit" disabled={!spot} className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold disabled:opacity-40">Übernehmen</button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>,
    document.body,
  );
}
