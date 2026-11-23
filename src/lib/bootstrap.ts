export function buildBootstrapScript(preloadPath: string): string {
  return `(() => {
  const { app, session } = require('electron');
  const PRELOAD = ${JSON.stringify(preloadPath)};
  const MARK = '__tvmodPatched';

  const patch = () => {
    const currentSession = session.defaultSession;
    const proto = Object.getPrototypeOf(currentSession);
    if (!proto[MARK]) {
      const original = proto.setPreloads;
      if (typeof original !== 'function') {
        throw new Error('Session.setPreloads is unavailable');
      }
      Object.defineProperty(proto, MARK, { value: true, configurable: true });
      proto.setPreloads = function (list) {
        const values = Array.isArray(list) ? list : [];
        return original.call(
          this,
          [PRELOAD, ...values.filter((value) => value !== PRELOAD)]
        );
      };
    }
    const current = currentSession.getPreloads();
    if (!current.includes(PRELOAD)) {
      currentSession.setPreloads([PRELOAD, ...current]);
    }
    return currentSession.getPreloads();
  };

  if (app.isReady()) {
    return { ok: true, deferred: false, preloads: patch() };
  }

  app.once('ready', () => {
    try {
      patch();
    } catch (error) {
      console.error('[tvmod] ready patch failed', error);
    }
  });

  return { ok: true, deferred: true };
})()`;
}

export const GET_PRELOADS_SCRIPT = `(() => {
  try {
    return require('electron').session.defaultSession.getPreloads();
  } catch {
    return [];
  }
})()`;

export const GET_WEB_CONTENTS_SCRIPT = `(() => {
  try {
    const { webContents } = require('electron');
    return webContents.getAllWebContents().map((wc) => ({
      id: wc.id,
      url: String(wc.getURL()),
      type: wc.getType(),
      loading: wc.isLoading(),
      destroyed: wc.isDestroyed()
    }));
  } catch {
    return [];
  }
})()`;

export const VERIFY_PRELOAD_SCRIPT = `(async () => {
  const { webContents } = require('electron');
  const pages = webContents.getAllWebContents().filter((wc) => {
    if (wc.isDestroyed()) return false;
    const url = String(wc.getURL());
    if (!url.startsWith('https://www.tradingview.com')) return false;
    return !/^https:\\/\\/www\\.tradingview\\.com\\/(accounts|order|checkout|billing|payments|login|signup|pricing|gopro|black-friday)/i.test(url);
  });

  for (const wc of pages) {
    try {
      const value = await wc.executeJavaScript(
        'window.__TVMOD_ACTIVE__ || window.__TVMOD__ || null'
      );
      if (value) {
        return { found: true, id: wc.id, url: String(wc.getURL()), value };
      }
    } catch {
      // The page may still be initializing.
    }
  }

  return { found: false, urls: pages.map((wc) => String(wc.getURL())) };
})()`;

export function buildReloadScript(ids: number[]): string {
  return `(() => {
  const { webContents } = require('electron');
  const ids = ${JSON.stringify(ids)};
  const reloaded = [];
  for (const id of ids) {
    const wc = webContents.fromId(id);
    if (wc && !wc.isDestroyed()) {
      wc.reload();
      reloaded.push(id);
    }
  }
  return reloaded;
})()`;
}

export const CLOSE_INSPECTOR_SCRIPT = `(() => {
  try {
    require('inspector').close();
  } catch {
    // Inspector may already be closed.
  }
  try {
    process._debugEnd();
  } catch {
    // Older/newer Node versions may not expose this.
  }
  return true;
})()`;
