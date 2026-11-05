-- Logins (step 14): every login is a row here; the browser keeps a random key for it in a cookie
-- (HttpOnly – scripts can't read it). Only a hash of the key is stored, so a database dump or a
-- backup contains no usable logins. Logging out, a new password, or
-- `npm run sessions -- --end <name>` end a login (ended_at); expired and ended rows are removed
-- after 30 days.
--   remember: "Angemeldet bleiben" – 30 days, renewed while the app is used; otherwise the login
--             ends with the browser (cookie without expiry date) and at the latest after 24 h
CREATE TABLE sessions (
    token_hash CHAR(64) PRIMARY KEY,          -- SHA-256 of the cookie's key (hex)
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    remember BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    device VARCHAR(100)                       -- "Android · Chrome" (from the browser's User-Agent)
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
