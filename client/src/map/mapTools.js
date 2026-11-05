// Everything the maps of the app share (Karte, the small map on the detail page, the place picker
// in the form). Loaded only when a map is shown (it's a separate download).
//   - map pictures ("tiles") come from this server (/tiles/..., which fetches and keeps them from
//     OpenStreetMap – see ops/root/nginx/storybook.conf)
//   - markers are pins drawn with CSS classes only (index.css: .sb-pin), no inline styles
import L from './leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { API_URL } from '../config';

export { L };

const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende';

// A map in `element`. interactive: false = a still picture (no moving, zooming or keys).
export const createMap = (element, { interactive = true } = {}) => {
  const map = L.map(element, {
    zoomControl: interactive,
    dragging: interactive,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    scrollWheelZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
    tap: false,
    attributionControl: true,
    worldCopyJump: true,
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.tileLayer(`${API_URL}/tiles/{z}/{x}/{y}.png`, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  return map;
};

// A pin. state: '' | 'highlight' | 'dim'; count > 1 shows the number of memories on it
export const pinIcon = ({ count = 1, state = '' } = {}) =>
  L.divIcon({
    className: `sb-pin ${state}`.trim(),
    html: `<span class="sb-pin-head">${count > 1 ? `<span class="sb-pin-count">${Number(count)}</span>` : ''}</span>`,
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
  });

// The view that shows all these points (at most zoom `maxZoom`, so a single place isn't shown
// street by street)
export const fitPoints = (map, points, { maxZoom = 12, padding = 40, animate = true } = {}) => {
  if (points.length === 0) {
    map.setView([50.5, 10], 4, { animate }); // Europe
    return;
  }
  map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), { maxZoom, padding: [padding, padding], animate });
};
