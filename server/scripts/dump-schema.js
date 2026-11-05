// Writes the current database structure (no data) to schema.sql in the project folder –
// the readable snapshot of the database. Run after applying migrations, on your computer:
//
//   npm run db:schema
//
// Same as the pg_dump command in project_maintenance_commands.txt, using the settings in .env.
// The result is the same on every computer with the same database structure:
// - it uses the pg_dump that matches the database server's version (Ubuntu's `pg_dump` command
//   otherwise picks the newest installed version for network connections, e.g. 18 next to a
//   version 16 server, which writes slightly different files)
// - it leaves out the "Dumped from/by version ..." comment lines
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const target = path.join(__dirname, '..', '..', 'schema.sql');

const serverMajorVersion = async () => {
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME || 'storybook',
    password: process.env.DB_PASSWORD,
    port: 5432,
  });
  await client.connect();
  const { rows } = await client.query('SHOW server_version_num');
  await client.end();
  return Math.floor(Number(rows[0].server_version_num) / 10000); // 160015 -> 16
};

const main = async () => {
  const major = await serverMajorVersion();
  const matching = `/usr/lib/postgresql/${major}/bin/pg_dump`;
  const pgDump = fs.existsSync(matching) ? matching : 'pg_dump';

  const args = [
    '-U', process.env.DB_USER,
    '-h', process.env.DB_HOST,
    '-p', '5432',
    '-d', process.env.DB_NAME || 'storybook',
    '--schema-only', '--no-owner', '--no-privileges',
    '--restrict-key=schema',
  ];
  const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };

  let result = spawnSync(pgDump, args, { env, encoding: 'utf8' });
  if (result.status !== 0 && /restrict-key/.test(result.stderr)) {
    // older pg_dump without --restrict-key
    result = spawnSync(pgDump, args.filter((a) => a !== '--restrict-key=schema'), { env, encoding: 'utf8' });
  }
  if (result.status !== 0) {
    console.error(result.error ? result.error.message : result.stderr);
    process.exit(1);
  }

  const sql = result.stdout
    .split('\n')
    .filter((line) => !/^-- Dumped (from database|by pg_dump) version /.test(line))
    .join('\n');
  fs.writeFileSync(target, sql);
  console.log(`Wrote ${target} (using ${pgDump}, server version ${major})`);
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
