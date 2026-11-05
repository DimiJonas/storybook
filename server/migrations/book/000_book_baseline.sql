-- The tables of one storybook, as they are when multiple storybooks were introduced
-- (= the old tables after migrations 000–002, plus storybook_info).
-- Runs inside the storybook's own schema (book_<number>); the users are shared in public.
-- The first storybook (book_1) got this structure by migration 003 instead.

CREATE TABLE storybook_info (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chapters (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
    mood VARCHAR(32),
    updated_at TIMESTAMP
);

CREATE TABLE images (
    id SERIAL PRIMARY KEY,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX images_chapter_id_display_order_idx ON images (chapter_id, display_order);

CREATE TABLE important_dates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.users(id),
    title TEXT NOT NULL,
    date DATE NOT NULL,
    recurring BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
