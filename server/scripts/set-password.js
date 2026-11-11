// Create a login or give it a new password – the password is typed in hidden and never appears
// in the shell history (unlike `node -e "...hashSync('password')..."`).
//
//   npm run user:password -- anna            new user "anna", or new password for "anna"
//   npm run user:password -- anna --lock     lock "anna" out (random password nobody knows);
//                                           unlock by setting a new password again
//   npm run user:password -- --list         show all logins
//   (on the server, as the backend's user: sudo storybook-run user:password … – the same, without the "--")
//
// Users are never deleted: their memories belong to them (and the database refuses it).
// A new password or --lock also ends all running logins of that user (on every device; the app
// asks for the new password). Within half a minute, because the backend remembers checked logins
// that long.
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const bcrypt = require('bcrypt');
const { Client } = require('pg');
const { dbConfig } = require('../src/db');

const MIN_LENGTH = 12;
// Same cost as the comparison hash in src/index.js, so a login answer takes the same time
// whether the username exists or not
const BCRYPT_ROUNDS = 10;

const args = process.argv.slice(2);
const username = args.find((a) => !a.startsWith('--'));
const lock = args.includes('--lock');
const list = args.includes('--list');

// Asks a question without showing what is typed
const askHidden = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (text) => { if (!muted) rl.output.write(text); };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });

const main = async () => {
  if (!list && (!username || !/^[^\s]{1,50}$/.test(username))) {
    console.error('Usage: npm run user:password -- <username> [--lock]    or    npm run user:password -- --list\n(on the server: sudo storybook-run user:password <username> [--lock])');
    process.exitCode = 1;
    return;
  }
  const db = new Client(dbConfig());
  await db.connect();
  try {
    if (list) {
      const { rows } = await db.query('SELECT id, username FROM users ORDER BY id');
      for (const r of rows) console.log(`${r.id}  ${r.username}`);
      return;
    }
    const { rows: existing } = await db.query('SELECT id FROM users WHERE username = $1', [username]);

    let password;
    if (lock) {
      if (!existing.length) throw new Error(`There is no user "${username}".`);
      password = crypto.randomBytes(32).toString('hex'); // nobody knows it
    } else {
      password = await askHidden(`New password for "${username}" (at least ${MIN_LENGTH} characters): `);
      if (password.length < MIN_LENGTH) throw new Error(`Too short – at least ${MIN_LENGTH} characters.`);
      const again = await askHidden('Same password again: ');
      if (again !== password) throw new Error('The two passwords are different – nothing changed.');
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [username, hash]
    );
    let ended = 0;
    if (existing.length) {
      ({ rowCount: ended } = await db.query(
        'UPDATE sessions SET ended_at = now() WHERE user_id = $1 AND ended_at IS NULL AND expires_at > now()',
        [existing[0].id]
      ));
    }
    if (lock) console.log(`"${username}" is locked out (can't log in any more).`);
    else console.log(existing.length ? `New password for "${username}" saved.` : `User "${username}" created.`);
    if (ended) console.log(`${ended} running login(s) of "${username}" ended.`);
  } finally {
    await db.end();
  }
};

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
