// History of a memory (table memory_history): who changed what, when. Only for reading –
// nothing is restored from it. What's kept per entry (`changes`):
//   created: true                         the memory was created (beforeHistory: before step 10)
//   editedBeforeHistory: true             changed before the history began (who/what unknown)
//   title, content, mood: { before, after }
//   date: { before: { date, end_date }, after: { date, end_date } }
//   perspectives: { <author id>: { before, after } }   ('' = there was none / it was removed)
//   tags: true                            tags changed (which ones isn't kept)
//   photos: { added, removed }            how many photos (not which)
//   places: { added: [names], removed: [names] }
//
// Saves by the same person within MERGE_MINUTES of the entry's start are combined into one
// entry (a save with 3 photo uploads becomes one entry; a typo fixed right away doesn't get its
// own). Within that time after creating a memory, everything counts as "created" (+ photos).

const MERGE_MINUTES = 15;
const TEXT_FIELDS = ['title', 'content', 'mood', 'date'];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Nothing in it worth an entry?
const isEmpty = (changes) =>
  Object.keys(changes).every((key) =>
    key === 'perspectives' ? Object.keys(changes.perspectives).length === 0
      : key === 'photos' ? !changes.photos.added && !changes.photos.removed
        : key === 'places' ? !changes.places.added.length && !changes.places.removed.length
          : !changes[key]);

// Combines a newer change into an older entry of the same person: for each field the first
// "before" and the last "after" (and away with fields that ended where they started)
const mergeChanges = (older, newer) => {
  const merged = structuredClone(older);
  const photos = { added: (older.photos?.added ?? 0) + (newer.photos?.added ?? 0), removed: (older.photos?.removed ?? 0) + (newer.photos?.removed ?? 0) };
  if (photos.added || photos.removed) merged.photos = photos;
  if (older.created) return merged; // still being created: only the photos count
  for (const field of TEXT_FIELDS) {
    if (!newer[field]) continue;
    merged[field] = { before: merged[field] ? merged[field].before : newer[field].before, after: newer[field].after };
    if (same(merged[field].before, merged[field].after)) delete merged[field];
  }
  for (const [author, change] of Object.entries(newer.perspectives ?? {})) {
    merged.perspectives ??= {};
    const before = merged.perspectives[author] ? merged.perspectives[author].before : change.before;
    if (before === change.after) delete merged.perspectives[author];
    else merged.perspectives[author] = { before, after: change.after };
  }
  if (merged.perspectives && Object.keys(merged.perspectives).length === 0) delete merged.perspectives;
  if (newer.tags) merged.tags = true;
  if (newer.places) {
    // a place added and removed again within the entry cancels out (and the other way round)
    const added = new Set(merged.places?.added ?? []);
    const removed = new Set(merged.places?.removed ?? []);
    for (const name of newer.places.added) { if (removed.has(name)) removed.delete(name); else added.add(name); }
    for (const name of newer.places.removed) { if (added.has(name)) added.delete(name); else removed.add(name); }
    if (added.size || removed.size) merged.places = { added: [...added], removed: [...removed] };
    else delete merged.places;
  }
  return merged;
};

// The changes between a memory before and after saving (as GET /memories sends them)
const diffMemories = (before, after) => {
  const changes = {};
  for (const field of ['title', 'content', 'mood']) {
    const a = before[field] ?? (field === 'content' ? '' : null);
    const b = after[field] ?? (field === 'content' ? '' : null);
    if (a !== b) changes[field] = { before: a, after: b };
  }
  const dateOf = (m) => ({ date: m.date, end_date: m.end_date ?? null });
  if (!same(dateOf(before), dateOf(after))) changes.date = { before: dateOf(before), after: dateOf(after) };
  if (!same([...before.tag_ids].sort(), [...after.tag_ids].sort())) changes.tags = true;
  const textsOf = (m) => new Map(m.perspectives.map((p) => [String(p.author_id), p.text]));
  const was = textsOf(before);
  const now = textsOf(after);
  for (const author of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(author) ?? '';
    const b = now.get(author) ?? '';
    if (a !== b) (changes.perspectives ??= {})[author] = { before: a, after: b };
  }
  return changes;
};

// Adds `changes` (by `userId`) to a memory's history – combined with the person's last entry if
// that started less than MERGE_MINUTES ago. Run inside the transaction of the change itself.
const recordChange = async (db, memoryId, userId, changes) => {
  if (isEmpty(changes)) return;
  const { rows: [last] } = await db.query(
    `SELECT id, user_id, changes, created_at > now() - make_interval(mins => $2) AS recent
     FROM memory_history WHERE memory_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [memoryId, MERGE_MINUTES],
  );
  const canMerge = last && last.recent && last.user_id === userId && !last.changes.beforeHistory && !last.changes.editedBeforeHistory;
  if (!canMerge) {
    await db.query('INSERT INTO memory_history (memory_id, user_id, changes) VALUES ($1, $2, $3)', [memoryId, userId, changes]);
    return;
  }
  const merged = mergeChanges(last.changes, changes);
  if (isEmpty(merged)) await db.query('DELETE FROM memory_history WHERE id = $1', [last.id]); // changed back
  else await db.query('UPDATE memory_history SET changes = $2, updated_at = now() WHERE id = $1', [last.id, merged]);
};

module.exports = { MERGE_MINUTES, mergeChanges, diffMemories, isEmpty, recordChange };
