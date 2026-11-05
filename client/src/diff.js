// Word-by-word differences between two texts, for the history of a memory:
//   diffWords('mit dem Zug nach', 'mit dem Auto nach')
//     -> [{ type: 'same', text: 'mit dem ' }, { type: 'removed', text: 'Zug' },
//         { type: 'added', text: 'Auto' }, { type: 'same', text: ' nach' }]
// compactDiff() shortens long unchanged stretches to "…" (type 'gap'), keeping a few words of
// context around each change.

// words and the spaces between them (so the text can be put together again exactly)
const tokenize = (text) => String(text ?? '').match(/\s+|[^\s]+/g) ?? [];

// Myers' algorithm: the shortest list of removals/additions turning a into b (lists of words).
// Returns null if the texts differ in more than `maxChanges` words (then: all removed, all added).
const myers = (a, b, maxChanges) => {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= max; d++) {
    if (d > maxChanges) return null;
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) {
        trace.push(v.slice(off - d, off + d + 1));
        return backtrack(trace, a, b);
      }
    }
    trace.push(v.slice(off - d, off + d + 1)); // positions for k = -d..d
  }
  return null;
};

const backtrack = (trace, a, b) => {
  const ops = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = (k) => trace[d - 1][k + d - 1];
    const k = x - y;
    const down = k === -d || (k !== d && prev(k - 1) < prev(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = prev(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ type: 'same', text: a[x - 1] }); x--; y--; }
    if (down) { ops.push({ type: 'added', text: b[y - 1] }); y--; }
    else { ops.push({ type: 'removed', text: a[x - 1] }); x--; }
  }
  while (x > 0 && y > 0) { ops.push({ type: 'same', text: a[x - 1] }); x--; y--; }
  return ops.reverse();
};

// Neighbouring pieces of the same kind joined: [{ type, text }]
const join = (ops) => {
  const parts = [];
  for (const op of ops) {
    if (parts.at(-1)?.type === op.type) parts.at(-1).text += op.text;
    else parts.push({ ...op });
  }
  return parts;
};

export const diffWords = (before, after, maxChanges = 2000) => {
  const a = tokenize(before);
  const b = tokenize(after);
  // the same beginning and end don't need the algorithm (much faster for long texts)
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const middleA = a.slice(start, endA);
  const middleB = b.slice(start, endB);
  const middle = myers(middleA, middleB, maxChanges) ?? [
    ...middleA.map((text) => ({ type: 'removed', text })),
    ...middleB.map((text) => ({ type: 'added', text })),
  ];
  return join([
    ...a.slice(0, start).map((text) => ({ type: 'same', text })),
    ...middle,
    ...a.slice(endA).map((text) => ({ type: 'same', text })),
  ]);
};

// Shortens unchanged stretches: keeps `context` words before and after each change, the rest
// becomes { type: 'gap' } ("…"). Texts without any change are returned as they are.
export const compactDiff = (parts, context = 6) => {
  if (!parts.some((p) => p.type !== 'same')) return parts;
  const words = (text) => tokenize(text);
  return parts.flatMap((part, i) => {
    if (part.type !== 'same') return [part];
    const tokens = words(part.text);
    const keep = context * 2; // a word and its space
    const first = i === 0;
    const last = i === parts.length - 1;
    if (first && tokens.length > keep) return [{ type: 'gap' }, { type: 'same', text: tokens.slice(-keep).join('') }];
    if (last && tokens.length > keep) return [{ type: 'same', text: tokens.slice(0, keep).join('') }, { type: 'gap' }];
    if (!first && !last && tokens.length > keep * 2 + 2) {
      return [
        { type: 'same', text: tokens.slice(0, keep).join('') },
        { type: 'gap' },
        { type: 'same', text: tokens.slice(-keep).join('') },
      ];
    }
    return [part];
  });
};
