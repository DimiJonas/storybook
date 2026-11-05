// Finding places by name and naming positions, with OpenStreetMap's free service Nominatim.
// Its rules (https://operations.osmfoundation.org/policies/nominatim/), kept here:
//   - at most 1 request per second (all requests of this server wait in one queue)
//   - an identifying User-Agent
//   - no search-as-you-type (the app only searches when "Suchen" is pressed)
//   - answers are kept (in memory, for a day), so the same question isn't asked twice
// NOMINATIM_URL can point somewhere else (tests use a small fake service).

const site = require('./site');

const BASE = (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
// identifies the app and its address (src/site.js) – without an address (a script on the
// server before site.conf exists) just the app
const userAgent = () => `Storybook/1.0 (private family app${site.appUrl() ? `; ${site.appUrl()}` : ''})`;
const SPACING_MS = 1100; // a little more than 1 second between requests
const MAX_WAITING = 8; // more requests waiting than this: "try again in a moment"
const CACHE_MS = 24 * 60 * 60 * 1000;

class GeocoderError extends Error {}
class GeocoderBusy extends GeocoderError {}

// --- one request per second, in order ------------------------------------------------------------
let queue = Promise.resolve();
let waiting = 0;
let lastRequest = 0;
const inTurn = (fn) => {
  if (waiting >= MAX_WAITING) return Promise.reject(new GeocoderBusy('too many requests waiting'));
  waiting += 1;
  const run = queue.then(async () => {
    const wait = lastRequest + SPACING_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    return fn();
  });
  queue = run.catch(() => {}).finally(() => { waiting -= 1; });
  return run;
};

const cache = new Map(); // question -> { at, value }
const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await fn();
  if (cache.size > 2000) cache.delete(cache.keys().next().value); // forget the oldest
  cache.set(key, { at: Date.now(), value });
  return value;
};

const request = (path, params) =>
  inTurn(async () => {
    const query = new URLSearchParams({ ...params, format: 'jsonv2', 'accept-language': 'de' });
    let response;
    try {
      response = await fetch(`${BASE}${path}?${query}`, {
        headers: { 'User-Agent': userAgent(), ...(site.appUrl() ? { Referer: `${site.appUrl()}/` } : {}) },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      throw new GeocoderError(`Nominatim not reachable: ${err.message}`);
    }
    if (!response.ok) throw new GeocoderError(`Nominatim answered ${response.status}`);
    return response.json();
  });

// A Nominatim result as a place: { name, label, latitude, longitude, osm_key }
const toPlace = (r) => ({
  name: String(r.name || r.display_name?.split(',')[0] || '').trim().slice(0, 100),
  label: String(r.display_name || r.name || ''),
  latitude: Number(r.lat),
  longitude: Number(r.lon),
  osm_key: r.osm_type && r.osm_id ? `${r.osm_type}/${r.osm_id}` : null,
});
const usable = (p) => p.name && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

// Places matching a name ("Gardasee"): up to 6
const search = (text) =>
  cached(`search:${text.toLowerCase()}`, async () => {
    const results = await request('/search', { q: text, limit: 6 });
    return (Array.isArray(results) ? results : []).map(toPlace).filter(usable);
  });

// The place a position lies in. zoom 10 = town/city (used for photos), 14 = neighbourhood/village
// (a spot tapped on the map). Returns null where there's nothing (e.g. on the sea).
// Kept per position rounded to about 1 km (only in memory, never saved).
const reverse = (latitude, longitude, zoom = 10) =>
  cached(`reverse:${zoom}:${latitude.toFixed(2)},${longitude.toFixed(2)}`, async () => {
    const result = await request('/reverse', { lat: latitude, lon: longitude, zoom });
    if (!result || result.error) return null;
    const place = toPlace(result);
    return usable(place) ? place : null;
  });

module.exports = { search, reverse, GeocoderError, GeocoderBusy };
