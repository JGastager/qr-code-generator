'use strict';

// Swaps the toolbar icon between a dark and a light glyph to match the browser theme.
// Service workers can't use matchMedia, so an offscreen document watches
// prefers-color-scheme and reports changes here.

const OFFSCREEN_URL = 'offscreen.html';

function iconPaths(scheme) {
  return {
    16: `icons/${scheme}/icon16.png`,
    32: `icons/${scheme}/icon32.png`,
  };
}

async function applyScheme(scheme) {
  if (scheme !== 'dark' && scheme !== 'light') return;
  await chrome.action.setIcon({ path: iconPaths(scheme) });
}

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (existing.length) return;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['MATCH_MEDIA'],
      justification: 'Detect light/dark mode to show a matching toolbar icon.',
    });
  } catch (err) {
    // Another call may have created it in the meantime.
    if (!String(err?.message).includes('Only a single offscreen')) throw err;
  }
}

// Toolbar click: show the in-page popover. Pages that can't be scripted
// (chrome://, the Web Store, the PDF viewer, ...) get the regular popup instead.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch {
    await chrome.action.setPopup({ tabId: tab.id, popup: 'popup.html' });
    try {
      await chrome.action.openPopup({ windowId: tab.windowId });
    } catch {
      // openPopup isn't available everywhere; the next click opens the popup instead.
    }
  }
});

// Drop the fallback popup once the tab navigates, so normal pages get the popover again.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) chrome.action.setPopup({ tabId, popup: '' });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'color-scheme') applyScheme(msg.scheme);
});

chrome.runtime.onStartup.addListener(ensureOffscreen);
chrome.runtime.onInstalled.addListener(ensureOffscreen);
ensureOffscreen();
