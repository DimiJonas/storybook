// Creates all app icons from one picture: client/app-icon.png
// (a rounded-square icon on a plain light background, like the first sketch).
//
//   cd server && node scripts/make-app-icons.js            (uses client/app-icon.png)
//   cd server && node scripts/make-app-icons.js other.png
//
// Writes to client/public/:
//   icon-192.png, icon-512.png    the design as it is, transparent outside the rounded square
//                                 (browsers, desktop, Android without its own icon shape)
//   icon-maskable-512.png         for Android, which cuts icons into its own shape (often a
//                                 circle): design at 76 % on a blurred copy of its background
//   apple-touch-icon.png          for iPhone/iPad (180 px): full square, iOS rounds the corners
//                                 itself – the white corners of the design are filled in
//   favicon.ico                   16/32/48 px for the browser tab
//   splash-icon.webp              the design (360 px, small file) for the app's start screen
// Afterwards rebuild the client.
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const source = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'client', 'app-icon.png'));
const outDir = path.join(__dirname, '..', '..', 'client', 'public');

// Where is the rounded square? Scan from the edges for the first pixel that isn't background.
const findArtwork = async (input) => {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = (x, y) => { const i = (y * width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  const bg = px(2, 2);
  const isBg = (p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 30;
  const midX = Math.floor(width / 2), midY = Math.floor(height / 2);
  let left = 0; while (left < width && isBg(px(left, midY))) left++;
  let right = width - 1; while (right > 0 && isBg(px(right, midY))) right--;
  let top = 0; while (top < height && isBg(px(midX, top))) top++;
  let bottom = height - 1; while (bottom > 0 && isBg(px(midX, bottom))) bottom--;
  // corner radius from how far in the artwork starts along the diagonal
  let d = 0; while (d < 600 && isBg(px(left + d, top + d))) d++;
  const radius = Math.round(d / (1 - 1 / Math.SQRT2));
  return { left, top, right, bottom, radius };
};

const roundedMask = (size, inset, radius, blur = 0) =>
  sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <rect x="${inset}" y="${inset}" width="${size - 2 * inset}" height="${size - 2 * inset}"
             rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  )).blur(blur > 0.3 ? blur : false).png().toBuffer();

// .ico file containing PNG images (understood by all current browsers)
const makeIco = (pngs) => {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
};

const main = async () => {
  const { left, top, right, bottom, radius } = await findArtwork(source);
  const size = Math.max(right - left, bottom - top) + 1;
  const cx = Math.round((left + right) / 2), cy = Math.round((top + bottom) / 2);
  const art = await sharp(source).removeAlpha()
    .extract({ left: cx - Math.floor(size / 2), top: cy - Math.floor(size / 2), width: size, height: size })
    .png().toBuffer();
  console.log(`artwork found: ${size}x${size} px, corner radius ~${radius} px`);

  // 1) the design with transparent corners (6 px inside the drawn edge, slightly soft)
  const inset = Math.round(size * 0.006);
  const rounded = await sharp(art)
    .composite([{ input: await roundedMask(size, inset, radius - inset, 1.5), blend: 'dest-in' }])
    .png().toBuffer();

  // 2) full square: enlarged, blurred copy behind the design fills the corners with its colors
  const big = Math.round(size * 1.3);
  const backdrop = await sharp(art).resize(big, big)
    .extract({ left: Math.floor((big - size) / 2), top: Math.floor((big - size) / 2), width: size, height: size })
    .blur(size * 0.04).png().toBuffer();
  const full = await sharp(backdrop).composite([{ input: rounded }]).png().toBuffer();

  // 3) maskable: design at 76 % with soft edges on a blurred copy of the full square
  const maskable = async (n) => {
    const k = Math.round(n * 0.76), f = Math.round(k * 0.06);
    const feather = await roundedMask(k, f, Math.round(k * 0.2), f * 0.6);
    const small = await sharp(full).resize(k, k).composite([{ input: feather, blend: 'dest-in' }]).png().toBuffer();
    return sharp(full).resize(n, n).blur(n * 0.06)
      .composite([{ input: small, left: Math.floor((n - k) / 2), top: Math.floor((n - k) / 2) }])
      .removeAlpha().png().toBuffer();
  };

  const write = async (name, buffer) => { fs.writeFileSync(path.join(outDir, name), buffer); console.log(`  ${name}`); };
  await write('icon-192.png', await sharp(rounded).resize(192, 192).png().toBuffer());
  await write('icon-512.png', await sharp(rounded).resize(512, 512).png().toBuffer());
  await write('icon-maskable-512.png', await maskable(512));
  // no transparency at all: iOS would show transparent parts as black
  await write('apple-touch-icon.png', await sharp(full).resize(180, 180).removeAlpha().png().toBuffer());
  const ico = [];
  for (const s of [16, 32, 48]) ico.push({ size: s, data: await sharp(rounded).resize(s, s).png().toBuffer() });
  await write('favicon.ico', makeIco(ico));
  await write('splash-icon.webp', await sharp(rounded).resize(360, 360).webp({ quality: 85 }).toBuffer());
  console.log(`Done – icons written to ${outDir}. Now rebuild the client.`);
};

main().catch((err) => { console.error(err.message); process.exit(1); });
