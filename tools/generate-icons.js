// Renders the extension icons (anti-aliased, with alpha). Run: node tools/generate-icons.js
const zlib = require('zlib'), fs = require('fs'), path = require('path');
const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };

// Signed distance to a rounded box centred at (cx,cy) with half-size h and radius r.
const box = (x, y, cx, cy, h, r) => {
  const qx = Math.abs(x - cx) - h + r, qy = Math.abs(y - cy) - h + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const TOP = [0x5b, 0x8d, 0xff], BOTTOM = [0x1f, 0x4f, 0xd8]; // blue gradient
const WHITE = [255, 255, 255];

function sample(x, y, size) {
  // Chrome guideline: 128px icon has ~16px padding; small sizes use (almost) the full canvas.
  const pad = size >= 128 ? 0.11 : size >= 48 ? 0.06 : 0.02;
  const half = 0.5 - pad, radius = half * 0.46;
  const inBg = box(x, y, 0.5, 0.5, half, radius) <= 0;

  if (!inBg) {
    // Soft drop shadow for the larger sizes.
    if (size < 48) return [0, 0, 0, 0];
    const d = box(x, y, 0.5, 0.5 + 0.02, half, radius);
    const a = Math.max(0, 1 - d / 0.05) ** 2 * 0.28;
    return [10, 30, 80, a];
  }

  const t = (x + y) / 2;
  let col = mix(TOP, BOTTOM, Math.min(1, Math.max(0, (t - pad) / (1 - 2 * pad))));

  // QR motif inside the tile.
  const inner = half * 0.64;                     // half-size of the motif area
  const s = inner * 0.43;                        // finder half-size
  const c0 = 0.5 - inner + s, c1 = 0.5 + inner - s;
  const finders = [[c0, c0], [c1, c0], [c0, c1]];
  const small = size <= 16;
  for (const [cx, cy] of finders) {
    const outer = box(x, y, cx, cy, s, s * 0.42);
    const hole = box(x, y, cx, cy, s * (small ? 0.5 : 0.64), s * 0.3);
    const dot = box(x, y, cx, cy, s * (small ? 0.5 : 0.34), s * 0.16);
    if ((outer <= 0 && hole > 0) || dot <= 0) col = WHITE;
  }
  // Data dots in the bottom-right quadrant.
  const g = s * 2 / 3, dr = g * 0.36;
  const dots = small ? [[0, 0], [2, 2]] : [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]];
  for (const [i, j] of dots) {
    const cx = c1 - s + g / 2 + i * g, cy = c1 - s + g / 2 + j * g;
    if (Math.hypot(x - cx, y - cy) <= (small ? g * 0.55 : dr)) col = WHITE;
  }
  return [...col, 1];
}

function png(size, sampler = sample) {
  const SS = 8, rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const [cr, cg, cb, ca] = sampler((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, size);
        r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
      }
      const o = 1 + px * 4;
      if (a > 0) { row[o] = Math.round(r / a); row[o + 1] = Math.round(g / a); row[o + 2] = Math.round(b / a); }
      row[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// Monochrome toolbar glyph, designed on a 16px grid so it stays crisp at 1x and 2x.
// Chrome's native toolbar icon colors for light and dark mode.
const GLYPH_COLORS = { light: [0x47, 0x47, 0x47], dark: [0xe3, 0xe3, 0xe3] };
const FINDERS = [[1, 1], [9, 1], [1, 9]];               // top-left corner of each 6x6 finder
const DOTS = [[9, 9], [13, 9], [11, 11], [9, 13], [13, 13]]; // top-left corner of each 2x2 dot

function glyphSampler(color) {
  return (x, y) => {
    x *= 16; y *= 16;
    let on = false;
    for (const [fx, fy] of FINDERS) {
      const ring = box(x, y, fx + 3, fy + 3, 3, 1.4) <= 0 && box(x, y, fx + 3, fy + 3, 2, 0.6) > 0;
      const dot = box(x, y, fx + 3, fy + 3, 1, 0.35) <= 0;
      if (ring || dot) on = true;
    }
    for (const [dx, dy] of DOTS) if (box(x, y, dx + 1, dy + 1, 1, 0.45) <= 0) on = true;
    return on ? [...color, 1] : [0, 0, 0, 0];
  };
}

const out = (...p) => path.join(__dirname, '..', 'icons', ...p);
// Colored tile: extensions page and Web Store.
for (const s of [16, 32, 48, 128]) fs.writeFileSync(out(`icon${s}.png`), png(s));
// Toolbar glyphs: "light" is for light browser themes (dark glyph), "dark" for dark themes.
for (const [theme, color] of Object.entries(GLYPH_COLORS)) {
  fs.mkdirSync(out(theme), { recursive: true });
  for (const s of [16, 32]) fs.writeFileSync(out(theme, `icon${s}.png`), png(s, glyphSampler(color)));
}
