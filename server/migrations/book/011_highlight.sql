-- Highlights (step 12, "Unser Jahr"): a memory either of you marked as one of the best of its year
-- (👑 in the app). Shown on the cards and first in the year's review. Like the cover photo it's a
-- mark, not a change of the memory: it isn't recorded in the history and doesn't change updated_at.
ALTER TABLE memories ADD COLUMN highlight BOOLEAN NOT NULL DEFAULT false;
