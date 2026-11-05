-- Kapitel (life phases) of a storybook – called "phases" in the code, "Kapitel" in the app.
-- A Kapitel lasts from its start date until the next Kapitel starts, so they can't overlap and
-- there are no gaps. Memories aren't linked by hand: a memory belongs to the Kapitel in which its
-- first day falls (worked out in the app). Two Kapitel can't start on the same day.
CREATE TABLE phases (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    emoji VARCHAR(32),
    description TEXT,
    start_date DATE NOT NULL,
    user_id INTEGER REFERENCES public.users(id) ON DELETE RESTRICT, -- who created it
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT phases_start_date_key UNIQUE (start_date)
);
