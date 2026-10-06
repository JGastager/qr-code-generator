// Builds the Chrome Web Store upload: dist/qr-code-generator-<version>.zip
// Only the files the extension needs at runtime are included. Run: node tools/package.js
const zlib = require('zlib'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'offscreen.html',
  'offscreen.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'lib/qrcode.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'icons/light/icon16.png',
  'icons/light/icon32.png',
  'icons/dark/icon16.png',
  'icons/dark/icon32.png',
];

const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// Fixed timestamp (2000-01-01 00:00) so the same sources always give the same zip.
const DOS_TIME = 0, DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// Every file referenced from the manifest must be packaged.
const referenced = [
  manifest.background?.service_worker,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.web_accessible_resources ?? []).flatMap((r) => r.resources),
].filter(Boolean);
for (const file of referenced) {
  if (!FILES.includes(file)) throw new Error(`${file} is referenced in manifest.json but not packaged`);
}

const locals = [], centrals = [];
let offset = 0;
for (const name of FILES) {
  const data = fs.readFileSync(path.join(ROOT, name));
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name);
  const sum = crc(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0x0800, 6);        // UTF-8 names
  local.writeUInt16LE(8, 8);             // deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  locals.push(local, nameBuf, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);          // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(sum, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + packed.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(FILES.length, 8);
end.writeUInt16LE(FILES.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `qr-code-generator-${manifest.version}.zip`);
fs.writeFileSync(outFile, Buffer.concat([...locals, ...centrals, end]));
console.log(`${path.relative(ROOT, outFile)} (${FILES.length} files)`);
