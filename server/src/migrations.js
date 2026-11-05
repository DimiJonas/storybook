// Database migrations (used by scripts/migrate.js and scripts/create-storybook.js).
//
//   server/migrations/*.sql        shared: run once per database (users, creating book_1, ...)
//   server/migrations/book/*.sql   per storybook: run in every storybook's schema (book_<n>)
//
// Each scope remembers its applied migrations in its own table schema_migrations
// (public.schema_migrations, book_1.schema_migrations, ...). Each file runs in a transaction:
// it's applied completely or not at all.
const path = require('path');
const fs = require('fs');
const { listSchemas } = require('./storybooks');

const SHARED_DIR = path.join(__dirname, '..', 'migrations');
const BOOK_DIR = path.join(SHARED_DIR, 'book');
const BASELINE = '000_baseline.sql';

const migrationFiles = (dir) => fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

// Apply the pending migrations from `dir` inside `schema`. Returns false if one failed.
const migrateScope = async (db, { schema, dir, label, listOnly = false, log = console.log }) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  const applied = new Set(
    (await db.query(`SELECT name FROM "${schema}".schema_migrations`)).rows.map((r) => r.name)
  );

  // A database from before migrations existed: it already has the baseline tables
  if (schema === 'public' && applied.size === 0) {
    const { rows } = await db.query("SELECT to_regclass('public.chapters') IS NOT NULL AS exists");
    if (rows[0].exists) {
      await db.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [BASELINE]);
      applied.add(BASELINE);
      log(`Existing database detected: recorded ${BASELINE} as already applied.`);
    }
  }

  const files = migrationFiles(dir);
  const pending = files.filter((f) => !applied.has(f));
  log(`${label}:`);
  for (const f of files) log(`${applied.has(f) ? '  applied ' : '  PENDING '} ${f}`);
  if (listOnly) return true;

  for (const f of pending) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await db.query('BEGIN');
      // unqualified table names in the file refer to this schema
      await db.query(`SET LOCAL search_path TO "${schema}", public`);
      await db.query(sql);
      await db.query(`INSERT INTO "${schema}".schema_migrations (name) VALUES ($1)`, [f]);
      await db.query('COMMIT');
      log(`  applied now: ${f}`);
    } catch (err) {
      await db.query('ROLLBACK');
      log(`  FAILED: ${f} – nothing of this migration was applied.`);
      log(`  ${err.message}`);
      throw err;
    }
  }
  return true;
};

// Shared migrations first (they may create storybooks), then every storybook
const migrateAll = async (db, { listOnly = false, log = console.log } = {}) => {
  await migrateScope(db, { schema: 'public', dir: SHARED_DIR, label: 'Shared (public)', listOnly, log });
  for (const schema of await listSchemas(db)) {
    await migrateScope(db, { schema, dir: BOOK_DIR, label: `Storybook ${schema}`, listOnly, log });
  }
};

module.exports = { migrateAll, migrateScope, BOOK_DIR, SHARED_DIR };
