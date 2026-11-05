// Rows of photos that fill the width exactly, each photo in its own shape ("justified" rows, like
// Google Photos). Needs every photo's width/height before it has loaded – the server sends them
// (images.width/height); a photo without them is shown as a square.

// Very wide or very tall photos are cut a little, so a panorama doesn't become a thin strip
export const MIN_ASPECT = 0.5;
export const MAX_ASPECT = 3;

// width / height of a photo for the layout
export const aspectOf = (image) =>
  image?.width > 0 && image?.height > 0 ? Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, image.width / image.height)) : 1;

// How high a row should be, depending on the available width (phone / tablet / laptop)
export const targetRowHeight = (width) => (width < 640 ? 120 : width < 1024 ? 170 : 220);

// Splits photos (their aspects, in order) into rows for the given width:
//   [{ start, end, height, full }] – photos start..end-1, all with this height
// Full rows are exactly as wide as `width` (photos + `gap` between them); their height is close to
// `target`: a row ends when the next photo would make it narrower than that, or – if it's closer
// to the target – just before. The last row (not full) keeps the target height and isn't stretched.
export const justifyRows = (aspects, width, target, gap = 4) => {
  const rows = [];
  let start = 0;
  let sum = 0; // sum of the aspects in the current row
  const heightFor = (aspectSum, count) => (width - gap * (count - 1)) / aspectSum;
  for (let i = 0; i < aspects.length; i++) {
    sum += aspects[i];
    const count = i - start + 1;
    if (sum * target + gap * (count - 1) < width) continue; // still room
    const withThis = heightFor(sum, count);
    const withoutThis = count > 1 ? heightFor(sum - aspects[i], count - 1) : Infinity;
    if (Math.abs(withoutThis - target) < Math.abs(withThis - target)) {
      rows.push({ start, end: i, height: withoutThis, full: true }); // this photo starts the next row
      start = i;
      sum = aspects[i];
      if (sum * target >= width) { // a single photo that fills a row by itself
        rows.push({ start, end: i + 1, height: heightFor(sum, 1), full: true });
        start = i + 1;
        sum = 0;
      }
    } else {
      rows.push({ start, end: i + 1, height: withThis, full: true });
      start = i + 1;
      sum = 0;
    }
  }
  if (start < aspects.length) rows.push({ start, end: aspects.length, height: target, full: false });
  return rows;
};
