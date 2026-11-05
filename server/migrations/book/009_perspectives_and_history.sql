-- Perspectives: a person's own text about a memory ("Aus Annas Sicht"), next to the shared main
-- text. One per person and memory; only that person can write, change or remove it.
CREATE TABLE perspectives (
    id SERIAL PRIMARY KEY,
    memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    text TEXT NOT NULL CHECK (text <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (memory_id, author_id)
);

-- History of a memory: who changed what, when (only for reading – nothing is restored from it).
-- `changes` (JSON), see src/history.js:
--   { "created": true }                                   the memory was created
--   { "title": { "before": "...", "after": "..." } }      also "content", "mood"
--   { "date": { "before": { "date": ..., "end_date": ... }, "after": { ... } } }
--   { "perspectives": { "<author id>": { "before": "...", "after": "..." } } }
--   { "tags": true }                                      tags changed (which ones isn't kept)
--   { "photos": { "added": 2, "removed": 1 } }            how many, not which
-- Saves by the same person within 15 minutes are combined into one entry.
CREATE TABLE memory_history (
    id SERIAL PRIMARY KEY,
    memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    changes JSONB NOT NULL
);
CREATE INDEX memory_history_memory_id_idx ON memory_history (memory_id, id);

-- The memories that already exist: "created" by their author when they were created, and – if
-- they were changed later – one entry "edited before the history began" (who and what isn't known)
INSERT INTO memory_history (memory_id, user_id, created_at, updated_at, changes)
SELECT id, user_id, COALESCE(created_at, now()), COALESCE(created_at, now()), '{"created": true, "beforeHistory": true}'
FROM memories;

INSERT INTO memory_history (memory_id, user_id, created_at, updated_at, changes)
SELECT id, NULL, updated_at, updated_at, '{"editedBeforeHistory": true}'
FROM memories
WHERE updated_at IS NOT NULL AND updated_at > COALESCE(created_at, updated_at) + interval '1 minute'
ORDER BY id;
