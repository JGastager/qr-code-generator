'use strict';

// Injected on toolbar click. Shows the QR generator as a floating, rounded popover
// in the page. The UI itself is popup.html loaded in an iframe, inside a closed
// Shadow DOM so the page's styles and scripts can't reach it.
// Injecting again toggles the popover.

(() => {
  if (window.__qrPopover) {
    window.__qrPopover.toggle();
    return;
  }

  const WIDTH = 340;
  const MARGIN = 10;
  const STYLE = `
    :host { all: initial; }
    .panel {
      position: fixed;
      top: ${MARGIN}px;
      right: ${MARGIN}px;
      z-index: 2147483647;
      width: ${WIDTH}px;
      max-height: calc(100vh - ${MARGIN * 2}px);
      border-radius: 16px;
      overflow: hidden;
      background: #ffffff;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.12);
      transform-origin: top right;
      animation: open 120ms ease-out;
    }
    .panel.closing { animation: close 120ms ease-in forwards; }
    iframe {
      display: block;
      width: 100%;
      height: 520px;
      border: 0;
    }
    @media (prefers-color-scheme: dark) {
      .panel {
        background: #202124;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .panel, .panel.closing { animation-duration: 1ms; }
    }
    @keyframes open {
      from { opacity: 0; transform: translateY(-6px) scale(0.96); }
    }
    @keyframes close {
      to { opacity: 0; transform: translateY(-6px) scale(0.96); }
    }
  `;

  let host = null;
  let panel = null;
  let frame = null;

  function open() {
    contentHeight = 0;
    host = document.createElement('qr-code-popover');
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    panel = document.createElement('div');
    panel.className = 'panel';
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html?embed=1');
    frame.allow = 'clipboard-write';
    frame.title = 'QR Code Generator';
    frame.addEventListener('load', () => frame.focus());
    panel.append(frame);
    root.append(style, panel);
    document.documentElement.append(host);

    window.addEventListener('message', onMessage);
    document.addEventListener('mousedown', onOutsideClick, true);
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', fit);
  }

  function close() {
    if (!host || panel.classList.contains('closing')) return;
    window.removeEventListener('message', onMessage);
    document.removeEventListener('mousedown', onOutsideClick, true);
    window.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('resize', fit);
    const done = host;
    panel.classList.add('closing');
    panel.addEventListener('animationend', () => done.remove(), { once: true });
    host = panel = frame = null;
  }

  let contentHeight = 0;

  // Size the iframe to its content, capped at the window height. Only a capped
  // frame is allowed to scroll.
  function fit() {
    if (!frame || !contentHeight) return;
    const available = window.innerHeight - MARGIN * 2;
    const height = Math.min(contentHeight, available);
    frame.style.height = `${height}px`;
    frame.contentWindow.postMessage({ type: 'qr-popover:scrollable', scrollable: contentHeight > available }, '*');
  }

  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow) return;
    const { type, height } = e.data || {};
    if (type === 'qr-popover:resize' && Number.isFinite(height)) {
      contentHeight = Math.ceil(height);
      fit();
    }
    if (type === 'qr-popover:close') close();
  }

  // Clicks inside the iframe never reach this document, so any click here is outside.
  function onOutsideClick(e) {
    if (e.target !== host) close();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  window.__qrPopover = {
    toggle() {
      if (host) close();
      else open();
    },
  };
  open();
})();
