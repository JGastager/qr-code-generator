'use strict';

const $ = (sel) => document.querySelector(sel);

const els = {
  qr: $('#qr'),
  error: $('#error'),
  url: $('#url'),
  finalUrl: $('#final-url'),
  utmInputs: [...document.querySelectorAll('[data-utm]')],
  utmCount: $('#utm-count'),
  utmSection: $('#utm-section'),
  customParams: $('#custom-params'),
  paramTemplate: $('#param-row'),
  addParam: $('#add-param'),
  clearUtm: $('#clear-utm'),
  remember: $('#remember'),
  ecl: $('#ecl'),
  copy: $('#copy'),
  download: $('#download'),
};

// Loaded inside the in-page popover (content.js) rather than Chrome's popup.
const EMBEDDED = new URLSearchParams(location.search).has('embed');

function postToPopover(message) {
  if (EMBEDDED) window.parent.postMessage(message, '*');
}

// Encode text as UTF-8 so non-ASCII URLs survive scanning.
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

let currentSvg = null;
let currentUrl = '';

// ---------------------------------------------------------------------------
// URL building

function collectParams() {
  const params = [];
  for (const input of els.utmInputs) {
    const value = input.value.trim();
    if (value) params.push([input.dataset.utm, value]);
  }
  for (const row of els.customParams.querySelectorAll('.param-row')) {
    const key = row.querySelector('.key').value.trim();
    const value = row.querySelector('.value').value.trim();
    if (key) params.push([key, value]);
  }
  return params;
}

function buildUrl() {
  const base = els.url.value.trim();
  if (!base) throw new Error('Enter a URL to encode.');

  const params = collectParams();
  els.utmCount.hidden = params.length === 0;
  els.utmCount.textContent = params.length;

  if (params.length === 0) return base;

  let url;
  try {
    url = new URL(base);
  } catch {
    throw new Error('Parameters can only be added to a valid absolute URL.');
  }
  for (const [key, value] of params) url.searchParams.set(key, value);
  return url.toString();
}

// ---------------------------------------------------------------------------
// QR rendering

function createSvg(text) {
  const qr = qrcode(0, els.ecl.value);
  qr.addData(text);
  qr.make();

  // Black modules on a transparent background, no quiet zone.
  const size = qr.getModuleCount();

  // Merge horizontal runs of dark modules into single path segments.
  let d = '';
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!qr.isDark(row, col)) { col++; continue; }
      const start = col;
      while (col < size && qr.isDark(row, col)) col++;
      d += `M${start} ${row}h${col - start}v1h${start - col}z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges">`
    + `<path d="${d}" fill="#000000"/>`
    + '</svg>';
}

function render() {
  try {
    currentUrl = buildUrl();
    currentSvg = createSvg(currentUrl);
    els.qr.innerHTML = currentSvg;
    els.finalUrl.textContent = currentUrl;
    els.error.hidden = true;
  } catch (err) {
    currentSvg = null;
    currentUrl = '';
    els.qr.innerHTML = '';
    els.finalUrl.textContent = '';
    els.error.textContent = typeof err === 'string' ? err : err.message || 'Could not generate QR code.';
    if (/overflow|code length/i.test(els.error.textContent)) {
      els.error.textContent = 'The URL is too long for a QR code. Try a lower error correction level.';
    }
    els.error.hidden = false;
  }
  els.download.disabled = !currentSvg;
  els.copy.disabled = !currentUrl;
}

// ---------------------------------------------------------------------------
// Custom parameter rows

function addParamRow(key = '', value = '') {
  const row = els.paramTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector('.key').value = key;
  row.querySelector('.value').value = value;
  row.querySelector('.remove').addEventListener('click', () => {
    row.remove();
    onChange();
  });
  els.customParams.append(row);
  return row;
}

// ---------------------------------------------------------------------------
// Persistence

const STORAGE_KEY = 'settings';

function snapshot() {
  const utm = {};
  for (const input of els.utmInputs) utm[input.dataset.utm] = input.value;
  const custom = [...els.customParams.querySelectorAll('.param-row')].map((row) => [
    row.querySelector('.key').value,
    row.querySelector('.value').value,
  ]);
  return {
    remember: els.remember.checked,
    utm: els.remember.checked ? utm : {},
    custom: els.remember.checked ? custom : [],
    ecl: els.ecl.value,
  };
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ [STORAGE_KEY]: snapshot() }), 250);
}

async function restore() {
  const { [STORAGE_KEY]: s } = await chrome.storage.local.get(STORAGE_KEY);
  if (!s) return;
  els.remember.checked = s.remember !== false;
  for (const input of els.utmInputs) input.value = s.utm?.[input.dataset.utm] ?? '';
  for (const [key, value] of s.custom ?? []) addParamRow(key, value);
  if (s.ecl) els.ecl.value = s.ecl;
  if (collectParams().length) els.utmSection.open = true;
}

// ---------------------------------------------------------------------------
// Actions

function filenameFor(url) {
  let name = 'qr-code';
  try {
    const { hostname, pathname } = new URL(url);
    name = `qr-${hostname}${pathname}`;
  } catch { /* keep default */ }
  name = name.replace(/[^a-z0-9.-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${name.slice(0, 80) || 'qr-code'}.svg`;
}

function download() {
  if (!currentSvg) return;
  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', currentSvg], { type: 'image/svg+xml' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filenameFor(currentUrl);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

async function copyUrl() {
  if (!currentUrl) return;
  await navigator.clipboard.writeText(currentUrl);
  const label = els.copy.textContent;
  els.copy.textContent = 'Copied!';
  setTimeout(() => { els.copy.textContent = label; }, 1200);
}

function onChange() {
  render();
  save();
}

// ---------------------------------------------------------------------------
// Init

async function init() {
  // Keep the toolbar icon in sync with the theme, in case the offscreen watcher isn't running.
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  chrome.runtime.sendMessage({ type: 'color-scheme', scheme: dark ? 'dark' : 'light' }).catch(() => {});

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  els.url.value = tab?.url ?? '';

  await restore();

  document.addEventListener('input', (e) => {
    if (e.target !== els.url) save();
    render();
  });
  document.addEventListener('change', onChange);
  els.addParam.addEventListener('click', () => {
    addParamRow().querySelector('.key').focus();
  });
  els.clearUtm.addEventListener('click', () => {
    for (const input of els.utmInputs) input.value = '';
    els.customParams.replaceChildren();
    onChange();
  });
  els.download.addEventListener('click', download);
  els.copy.addEventListener('click', copyUrl);

  if (EMBEDDED) {
    document.documentElement.classList.add('embed');
    $('#close').addEventListener('click', () => postToPopover({ type: 'qr-popover:close' }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') postToPopover({ type: 'qr-popover:close' });
    });
    // Let the popover size its iframe to the content. Scrolling stays off unless the popover
    // says the content doesn't fit the window, so the frame never flashes a scrollbar while
    // it grows or is off by a rounding pixel.
    document.documentElement.style.overflowY = 'hidden';
    new ResizeObserver(() => {
      postToPopover({ type: 'qr-popover:resize', height: Math.ceil(document.body.getBoundingClientRect().height) });
    }).observe(document.body);
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || e.data?.type !== 'qr-popover:scrollable') return;
      document.documentElement.style.overflowY = e.data.scrollable ? 'auto' : 'hidden';
    });
  }

  render();
}

init();
