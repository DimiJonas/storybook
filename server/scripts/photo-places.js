// Looks at the photos that haven't been looked at yet (those uploaded before step 11, and any whose
// town couldn't be found at upload, e.g. because the place search wasn't reachable):
//   1. the town each photo was taken in becomes its place (OpenStreetMap, 1 request per second –
//      photos close to each other need only one)
//   2. the photo's GPS position is removed from the file (the picture itself isn't changed)
//   3. memories without places chosen by hand get the towns of their photos as places
//
//   npm run photos:places -- --dry-run   only shows which towns it finds (changes nothing)
//   npm run photos:places                does it
//
// Run on the server, from the server folder, as the user that runs the app (not with sudo).
// Needs exiftool (sudo apt install libimage-exiftool-perl). Safe to run again: photos already
// looked at are skipped. Removing the positions can't be undone (the nightly backup keeps the
// old files until it copies the changed ones).
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { Pool } = require('pg');
const { dbConfig } = require('../src/db');
const { listSchemas, photoDirFor, withStorybook } = require('../src/storybooks');
const { inspectPhoto, locatePhoto, addPhotoPlaces, ExiftoolMissing } = require('../src/places');
const { recordChange } = require('../src/history');

const dryRun = process.argv.includes('--dry-run');

// one line per photo
const describe = (r) =>
  r.status === 'town' ? r.town.name
    : r.status === 'noPosition' ? 'keine GPS-Position im Foto'
      : r.status === 'noTown' ? 'Position, aber kein Ort dort (z. B. auf dem Meer)'
        : r.status === 'pending' ? 'Ortssuche nicht erreichbar – später nochmal'
          : `Datei nicht lesbar: ${r.error}`;

const main = async () => {
  const pool = new Pool(dbConfig());
  try {
    for (const schema of await listSchemas(pool)) {
      const dir = photoDirFor(schema);
      const { rows: images } = await pool.query(
        `SELECT i.id, i.filename, i.memory_id, m.title, m.user_id
         FROM "${schema}".images i JOIN "${schema}".memories m ON m.id = i.memory_id
         WHERE NOT i.place_checked ORDER BY i.memory_id, i.display_order, i.id`
      );
      console.log(`${schema}: ${images.length} photos to look at${dryRun ? ' (dry run – nothing is changed)' : ''}`);
      const stats = { town: 0, noPosition: 0, noTown: 0, unreadable: 0, pending: 0, missing: 0, removed: 0 };
      const touched = new Set();
      for (const [n, image] of images.entries()) {
        const prefix = `  [${n + 1}/${images.length}] „${image.title}“`;
        if (!fs.existsSync(path.join(dir, image.filename))) {
          stats.missing++;
          continue;
        }
        // each photo in its own transaction: if the script stops, what's done stays done
        const result = dryRun
          ? await inspectPhoto(path.join(dir, image.filename))
          : await withStorybook(pool, schema, (db) => locatePhoto(db, dir, image, image.user_id));
        stats[result.status]++;
        if (result.removed) stats.removed++;
        if (result.place) touched.add(image.memory_id);
        console.log(`${prefix}: ${describe(result)}`);
      }
      let memories = 0;
      for (const memoryId of touched) {
        await withStorybook(pool, schema, async (db) => {
          const added = await addPhotoPlaces(db, memoryId);
          if (added.length) {
            memories++;
            // recorded without a person: it was done by this command
            await recordChange(db, memoryId, null, { places: { added, removed: [] } });
          }
        });
      }
      console.log(
        `${schema}: ${stats.town} with a town, ${stats.noPosition} without GPS position in the file` +
        (stats.noTown ? `, ${stats.noTown} with a position but no town` : '') +
        (stats.unreadable ? `, ${stats.unreadable} unreadable` : '') +
        (stats.missing ? `, ${stats.missing} not in ${dir}` : '') +
        (stats.pending ? `, ${stats.pending} to try again later (run this again)` : '') +
        (dryRun ? '' : `; ${memories} memories got places, ${stats.removed} positions removed from the photos`)
      );
      if (stats.noPosition > 0 && stats.town + stats.noTown === 0) {
        console.log(
          '  None of these photos contains a GPS position, so no town can be found. Phones and browsers\n' +
          '  often remove it when a photo is shared or uploaded (iPhone/Safari, Android/Chrome, messengers).\n' +
          '  Places can always be added in the form.'
        );
      }
    }
  } finally {
    await pool.end();
  }
};

main().catch((err) => {
  if (err instanceof ExiftoolMissing) console.error('exiftool is missing: sudo apt install libimage-exiftool-perl');
  else console.error(err.message);
  process.exit(1);
});
