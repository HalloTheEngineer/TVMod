export function buildBootstrapScript(
  preloadPath: string,
  controlFile: string,
  cliCommand: string[]
): string {
  return `(() => {
  const { app, session, webContents, ipcMain } = require('electron');
  const http = require('node:http');
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const path = require('node:path');
  const { execFile } = require('node:child_process');
  const PRELOAD = ${JSON.stringify(preloadPath)};
  const CONTROL_FILE = ${JSON.stringify(controlFile)};
  const CLI = ${JSON.stringify(cliCommand)};
  const MARK = '__tvmodPatched';
  let controlServer = null;
  let controlToken = null;

  const runCli = (args) =>
    new Promise((resolve) => {
      if (!CLI.length) {
        resolve({ ok: false, stdout: '', stderr: 'CLI command is unavailable', error: 'CLI command is unavailable' });
        return;
      }
      execFile(
        CLI[0],
        [...CLI.slice(1), ...args],
        {
          env: process.env,
          timeout: 60000,
          maxBuffer: 4 * 1024 * 1024
        },
        (error, stdout, stderr) => {
          resolve({
            ok: !error,
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            error: error ? String(error.message || error) : null
          });
        }
      );
    });

  const registerRegistryIpc = () => {
    try {
      ipcMain.handle('tvmod:registry:list', async () => {
        const result = await runCli(['plugin', 'browse', '--json']);
        if (!result.ok) {
          return {
            ok: false,
            error: result.stderr || result.error || 'failed to browse registries'
          };
        }
        try {
          return { ok: true, plugins: JSON.parse(result.stdout || '[]') };
        } catch {
          return { ok: false, error: 'registry browse returned invalid JSON' };
        }
      });

      ipcMain.handle('tvmod:registry:install', async (_event, id, registry, force) => {
        if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) {
          return { ok: false, error: 'invalid plugin id' };
        }
        const args = ['plugin', 'install', id];
        if (typeof registry === 'string' && registry) {
          if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(registry)) {
            return { ok: false, error: 'invalid registry name' };
          }
          args.push('--registry', registry);
        }
        if (force === true) args.push('--force');
        const result = await runCli(args);
        const stderr = String(result.stderr || '').trim();
        return {
          ok: result.ok,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.ok
            ? undefined
            : stderr.replace(/^error\s+/i, '') || result.error
        };
      });
    } catch (error) {
      console.error('[tvmod] registry IPC registration failed', error);
    }
  };

  registerRegistryIpc();

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
