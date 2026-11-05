-- Date ranges (roadmap step 5): a memory can last several days, e.g. a trip.
--   date       the (first) day, as before
--   end_date   the last day; empty (NULL) for a memory of a single day
-- A range always ends after it starts; a "range" of one day is stored as a single day
-- (end_date empty), so there is only one way to store it.
ALTER TABLE chapters ADD COLUMN end_date DATE;
ALTER TABLE chapters ADD CONSTRAINT chapters_end_date_after_start CHECK (end_date IS NULL OR end_date > date);
