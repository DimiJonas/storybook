-- Tags (step 8): a fixed list per storybook (e.g. "Reise", "Familie"), edited on the tags page;
-- each memory can have any number of them. They're used as filters in the timeline.
-- Two tags can't have the same name (upper/lower case doesn't count).
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    user_id INTEGER REFERENCES public.users(id) ON DELETE RESTRICT, -- who created it
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_name_key ON tags (lower(name));

-- Which memory has which tags. Deleting a tag removes it from its memories (the memories stay).
CREATE TABLE memory_tags (
    memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (memory_id, tag_id)
);
CREATE INDEX memory_tags_tag_id_idx ON memory_tags (tag_id);
