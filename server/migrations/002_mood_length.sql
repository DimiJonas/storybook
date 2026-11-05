-- Room for longer emojis as moods: some emojis consist of several characters
-- (e.g. 👨‍👩‍👧‍👦 = 7, emojis with skin tones and combinations even more). Existing moods stay as they are.
ALTER TABLE chapters ALTER COLUMN mood TYPE VARCHAR(32);
