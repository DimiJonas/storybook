import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { L, createMap, pinIcon } from '../../map/mapTools';
import { api } from '../../api';
import { useStorybook } from '../../storybook';

// "Auf der Karte verschieben" on the places page: the map opens at the place; drag its pin or tap
// anywhere to put it there, "Speichern" saves the new position (the name stays). The old position
// stays visible as a faint pin. Its memories and photos follow (nothing changes in them).
const round = (n) => Math.round(n * 1e5) / 1e5; // about 1 m – plenty

export default function PlaceMover({ place, onClose }) {
  const book = useStorybook();
  const elementRef = useRef(null);
  const [spot, setSpot] = useState(null); // the new position, once moved: { latitude, longitude }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const map = createMap(elementRef.current);
    const start = [place.latitude, place.longitude];
    map.setView(start, 13, { animate: false });
    // where it was (faint, can't be grabbed) and the pin that moves
    L.marker(start, { icon: pinIcon({ state: 'dim' }), interactive: false, keyboard: false }).addTo(map);
    const pin = L.marker(start, { icon: pinIcon({ state: 'highlight' }), draggable: true, autoPan: true, zIndexOffset: 1000, title: 'Ziehen zum Verschieben' }).addTo(map);
    const moveTo = (latlng) => {
      pin.setLatLng(latlng);
      setSpot({ latitude: round(latlng.lat), longitude: round(L.Util.wrapNum(latlng.lng, [-180, 180], true)) });
      setError('');
    };
    pin.on('dragend', () => moveTo(pin.getLatLng()));
    map.on('click', (e) => moveTo(e.latlng));
    return () => map.remove();
  }, [place.latitude, place.longitude]);

  // Esc = Abbrechen
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!spot) return setError('Zieh die Nadel oder tippe auf die Karte, wo der Ort sein soll.');
    setBusy(true);
    setError('');
    try {
      await api.put(`/api/books/${book.id}/places/${place.id}`, spot);
      await book.reload();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Das hat nicht geklappt.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={`„${place.name}“ verschieben`}>
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-purple-700 min-w-0 break-words">📍 „{place.name}“ verschieben</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 shrink-0" aria-label="Schließen"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600">Zieh die Nadel an die richtige Stelle – oder tippe dort auf die Karte.</p>
        <div ref={elementRef} className="w-full h-[55vh] rounded-2xl overflow-hidden border border-purple-200" data-testid="mover-map" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="basis-full sm:basis-0 flex-1 text-xs text-gray-500" data-testid="mover-status">
            {spot ? 'Neue Position gewählt – die blasse Nadel zeigt, wo der Ort bisher war.' : 'Noch nicht verschoben.'}
          </span>
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-semibold">Abbrechen</button>
          <button type="button" onClick={save} disabled={busy || !spot} className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold disabled:opacity-40">Speichern</button>
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
