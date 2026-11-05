-- Memories must never disappear by accident. Until now, deleting a user from the users table
-- would have deleted all memories that user wrote, too (ON DELETE CASCADE). From now on the
-- database refuses to delete a user who still has memories (ON DELETE RESTRICT).
-- To keep someone out of the app, lock the login instead: npm run user:password -- <name> --lock
ALTER TABLE chapters DROP CONSTRAINT chapters_user_id_fkey;
ALTER TABLE chapters ADD CONSTRAINT chapters_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
