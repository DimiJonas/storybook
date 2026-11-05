// One-time move for multiple storybooks: photos that are still directly in an uploads folder
// (from before storybooks had their own folders) are moved into its book_1/ folder:
//
//   <folder>/<photo>               -> <folder>/book_1/<photo>
//   <folder>/thumb/<photo>.webp    -> <folder>/book_1/thumb/<photo>.webp
//   <folder>/medium/<photo>.webp   -> <folder>/book_1/medium/<photo>.webp
//
//   npm run photos:move-to-storybook                    the app's uploads folder and, if it
//                                                       exists, ~/backups/storybook/uploads
//   npm run photos:move-to-storybook -- <folder> ...    these folders (e.g. the backup copy
//                                                       on your computer: ~/storybook-backups/uploads)
//   add --dry-run to only show what would happen
//
// Safe to run again. If a photo already exists at the new place (e.g. copied there by a backup
// pull), the old one is removed only if both files are identical in size; otherwise both are
// kept and it's reported.
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { uploadDir } = require('../src/images');

const TARGET = 'book_1';
const dryRun = process.argv.includes('--dry-run');
const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const backupCopy = path.join(os.homedir(), 'backups', 'storybook', 'uploads');
const folders = args.length ? args.map((a) => path.resolve(a)) : [uploadDir, ...(fs.existsSync(backupCopy) ? [backupCopy] : [])];

const filesIn = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name) : [];

const moveFolder = (root) => {
  if (!fs.existsSync(root)) {
    console.log(`${root}: doesn't exist – skipped`);
    return;
  }
  const stats = { moved: 0, duplicates: 0, conflicts: 0 };
  // originals directly in the folder, and the small versions in thumb/ and medium/
  for (const sub of ['', 'thumb', 'medium']) {
    const from = path.join(root, sub);
    const to = path.join(root, TARGET, sub);
    const files = filesIn(from);
    if (files.length && !dryRun) fs.mkdirSync(to, { recursive: true });
    for (const name of files) {
      const src = path.join(from, name);
      const dst = path.join(to, name);
      if (fs.existsSync(dst)) {
        if (fs.statSync(dst).size === fs.statSync(src).size) {
          if (!dryRun) fs.rmSync(src);
          stats.duplicates++;
        } else {
          console.log(`  CONFLICT, both kept: ${src} and ${dst} differ`);
          stats.conflicts++;
        }
        continue;
      }
      if (!dryRun) fs.renameSync(src, dst);
      stats.moved++;
    }
    // remove the then empty old thumb/ and medium/ folders
    if (sub && !dryRun && fs.existsSync(from) && fs.readdirSync(from).length === 0) fs.rmdirSync(from);
  }
  console.log(
    `${root}: ${dryRun ? 'would move' : 'moved'} ${stats.moved} files to ${TARGET}/` +
      (stats.duplicates ? `, ${stats.duplicates} already there (old copy ${dryRun ? 'would be ' : ''}removed)` : '') +
      (stats.conflicts ? `, ${stats.conflicts} conflicts (see above)` : '')
  );
};

console.log(dryRun ? 'Dry run – nothing is changed.' : 'Moving photos into storybook folders.');
folders.forEach(moveFolder);
