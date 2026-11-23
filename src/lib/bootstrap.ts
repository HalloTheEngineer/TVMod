export function buildBootstrapScript(
  preloadPath: string,
  controlFile: string
): string {
  return `(() => {
  const { app, session, webContents } = require('electron');
  const http = require('node:http');
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const path = require('node:path');
  const PRELOAD = ${JSON.stringify(preloadPath)};
  const CONTROL_FILE = ${JSON.stringify(controlFile)};
  const MARK = '__tvmodPatched';
  let controlServer = null;
  let controlToken = null;

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

  const startControl = () => {
    if (controlServer) return;
    try {
      controlToken = crypto.randomBytes(32).toString('hex');
      controlServer = http.createServer((request, response) => {
        const auth = request.headers.authorization || '';
        if (auth !== 'Bearer ' + controlToken) {
          response.writeHead(401, { 'content-type': 'text/plain' });
          response.end('unauthorized');
          return;
        }

        if (request.method === 'POST' && request.url === '/reload') {
          const pages = webContents.getAllWebContents().filter((wc) =>
            !wc.isDestroyed() &&
            String(wc.getURL()).startsWith('https://www.tradingview.com')
          );
          for (const wc of pages) {
            try {
              wc.reload();
            } catch {}
          }
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ reloaded: pages.map((wc) => wc.id) }));
          return;
        }

        if (request.method === 'GET' && request.url === '/status') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({
            pid: process.pid,
            pages: webContents.getAllWebContents()
              .filter((wc) => String(wc.getURL()).startsWith('https://www.tradingview.com'))
              .map((wc) => ({ id: wc.id, url: String(wc.getURL()) }))
          }));
          return;
        }

        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('not found');
      });

      controlServer.on('error', (error) => {
        console.error('[tvmod] control server error', error);
      });

      controlServer.listen(0, '127.0.0.1', () => {
        const address = controlServer.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        try {
          fs.mkdirSync(path.dirname(CONTROL_FILE), { recursive: true });
          fs.writeFileSync(
            CONTROL_FILE,
            JSON.stringify({
              port,
              token: controlToken,
              pid: process.pid,
              startedAt: Date.now()
            }),
            { mode: 0o600 }
          );
          fs.chmodSync(CONTROL_FILE, 0o600);
        } catch (error) {
          console.error('[tvmod] control file write failed', error);
        }
      });

      app.once('will-quit', () => {
        try {
          controlServer.close();
        } catch {}
        try {
          const current = JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8'));
          if (current && current.token === controlToken) {
            fs.rmSync(CONTROL_FILE, { force: true });
          }
        } catch {}
      });
    } catch (error) {
      console.error('[tvmod] control server failed', error);
    }
  };

  if (app.isReady()) {
    const preloads = patch();
    startControl();
    return { ok: true, deferred: false, preloads };
  }

  app.once('ready', () => {
    try {
      patch();
    } catch (error) {
      console.error('[tvmod] ready patch failed', error);
    }
    startControl();
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
