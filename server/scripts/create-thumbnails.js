// Creates the small photo versions (thumb/ and medium/) for all photos that don't have them yet,
// in every storybook's photo folder (uploads/book_<n>/). Safe to run again: existing versions
// are skipped. Useful after restoring photos from a backup (the backup has only the originals).
//
//   npm run photos:thumbnails
//   (on the server, as the backend's user: sudo storybook-run photos:thumbnails)
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { uploadDir, ensureDirs, createVariants } = require('../src/images');
const { SCHEMA_PATTERN } = require('../src/storybooks');

const main = async () => {
  const folders = fs
    .readdirSync(uploadDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SCHEMA_PATTERN.test(e.name))
    .map((e) => path.join(uploadDir, e.name));
  if (folders.length === 0) console.log(`No storybook photo folders (book_<n>) in ${uploadDir}`);

  for (const dir of folders) {
    ensureDirs(dir);
    const files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    console.log(`${dir}: ${files.length} photos`);
    let failed = 0;
    for (const [i, filename] of files.entries()) {
      const ok = await createVariants(dir, filename);
      if (!ok) failed++;
      console.log(`  [${i + 1}/${files.length}] ${ok ? 'ok    ' : 'FAILED'} ${filename}`);
    }
    console.log(`  ${files.length - failed} ok, ${failed} failed (those keep using the original photo).`);
  }
};

main();
