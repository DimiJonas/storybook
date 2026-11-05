// Photos and their smaller versions, so the app doesn't have to download the full-size originals.
// Every storybook has its own folder:
//
//   uploads/book_1/<filename>                  original, unchanged (full-screen view)
//   uploads/book_1/thumb/<filename>.webp       ~800 px wide, timeline and photo grids on phones/tablets
//   uploads/book_1/medium/<filename>.webp      ~1600 px wide, timeline and photo grids on big screens
//
// The client builds these URLs from the storybook and the filename; the database stores the
// filename and the photo's size (width/height, for the layout of the photo view).
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Photos (and their folders) must stay readable for nginx (www-data), which serves them. The
// server's shells use the umask 027 since step 15 (new files not readable for others) – the
// backend and the scripts that write photos (everything that loads this file) use 022 for
// themselves, whoever started them.
process.umask(0o022);

// Don't keep decoded images in memory between requests (keeps memory use low on a small server)
sharp.cache(false);

const uploadDir = process.env.NODE_ENV === 'production'
  ? '/etc/storybook/uploads'
  : path.join(__dirname, '../uploads');

const VARIANTS = {
  thumb: { width: 800, quality: 75 },
  medium: { width: 1600, quality: 80 },
};

const variantPath = (dir, variant, filename) => path.join(dir, variant, `${filename}.webp`);

// Make sure a storybook's photo folder (with thumb/ and medium/) exists
const ensureDirs = (dir) => {
  for (const variant of Object.keys(VARIANTS)) {
    fs.mkdirSync(path.join(dir, variant), { recursive: true });
  }
};

// Create all missing variants for one uploaded file in the photo folder `dir`. Never throws:
// if a photo can't be converted (e.g. HEIC), the client simply falls back to the original.
const createVariants = async (dir, filename) => {
  const original = path.join(dir, filename);
  for (const [variant, { width, quality }] of Object.entries(VARIANTS)) {
    const target = variantPath(dir, variant, filename);
    if (fs.existsSync(target)) continue;
    try {
      await sharp(original)
        .rotate() // apply the phone's orientation info, so portrait photos aren't sideways
        .resize({ width, withoutEnlargement: true })
        .webp({ quality })
        .toFile(target);
    } catch (err) {
      console.error(`Could not create ${variant} for ${filename}:`, err.message);
      return false;
    }
  }
  return true;
};

// Does the file's content start like a photo (JPEG, PNG, GIF, WebP, HEIC/HEIF, AVIF)?
// Every image format begins with a fixed "signature"; a web page or program renamed to .jpg doesn't.
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'mif2', 'avif', 'avis'];
const looksLikePhoto = (file) => {
  const head = Buffer.alloc(16);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, head, 0, 16, 0);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  const ascii = (start, end) => head.toString('latin1', start, end);
  return (
    (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) || // JPEG
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || // PNG
    ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a' ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') ||
    (ascii(4, 8) === 'ftyp' && HEIF_BRANDS.includes(ascii(8, 12))) // HEIC/HEIF/AVIF (iPhone photos)
  );
};

// Width and height of a photo as it's shown, i.e. turned upright like the small versions
// (phones save portrait photos as landscape pixels plus an "orientation" note). Returns
// { width, height }, or null if the photo can't be read (then the app shows it as a square).
const photoSize = async (dir, filename) => {
  try {
    const { width, height, orientation } = await sharp(path.join(dir, filename)).metadata();
    if (width > 0 && height > 0) return orientation >= 5 ? { width: height, height: width } : { width, height };
  } catch {
    // e.g. a format this server's sharp can't read – try the small version below
  }
  try {
    const { width, height } = await sharp(variantPath(dir, 'thumb', filename)).metadata();
    if (width > 0 && height > 0) return { width, height };
  } catch {
    // no small version either
  }
  return null;
};

const deleteVariants = (dir, filename) => {
  for (const variant of Object.keys(VARIANTS)) {
    fs.rmSync(variantPath(dir, variant, filename), { force: true });
  }
};

module.exports = { uploadDir, VARIANTS, ensureDirs, createVariants, deleteVariants, looksLikePhoto, photoSize };
