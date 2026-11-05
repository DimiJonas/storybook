// Places (step 11): the storybook's shared list (table places), the places of a memory
// (memory_places) and the town a photo was taken in (images.place_id).
//
// Photos: phones save the exact GPS position in each photo. When a photo is uploaded (and once
// for older photos: npm run photos:places), its position is turned into the town it lies in
// (Nominatim, see geocoder.js), that town becomes the photo's place, and the position is then
// removed from the file – the picture itself isn't changed (exiftool, no re-compressing). Exact
// photo positions are never saved anywhere.
// A memory gets the towns of its photos as places by itself – as long as nobody chose places
// for it by hand (memory_places.from_photos).
const path = require('path');
const { execFile } = require('child_process');
const { reverse, GeocoderError } = require('./geocoder');

const MAX_NAME_LENGTH = 100;

// "Gardasee" -> ok; checks a place name from the app
const placeName = (value) => {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name && [...name].length <= MAX_NAME_LENGTH && !/\p{Cc}/u.test(name) ? name : null;
};
const isLatitude = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
const isLongitude = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;

// The place for { name, latitude, longitude, osm_key }: the existing one if it's already in the
// list (same OpenStreetMap object, or the same name within about 1 km), otherwise a new one.
const findOrCreatePlace = async (db, { name, latitude, longitude, osm_key: osmKey }, userId) => {
  if (osmKey) {
    const { rows } = await db.query('SELECT * FROM places WHERE osm_key = $1', [osmKey]);
    if (rows[0]) return rows[0];
  }
  const near = await db.query(
    `SELECT * FROM places
     WHERE lower(name) = lower($1) AND abs(latitude - $2) < 0.01 AND abs(longitude - $3) < 0.015
     ORDER BY id LIMIT 1`,
    [name, latitude, longitude]
  );
  if (near.rows[0]) return near.rows[0];
  const { rows } = await db.query(
    `INSERT INTO places (name, latitude, longitude, osm_key, user_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (osm_key) DO UPDATE SET osm_key = EXCLUDED.osm_key
     RETURNING *`,
    [name.slice(0, MAX_NAME_LENGTH), latitude, longitude, osmKey || null, userId]
  );
  return rows[0];
};

// Gives a memory exactly these places, in this order (IDs no longer in the list are ignored).
// Places it keeps stay marked as they were (from photos or not); new ones count as chosen by hand.
// Returns { added, removed }: the names of the places that came and went.
const setMemoryPlaces = async (db, memoryId, placeIds) => {
  const { rows: valid } = await db.query('SELECT id FROM places WHERE id = ANY($1::int[])', [placeIds]);
  const ids = placeIds.filter((id, i) => placeIds.indexOf(id) === i && valid.some((v) => v.id === id));
  const { rows: before } = await db.query(
    'SELECT mp.place_id, p.name FROM memory_places mp JOIN places p ON p.id = mp.place_id WHERE mp.memory_id = $1',
    [memoryId]
  );
  const removed = before.filter((b) => !ids.includes(b.place_id));
  await db.query('DELETE FROM memory_places WHERE memory_id = $1 AND NOT (place_id = ANY($2::int[]))', [memoryId, ids]);
  await db.query(
    `INSERT INTO memory_places (memory_id, place_id, position)
     SELECT $1, o.id, o.pos FROM unnest($2::int[]) WITH ORDINALITY AS o(id, pos)
     ON CONFLICT (memory_id, place_id) DO UPDATE SET position = EXCLUDED.position`,
    [memoryId, ids]
  );
  const { rows: added } = await db.query(
    'SELECT name FROM places WHERE id = ANY($1::int[]) ORDER BY array_position($1::int[], id)',
    [ids.filter((id) => !before.some((b) => b.place_id === id))]
  );
  return { added: added.map((p) => p.name), removed: removed.map((p) => p.name) };
};

// Adds the towns of a memory's photos to its places – unless places were chosen for it by hand.
// Returns the names of the places added.
const addPhotoPlaces = async (db, memoryId) => {
  const { rows: [{ manual }] } = await db.query(
    'SELECT count(*) FILTER (WHERE NOT from_photos)::int AS manual FROM memory_places WHERE memory_id = $1',
    [memoryId]
  );
  if (manual > 0) return [];
  const { rows } = await db.query(
    `INSERT INTO memory_places (memory_id, place_id, position, from_photos)
     SELECT $1, i.place_id, 1000 + min(i.display_order), true
     FROM images i WHERE i.memory_id = $1 AND i.place_id IS NOT NULL
     GROUP BY i.place_id
     ON CONFLICT (memory_id, place_id) DO NOTHING
     RETURNING place_id`,
    [memoryId]
  );
  if (rows.length === 0) return [];
  const { rows: names } = await db.query('SELECT name FROM places WHERE id = ANY($1::int[]) ORDER BY name', [rows.map((r) => r.place_id)]);
  return names.map((p) => p.name);
};

// --- photo positions (exiftool) -----------------------------------------------------------------
class ExiftoolMissing extends Error {}
const exiftool = (args) =>
  new Promise((resolve, reject) => {
    execFile('exiftool', args, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err?.code === 'ENOENT') reject(new ExiftoolMissing('exiftool is not installed'));
      else if (err) reject(Object.assign(err, { stderr })); // stderr: exiftool's own explanation
      else resolve(stdout);
    });
  });

// The GPS position saved in a photo: { latitude, longitude } or null
const readPosition = async (file) => {
  const [info] = JSON.parse(await exiftool(['-n', '-json', '-GPSLatitude', '-GPSLongitude', file]));
  const latitude = Number(info?.GPSLatitude);
  const longitude = Number(info?.GPSLongitude);
  if (!isLatitude(latitude) || !isLongitude(longitude) || (latitude === 0 && longitude === 0)) return null;
  return { latitude, longitude };
};

// Removes every position from a photo (EXIF GPS and the XMP copies of it), without touching the
// picture; checks afterwards that none is left
const removePosition = async (file) => {
  await exiftool(['-overwrite_original', '-gps:all=', '-xmp-exif:gps*=', '-q', '-q', file]);
  if (await readPosition(file)) throw new Error(`position still in ${path.basename(file)}`);
};

// What a photo tells about its place (nothing is changed):
//   { status: 'town', position, town }   a position, and the town it lies in
//   { status: 'noTown', position }       a position, but no town there (e.g. on the sea)
//   { status: 'noPosition' }             no GPS position in the file (phones and browsers often
//                                        remove it when a photo is shared or uploaded)
//   { status: 'unreadable', error }      exiftool couldn't read the file
//   { status: 'pending' }                the place search can't be reached right now
// Throws ExiftoolMissing without exiftool.
const inspectPhoto = async (file) => {
  let position;
  try {
    position = await readPosition(file);
  } catch (err) {
    if (err instanceof ExiftoolMissing) throw err;
    return { status: 'unreadable', error: String(err.stderr || err.message).trim().split('\n')[0] };
  }
  if (!position) return { status: 'noPosition' };
  try {
    const town = await reverse(position.latitude, position.longitude, 10);
    return town ? { status: 'town', position, town } : { status: 'noTown', position };
  } catch (err) {
    if (err instanceof GeocoderError) return { status: 'pending' };
    throw err;
  }
};

// Looks at one photo: its town becomes its place, its position is removed from the file.
// Returns what inspectPhoto found, plus { place } and { removed: true } if a position was removed.
// 'pending' and 'unreadable' leave the photo as it is (not marked as looked at, so
// npm run photos:places tries it again).
const locatePhoto = async (db, dir, image, userId) => {
  const file = path.join(dir, image.filename);
  const found = await inspectPhoto(file);
  if (found.status === 'pending' || found.status === 'unreadable') return found;
  const place = found.town ? await findOrCreatePlace(db, found.town, userId) : null;
  if (found.position) await removePosition(file);
  await db.query('UPDATE images SET place_id = $2, place_checked = true WHERE id = $1', [image.id, place?.id ?? null]);
  return { ...found, place, removed: Boolean(found.position) };
};

module.exports = {
  placeName, isLatitude, isLongitude, findOrCreatePlace, setMemoryPlaces, addPhotoPlaces,
  readPosition, removePosition, inspectPhoto, locatePhoto, ExiftoolMissing,
};
