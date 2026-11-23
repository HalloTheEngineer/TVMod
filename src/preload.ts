import { contextBridge, webFrame } from 'electron';
import { start } from './core/index.js';
import { TVMOD_VERSION } from './version.js';

const VERSION = TVMOD_VERSION;

function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function isSupportedPage(): boolean {
  if (!isTopFrame()) return false;

  const host = location.hostname;
  if (host.startsWith('auth.')) return false;
  if (host !== 'tradingview.com' && !host.endsWith('.tradingview.com')) {
    return false;
  }

  if (
    /^\/(accounts|order|checkout|billing|payments|login|signup|pricing|gopro|black-friday)/i.test(
      location.pathname
    )
  ) {
    return false;
  }

  return true;
}

if (isSupportedPage()) {
  try {
    contextBridge.exposeInMainWorld('__TVMOD__', {
      version: VERSION,
      mode: 'desktop-preload',
    });
  } catch (error) {
    console.error('[tvmod] contextBridge failed', error);
  }

  start(VERSION, {
    executeJavaScript: (code) => webFrame.executeJavaScript(code),
    insertCSS: (css) => webFrame.insertCSS(css),
    removeInsertedCSS: (key) => webFrame.removeInsertedCSS(key),
  });
}
