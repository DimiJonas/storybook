-- Personal settings of each user (⋮ → Einstellungen in the app), saved with the account so they
-- are the same on all of that person's devices. Only the settings that were changed are stored,
-- e.g. {"showTagsOnCards": true}; the others use their default (see server/src/settings.js).
ALTER TABLE users ADD COLUMN settings JSONB NOT NULL DEFAULT '{}'::jsonb;
