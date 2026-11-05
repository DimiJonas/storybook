// The running logins (step 14) – and ending them, e.g. when a phone was lost:
//
//   npm run sessions                    list the running logins (who, device, since, last used)
//   npm run sessions -- --end anna       end all logins of "anna" (on every device)
//   npm run sessions -- --end-all       end everyone's logins (everyone logs in again)
//
// Ending works within half a minute (the backend remembers checked logins that long). Logging out
// in the app ends that one login right away. A new password (npm run user:password) ends the
// user's logins too.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');
const { dbConfig } = require('../src/db');

const args = process.argv.slice(2);
const endUser = args.includes('--end') ? args[args.indexOf('--end') + 1] : null;
const endAll = args.includes('--end-all');
const day = (d) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

const main = async () => {
  if ((args.includes('--end') && !endUser) || args.some((a) => a.startsWith('--') && !['--end', '--end-all'].includes(a))) {
    console.error('Usage: npm run sessions    or    npm run sessions -- --end <username>    or    npm run sessions -- --end-all');
    process.exitCode = 1;
    return;
  }
  const db = new Client(dbConfig());
  await db.connect();
  try {
    if (endUser || endAll) {
      const { rows: users } = endAll ? { rows: [] } : await db.query('SELECT id FROM users WHERE username = $1', [endUser]);
      if (endUser && !users.length) throw new Error(`There is no user "${endUser}".`);
      const { rowCount } = await db.query(
        `UPDATE sessions SET ended_at = now() WHERE ended_at IS NULL AND expires_at > now()${endAll ? '' : ' AND user_id = $1'}`,
        endAll ? [] : [users[0].id]
      );
      console.log(`${rowCount} login(s) ended${endAll ? '' : ` for "${endUser}"`}. They stop working within half a minute.`);
      return;
    }
    const { rows } = await db.query(
      `SELECT u.username, s.device, s.remember, s.created_at, s.last_used_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.ended_at IS NULL AND s.expires_at > now()
       ORDER BY u.username, s.last_used_at DESC`
    );
    if (!rows.length) console.log('No running logins.');
    for (const r of rows) {
      console.log(`${r.username.padEnd(12)} ${(r.device || '?').padEnd(22)} since ${day(r.created_at)}, last used ${day(r.last_used_at)}, ` +
        `${r.remember ? `stays logged in until ${day(r.expires_at)} (renewed when used)` : `until the browser closes (at most ${day(r.expires_at)})`}`);
    }
  } finally {
    await db.end();
  }
};

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
