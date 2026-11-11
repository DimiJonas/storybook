// Fills in the width and height of photos that don't have them yet (photos uploaded before
// step 9; new uploads get them right away). The photo view needs them to lay out its rows.
//
//   npm run photos:sizes
//   (on the server, as the backend's user: sudo storybook-run photos:sizes … – the same, without the "--")
//
// Run from the server folder, on the server (where the photos are) and – if you keep photos
// there too – on your computer. Safe to run again: only photos without a size are looked at.
// Photos that can't be read keep no size; the app shows them as squares.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');
const { dbConfig } = require('../src/db');
const { listSchemas, photoDirFor } = require('../src/storybooks');
const { photoSize } = require('../src/images');

const main = async () => {
  const db = new Client(dbConfig());
  await db.connect();
  try {
    for (const schema of await listSchemas(db)) {
      const dir = photoDirFor(schema);
      const { rows } = await db.query(`SELECT id, filename FROM "${schema}".images WHERE width IS NULL ORDER BY id`);
      let filled = 0;
      let missing = 0;
      for (const { id, filename } of rows) {
        if (!fs.existsSync(path.join(dir, filename))) {
          missing++;
          continue;
        }
        const size = await photoSize(dir, filename);
        if (!size) {
          console.log(`  ${schema}: can't read ${filename} – it stays a square`);
          continue;
        }
        await db.query(`UPDATE "${schema}".images SET width = $2, height = $3 WHERE id = $1`, [id, size.width, size.height]);
        filled++;
      }
      console.log(`${schema}: ${rows.length} photos without size, ${filled} filled in` +
        (missing ? `, ${missing} not in ${dir} (run this where the photos are)` : ''));
    }
  } finally {
    await db.end();
  }
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
