-- Multiple storybooks: every storybook gets its own schema ("folder" in the database) named
-- book_<number>, with its own tables. The users stay shared in the public schema.
--
-- The existing storybook becomes book_1: its tables are moved there (nothing is copied, all IDs
-- stay the same; their ID counters, indexes and links move along).
CREATE SCHEMA book_1;

ALTER TABLE public.chapters SET SCHEMA book_1;
ALTER TABLE public.images SET SCHEMA book_1;
ALTER TABLE public.important_dates SET SCHEMA book_1;

-- The storybook's name (exactly one row), shown as the title of its home page
CREATE TABLE book_1.storybook_info (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO book_1.storybook_info (name) VALUES ('Unser Storybook');

-- From now on each storybook has its own list of applied storybook migrations
-- (server/migrations/book/). book_1 already has the structure of the starting point.
CREATE TABLE book_1.schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO book_1.schema_migrations (name) VALUES ('000_book_baseline.sql');
