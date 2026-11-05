// Creates a new, empty storybook:
//
//   npm run storybook:create -- "Familie"
//
// Creates the schema book_<next number> with all tables (storybook migrations), sets the name
// and creates its photo folder. The new storybook then appears in the app right away
// (no restart needed). The name can be changed later in the app's menu.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');
const { dbConfig } = require('../src/db');
const { migrateScope, BOOK_DIR } = require('../src/migrations');
const { listSchemas, idOf, photoDirFor } = require('../src/storybooks');

const name = (process.argv[2] || '').trim();

const main = async () => {
  if (!name || name.length > 100) {
    console.error('Usage: npm run storybook:create -- "Name of the storybook"   (at most 100 characters)');
    process.exit(1);
  }
  const db = new Client(dbConfig());
  await db.connect();
  let schema;
  try {
    const existing = await listSchemas(db);
    const next = existing.length ? Math.max(...existing.map(idOf)) + 1 : 1;
    schema = `book_${next}`;

    await db.query(`CREATE SCHEMA "${schema}"`);
    try {
      await migrateScope(db, { schema, dir: BOOK_DIR, label: `New storybook ${schema}`, log: () => {} });
      await db.query(`INSERT INTO "${schema}".storybook_info (name) VALUES ($1)`, [name]);
    } catch (err) {
      // don't leave a half-created storybook behind
      await db.query(`DROP SCHEMA "${schema}" CASCADE`).catch(() => {});
      throw err;
    }

    const dir = photoDirFor(schema);
    for (const sub of ['', 'thumb', 'medium']) fs.mkdirSync(path.join(dir, sub), { recursive: true });

    console.log(`Created storybook ${next}: "${name}"`);
    console.log(`  database schema: ${schema}`);
    console.log(`  photo folder:    ${dir}`);
  } finally {
    await db.end();
  }
};

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
