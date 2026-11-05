-- Width and height of each photo (in pixels, as it's shown: already turned upright), so the
-- app's photo view can lay out its rows before the photos have loaded. New uploads get them
-- right away; for photos uploaded before, run once: npm run photos:sizes
-- Empty = not known (yet); the app then shows the photo as a square.
ALTER TABLE images
  ADD COLUMN width INTEGER CHECK (width > 0),
  ADD COLUMN height INTEGER CHECK (height > 0);
