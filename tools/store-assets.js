// Renders the Chrome Web Store images (and copies the store icon) into store/assets/ using the real popup UI.
// Needs Chrome or Edge (set CHROME_PATH to override). Run: node tools/store-assets.js
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'assets');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-store-assets-'));
const rootUrl = pathToFileURL(ROOT + path.sep).href;
const fileUrl = (p) => pathToFileURL(p).href;

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) throw new Error('Chrome not found. Set CHROME_PATH.');

const PAGE_URL = 'https://riverside-coffee.example/menu';
const SETTINGS = {
  remember: true,
  utm: { utm_source: 'flyer', utm_medium: 'print', utm_campaign: 'autumn_menu', utm_term: '', utm_content: '' },
  custom: [],
  ecl: 'M',
};

// popup.html with a stand-in for the extension APIs, loaded from the project folder.
function writePopup(name, { settings = SETTINGS, url = PAGE_URL } = {}) {
  const stub = `<script>
    window.chrome = {
      runtime: { sendMessage: () => Promise.resolve() },
      tabs: { query: async () => [{ url: ${JSON.stringify(url)} }] },
      storage: { local: { get: async () => ({ settings: ${JSON.stringify(settings)} }), set: async () => {} } },
    };
  </script>`;
  const html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8')
    .replace('<head>', `<head>\n  <base href="${rootUrl}">\n  ${stub}`);
  const file = path.join(TMP, name);
  fs.writeFileSync(file, html);
  return fileUrl(file);
}

const icon = (p) => `${rootUrl}icons/${p}`;
const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

// The popover as content.js draws it, sized from the popup's own resize messages.
const popover = (src, { top = 10, right = 10, dark = false, zoom = 1 } = {}) => `
  <div class="popover${dark ? ' dark' : ''}" style="top:${top}px;right:${right}px;zoom:${zoom}">
    <iframe src="${src}?embed=1"></iframe>
  </div>`;
const POPOVER_CSS = `
  .popover { position: absolute; width: 340px; border-radius: 16px; overflow: hidden; background: #fff;
    box-shadow: 0 16px 48px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.12); }
  .popover.dark { background: #202124; box-shadow: 0 16px 48px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
  .popover iframe { display: block; width: 100%; height: 560px; border: 0; }`;
const POPOVER_JS = `<script>
  addEventListener('message', (e) => {
    if (e.data?.type !== 'qr-popover:resize') return;
    for (const f of document.querySelectorAll('.popover iframe')) {
      if (f.contentWindow === e.source) f.style.height = Math.ceil(e.data.height) + 'px';
    }
  });
</script>`;

// Mock browser window: tab strip, toolbar with the extension icon, and a sample page.
function browserShot({ dark = false } = {}) {
  const c = dark
    ? { frame: '#1f1f1f', tab: '#3c3c3c', bar: '#3c3c3c', field: '#282828', text: '#e3e3e3', muted: '#a8a8a8', glyph: 'dark' }
    : { frame: '#dfe3e9', tab: '#ffffff', bar: '#ffffff', field: '#edf0f4', text: '#1f1f1f', muted: '#5f6368', glyph: 'light' };
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; width: 1280px; height: 800px; overflow: hidden; font: 14px/1.5 ${FONT}; background: ${c.frame}; }
    .tabs { height: 42px; padding: 8px 12px 0; display: flex; gap: 8px; }
    .tab { width: 240px; padding: 7px 14px; border-radius: 10px 10px 0 0; background: ${c.tab}; color: ${c.text};
      font-size: 12px; display: flex; gap: 8px; align-items: center; }
    .fav { width: 16px; height: 16px; border-radius: 4px; background: #6f4e37; }
    .bar { height: 46px; background: ${c.bar}; display: flex; align-items: center; gap: 12px; padding: 0 14px;
      border-bottom: 1px solid ${dark ? '#000' : '#d3d7dd'}; }
    .nav { width: 16px; height: 16px; border-radius: 50%; border: 2px solid ${c.muted}; opacity: .55; }
    .omni { flex: 1; height: 32px; border-radius: 16px; background: ${c.field}; color: ${c.text};
      display: flex; align-items: center; padding: 0 16px; font-size: 13px; }
    .omni b { font-weight: 400; color: ${c.muted}; }
    .ext { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: ${dark ? '#545454' : '#e3e7ed'}; }
    .page { position: relative; height: 712px; background: #faf6f0; overflow: hidden; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 22px 64px; }
    .logo { font: 700 22px Georgia, serif; color: #3b2a1e; }
    nav a { margin-left: 28px; color: #6b5444; text-decoration: none; }
    .hero { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; padding: 36px 64px; align-items: center; }
    h1 { font: 700 52px/1.1 Georgia, serif; color: #3b2a1e; margin: 0 0 18px; }
    .hero p { color: #6b5444; font-size: 17px; max-width: 420px; }
    .btn { display: inline-block; margin-top: 12px; padding: 12px 22px; border-radius: 999px; background: #3b2a1e; color: #fff; }
    .photo { height: 340px; border-radius: 24px; background: radial-gradient(circle at 35% 40%, #c89f74, #6f4e37 70%); }
    .menu { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 8px 64px; }
    .item { padding: 18px; border-radius: 14px; background: #fff; color: #3b2a1e; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    .item span { float: right; color: #6b5444; }
    ${POPOVER_CSS}
  </style></head><body>
    <div class="tabs"><div class="tab"><div class="fav"></div>Menu · Riverside Coffee</div></div>
    <div class="bar">
      <div class="nav"></div><div class="nav"></div>
      <div class="omni"><b>https://</b>riverside-coffee.example/menu</div>
      <div class="ext"><img src="${icon(`${c.glyph}/icon32.png`)}" width="16" height="16"></div>
    </div>
    <div class="page">
      <header><div class="logo">Riverside Coffee</div><nav><a>Menu</a><a>Locations</a><a>About</a></nav></header>
      <div class="hero">
        <div><h1>Autumn menu is here</h1><p>Spiced lattes, maple scones and our new single-origin roast. Order ahead and skip the line.</p><span class="btn">Order now</span></div>
        <div class="photo"></div>
      </div>
      <div class="menu">
        <div class="item">Pumpkin spice latte <span>€4.80</span></div>
        <div class="item">Maple pecan scone <span>€3.20</span></div>
        <div class="item">Ethiopia Guji filter <span>€3.90</span></div>
      </div>
      ${popover(writePopup('popup.html'), { dark, zoom: 0.94 })}
    </div>
    ${POPOVER_JS}
  </body></html>`;
}

// Promo images: icon, name, tagline and the popup.
function promo({ width, height, scale, showPopup, showCode = !showPopup }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; font-family: ${FONT};
      background: linear-gradient(135deg, #5b8dff, #1f4fd8); color: #fff; position: relative; }
    .text { position: absolute; left: ${Math.round(width * 0.07)}px; top: 50%; transform: translateY(-50%);
      max-width: ${Math.round(width * 0.5)}px; }
    .icon { width: ${Math.round(72 * scale)}px; height: ${Math.round(72 * scale)}px; display: block;
      margin-bottom: ${Math.round(16 * scale)}px; filter: drop-shadow(0 6px 16px rgba(0,0,0,.25)); }
    h1 { margin: 0; font-size: ${Math.round(34 * scale)}px; line-height: 1.1; letter-spacing: -.01em; }
    p { margin: ${Math.round(10 * scale)}px 0 0; font-size: ${Math.round(16 * scale)}px; line-height: 1.4; opacity: .92; }
    .shot { position: absolute; right: ${Math.round(width * 0.07)}px; top: 40px; }
    .shot .popover { position: static; }
    .code { position: absolute; right: ${Math.round(width * 0.08)}px; top: 50%; transform: translateY(-50%) rotate(-6deg);
      width: ${Math.round(height * 0.5)}px; padding: ${Math.round(height * 0.04)}px; border-radius: ${Math.round(height * 0.05)}px;
      background: #fff; box-shadow: 0 12px 32px rgba(0,0,0,.25); }
    .code svg { display: block; width: 100%; height: auto; }
    ${POPOVER_CSS}
  </style></head><body>
    <div class="text">
      <img class="icon" src="${icon('icon128.png')}">
      <h1>QR Code Generator</h1>
      <p>Print-ready SVG QR codes for any page, with UTM tracking built in.</p>
    </div>
    ${showCode ? `<div class="code" id="code"></div>
      <script src="${rootUrl}lib/qrcode.js"></script>
      <script>{ const q = qrcode(0, 'M'); q.addData(${JSON.stringify(PAGE_URL)}); q.make();
        document.getElementById('code').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }</script>` : ''}
    ${showPopup ? `<div class="shot">${popover(writePopup('popup.html'))}</div>` : ''}
    ${POPOVER_JS}
  </body></html>`;
}

function shoot(name, html, width, height, { dark = false } = {}) {
  const page = path.join(TMP, name.replace(/\.png$/, '.html'));
  fs.writeFileSync(page, html);
  const out = path.join(OUT, name);
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    `--blink-settings=preferredColorScheme=${dark ? 0 : 1}`,
    `--user-data-dir=${path.join(TMP, 'profile')}`,
    `--window-size=${width},${height}`,
    '--virtual-time-budget=5000',
    `--screenshot=${out}`,
    fileUrl(page),
  ], { stdio: 'ignore' });
  console.log(path.relative(ROOT, out));
}

fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'icons', 'icon128.png'), path.join(OUT, 'store-icon-128x128.png'));
console.log(path.relative(ROOT, path.join(OUT, 'store-icon-128x128.png')));
shoot('screenshot-1-light.png', browserShot(), 1280, 800);
shoot('screenshot-2-dark.png', browserShot({ dark: true }), 1280, 800, { dark: true });
shoot('promo-small-440x280.png', promo({ width: 440, height: 280, scale: 0.85, showPopup: false }), 440, 280);
shoot('promo-marquee-1400x560.png', promo({ width: 1400, height: 560, scale: 1.6, showPopup: true }), 1400, 560);
fs.rmSync(TMP, { recursive: true, force: true });
