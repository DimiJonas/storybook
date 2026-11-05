-- "chapters" was the code's old name for memories. Step 7 introduces "Kapitel" (= chapters), so
-- the memories get their proper name: table chapters -> memories, images.chapter_id -> memory_id.
-- Only names change: no data is copied, all IDs stay the same, and the ID counter, the
-- constraints and the index are renamed to match (each only if it exists under the old name).
ALTER TABLE chapters RENAME TO memories;
ALTER TABLE images RENAME COLUMN chapter_id TO memory_id;

DO $$
DECLARE
  -- [table, old constraint name, new constraint name]
  renames text[][] := ARRAY[
    ['memories', 'chapters_pkey',                'memories_pkey'],
    ['memories', 'chapters_user_id_fkey',        'memories_user_id_fkey'],
    ['memories', 'chapters_end_date_after_start', 'memories_end_date_after_start'],
    ['memories', 'chapters_cover_image_id_fkey', 'memories_cover_image_id_fkey'],
    ['images',   'images_chapter_id_fkey',       'images_memory_id_fkey']
  ];
  r text[];
BEGIN
  FOREACH r SLICE 1 IN ARRAY renames LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint
               WHERE conname = r[2] AND conrelid = to_regclass(quote_ident(r[1]))) THEN
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', r[1], r[2], r[3]);
    END IF;
  END LOOP;
END $$;

ALTER SEQUENCE IF EXISTS chapters_id_seq RENAME TO memories_id_seq;
ALTER INDEX IF EXISTS images_chapter_id_display_order_idx RENAME TO images_memory_id_display_order_idx;
