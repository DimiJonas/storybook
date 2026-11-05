-- Cover photo ("Titelbild") of a memory, chosen independently of the photo order.
-- Empty = none chosen yet: then the first photo is used (memories from before this change).
-- If the cover photo is deleted, the memory simply has no chosen cover any more (SET NULL).
ALTER TABLE chapters ADD COLUMN cover_image_id INTEGER REFERENCES images(id) ON DELETE SET NULL;
