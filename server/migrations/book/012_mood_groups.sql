-- Mood groups (step 12): which emoji belongs to which mood group, edited on the page
-- ⋮ → "Stimmungen bearbeiten". The six groups themselves are fixed (their names, patterns and
-- lightness are in the app, client/src/moods.js); only their emojis can be added and removed.
-- An emoji is in at most one group. Emojis in no group (typed in with "Anderes Emoji…") count as
-- "Anderes". Memories store only the emoji itself, so changing the groups never changes a memory.
--   position: the order within the group in the mood picker (new ones go to the end)
CREATE TABLE mood_emojis (
    id SERIAL PRIMARY KEY,
    emoji VARCHAR(32) NOT NULL UNIQUE CHECK (emoji <> ''),
    mood_group VARCHAR(20) NOT NULL
        CHECK (mood_group IN ('gluecklich', 'verliebt', 'entspannt', 'abenteuer', 'nachdenklich', 'schwierig')),
    position INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT, -- who added it (empty: from the start)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- the list every storybook started with (until now it was fixed in the app)
INSERT INTO mood_emojis (emoji, mood_group, position) VALUES
    ('😊', 'gluecklich', 0), ('😄', 'gluecklich', 1), ('😂', 'gluecklich', 2),
    ('🥳', 'gluecklich', 3), ('🤩', 'gluecklich', 4), ('😎', 'gluecklich', 5),
    ('🥰', 'verliebt', 0), ('😍', 'verliebt', 1), ('💖', 'verliebt', 2),
    ('💕', 'verliebt', 3), ('😘', 'verliebt', 4), ('💑', 'verliebt', 5),
    ('😌', 'entspannt', 0), ('😴', 'entspannt', 1), ('☕', 'entspannt', 2), ('🌿', 'entspannt', 3),
    ('🔥', 'abenteuer', 0), ('🌈', 'abenteuer', 1), ('✈️', 'abenteuer', 2),
    ('🏔️', 'abenteuer', 3), ('🌊', 'abenteuer', 4), ('🎉', 'abenteuer', 5),
    ('🤔', 'nachdenklich', 0), ('🥹', 'nachdenklich', 1), ('😮', 'nachdenklich', 2),
    ('😢', 'schwierig', 0), ('😭', 'schwierig', 1), ('😠', 'schwierig', 2),
    ('😤', 'schwierig', 3), ('🤒', 'schwierig', 4);
