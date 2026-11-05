// Applies database migrations that this database hasn't had yet:
// first the shared ones (server/migrations/), then the per-storybook ones
// (server/migrations/book/) in every storybook. See src/migrations.js.
//
//   npm run migrate              apply new migrations
//   npm run migrate -- --list    only show which are applied / pending
//
// Afterwards, on your computer, update the schema snapshot:  npm run db:schema
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');
const { dbConfig } = require('../src/db');
const { migrateAll } = require('../src/migrations');

const listOnly = process.argv.includes('--list');

const permissionHint = (err) => {
  if (/must be owner|permission denied/.test(err.message)) {
    console.error(
      `  The database user "${process.env.DB_USER}" isn't allowed to create or change tables.\n` +
        '  See "Database migrations: one-time setup" in ops/README.md.'
    );
  }
};

const main = async () => {
  const client = new Client(dbConfig());
  await client.connect();
  try {
    await migrateAll(client, { listOnly });
    if (!listOnly) console.log('Database is up to date. On your computer, update the snapshot: npm run db:schema');
  } finally {
    await client.end();
  }
};

main().catch((err) => {
  console.error(err.message);
  permissionHint(err);
  process.exitCode = 1;
});
