'use strict';

// Reports the current browser color scheme to the service worker, now and on every change.
const query = matchMedia('(prefers-color-scheme: dark)');

function report() {
  chrome.runtime.sendMessage({ type: 'color-scheme', scheme: query.matches ? 'dark' : 'light' });
}

query.addEventListener('change', report);
report();
