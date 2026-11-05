-- Photos added to a memory later got the order numbers 0, 1, ... again and collided with the
-- existing ones. Order numbers were only ever set during upload, so the intended order is the
-- upload order: renumber each memory's photos 0..n-1 in upload order.
-- Upload order = the millisecond timestamp at the start of the filename ("1730000000000-x.jpg"),
-- then the old order number (photos of one upload can share a millisecond), then the id.
UPDATE images
SET display_order = numbered.new_order
FROM (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY chapter_id
        ORDER BY substring(filename from '^([0-9]+)-')::bigint NULLS LAST, display_order, id
    ) - 1 AS new_order
    FROM images
) AS numbered
WHERE images.id = numbered.id;

-- Faster loading of a memory's photos in their order
CREATE INDEX images_chapter_id_display_order_idx ON images (chapter_id, display_order);

-- Editing a memory used to overwrite created_at. From now on edits set updated_at instead.
-- (For memories edited before, created_at already holds the time of the last edit.)
ALTER TABLE chapters ADD COLUMN updated_at TIMESTAMP;
