-- Places (step 11): a shared list per storybook, like the tags – "Zuhause" or "Gardasee" exists
-- once and is picked again for later memories. Coordinates are those of the place itself (a
-- town's centre, a search result or a spot tapped on the map) – never where a photo was taken.
--   osm_key: the OpenStreetMap object it came from ("relation/44915"), so the same town found
--   again (search, photos) is recognised; empty for places tapped on the map
CREATE TABLE places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL CHECK (name <> ''),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    osm_key VARCHAR(40) UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The places of a memory, in their order. from_photos: added by itself from the towns of the
-- memory's photos (that only happens while nobody chose a place for it by hand)
CREATE TABLE memory_places (
    memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    from_photos BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (memory_id, place_id)
);
CREATE INDEX memory_places_place_id_idx ON memory_places (place_id);

-- The town a photo was taken in (from its GPS position, which is then removed from the file).
-- place_checked: the photo was looked at (with or without a position); photos uploaded before
-- step 11 are looked at once by "npm run photos:places".
ALTER TABLE images
  ADD COLUMN place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
  ADD COLUMN place_checked BOOLEAN NOT NULL DEFAULT false;
