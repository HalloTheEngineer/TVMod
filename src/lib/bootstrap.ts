export function buildBootstrapScript(
  preloadPath: string,
  controlFile: string,
  cliCommand: string[],
  configFile = ''
): string {
  return `(() => {
  const { app, session, webContents, ipcMain, dialog, BrowserWindow } = require('electron');
  const http = require('node:http');
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const path = require('node:path');
  const { execFile, spawn } = require('node:child_process');
  const PRELOAD = ${JSON.stringify(preloadPath)};
  const CONTROL_FILE = ${JSON.stringify(controlFile)};
  const CONFIG_FILE = ${JSON.stringify(configFile)};
  const CLI = ${JSON.stringify(cliCommand)};
  const CONFIG_MAX_BYTES = 512 * 1024;
  const MARK = '__tvmodPatched';
  const REGISTRY_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
  const PLUGIN_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
  const MAX_PUBLIC_KEY_BYTES = 16 * 1024;
  let controlServer = null;
  let controlToken = null;
  let focusSettingsOnce = false;

  const reloadTradingViewPages = () => {
    const pages = webContents.getAllWebContents().filter((wc) =>
      !wc.isDestroyed() &&
      String(wc.getURL()).startsWith('https://www.tradingview.com')
    );
    const ids = [];
    for (const wc of pages) {
      try {
        wc.reload();
        ids.push(wc.id);
      } catch {}
    }
    return ids;
  };

  const isTradingViewPage = (wc) =>
    !wc.isDestroyed() &&
    String(wc.getURL()).startsWith('https://www.tradingview.com');

  const readConfigFile = () => {
    if (!CONFIG_FILE) return { exists: false };
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > CONFIG_MAX_BYTES) {
        return { exists: true, error: 'config file is too large' };
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { exists: true, error: 'config file is invalid' };
      }
      return { exists: true, config: parsed };
    } catch (error) {
      if (error && error.code === 'ENOENT') return { exists: false };
      return {
        exists: true,
        error: String(error && error.message ? error.message : error)
      };
    }
  };

  const writeConfigFile = (config, onlyIfMissing = false) => {
    if (!CONFIG_FILE) {
      return { ok: false, error: 'config path is unavailable' };
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { ok: false, error: 'config must be an object' };
    }
    let raw;
    try {
      raw = JSON.stringify(config);
    } catch (error) {
      return { ok: false, error: 'config is not serializable' };
    }
    if (Buffer.byteLength(raw, 'utf8') > CONFIG_MAX_BYTES) {
      return { ok: false, error: 'config is larger than 512 KiB' };
    }
    try {
      if (onlyIfMissing && fs.existsSync(CONFIG_FILE)) {
        return { ok: true, skipped: true };
      }
      fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
      const temp = CONFIG_FILE + '.tmp';
      fs.writeFileSync(temp, raw, { mode: 0o600 });
      try {
        fs.renameSync(temp, CONFIG_FILE);
      } catch {
        fs.rmSync(CONFIG_FILE, { force: true });
        fs.renameSync(temp, CONFIG_FILE);
      }
      try { fs.chmodSync(CONFIG_FILE, 0o600); } catch {}
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: String(error && error.message ? error.message : error)
      };
    }
  };

  const broadcastConfig = (config) => {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue;
      try { wc.send('tvmod:config:changed', config); } catch {}
    }
  };

  const requestConfigFromPages = () => {
    for (const wc of webContents.getAllWebContents()) {
      if (!isTradingViewPage(wc)) continue;
      try { wc.send('tvmod:config:request'); } catch {}
    }
  };

  const registerConfigIpc = () => {
    if (globalThis.__TVMOD_CONFIG_IPC__) return;
    globalThis.__TVMOD_CONFIG_IPC__ = true;

    ipcMain.on('tvmod:config:probe', (event) => {
      event.returnValue = true;
    });

    ipcMain.on('tvmod:config:load', (event) => {
      event.returnValue = readConfigFile();
    });

    ipcMain.on('tvmod:config:save', (_event, config) => {
      const result = writeConfigFile(config);
      if (!result.ok) {
        console.error('[tvmod] config save failed:', result.error);
        return;
      }
      broadcastConfig(config);
    });

    ipcMain.on('tvmod:config:migrate', (_event, config) => {
      const result = writeConfigFile(config, true);
      if (!result.ok) {
        console.error('[tvmod] config migration failed:', result.error);
        return;
      }
      if (!result.skipped) broadcastConfig(config);
    });

    ipcMain.on('tvmod:config:request', () => {
      requestConfigFromPages();
    });

    ipcMain.on('tvmod:settings-focus', (event) => {
      event.returnValue = focusSettingsOnce;
      focusSettingsOnce = false;
    });

    ipcMain.on('tvmod:open-settings', (event) => {
      focusSettingsOnce = true;
      const sender = event.sender;
      const target =
        sender && sender.hostWebContents ? sender.hostWebContents : sender;
      try {
        target.focus();
        const modifiers =
          process.platform === 'darwin' ? ['meta'] : ['control'];
        target.sendInputEvent({
          type: 'keyDown',
          keyCode: ',',
          modifiers
        });
        target.sendInputEvent({
          type: 'keyUp',
          keyCode: ',',
          modifiers
        });
      } catch (error) {
        console.error('[tvmod] could not open native settings:', error);
      }
      setTimeout(() => {
        for (const wc of webContents.getAllWebContents()) {
          if (wc.isDestroyed()) continue;
          if (!String(wc.getURL()).includes('/app/dialog-window/index.html')) {
            continue;
          }
          try { wc.send('tvmod:focus-settings-tab'); } catch {}
        }
      }, 400);
      setTimeout(() => {
        focusSettingsOnce = false;
      }, 2000);
    });
  };

  registerConfigIpc();

  const cliError = (result) => {
    const stderr = String(result.stderr || '').trim();
    return stderr.replace(/^error\\s+/i, '') || String(result.error || 'command failed');
  };

  const cliWarnings = (result) =>
    String(result.stderr || '')
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^error\\s+/i.test(line))
      .map((line) => line.replace(/^warn\\s+/i, ''));

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

  const runCliWithInput = (args, input) =>
    new Promise((resolve) => {
      if (!CLI.length) {
        resolve({
          ok: false,
          stdout: '',
          stderr: 'CLI command is unavailable',
          error: 'CLI command is unavailable'
        });
        return;
      }

      let child;
      try {
        child = spawn(CLI[0], [...CLI.slice(1), ...args], {
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        });
      } catch (error) {
        resolve({
          ok: false,
          stdout: '',
          stderr: '',
          error: String(error && error.message ? error.message : error)
        });
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          ok: !error,
          stdout,
          stderr,
          error: error ? String(error) : null
        });
      };
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        finish('CLI command timed out');
      }, 60000);
      const append = (target, chunk) => {
        const next = target + String(chunk);
        if (next.length > 4 * 1024 * 1024) {
          try { child.kill('SIGKILL'); } catch {}
          finish('CLI output exceeded 4 MiB');
          return target;
        }
        return next;
      };

      child.on('error', (error) => finish(error.message || error));
      child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
      child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
      child.on('close', (code) => {
        finish(code === 0 ? null : 'CLI exited with code ' + code);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });

  const validPublicKey = (value) =>
    typeof value === 'string' &&
    Buffer.byteLength(value, 'utf8') <= MAX_PUBLIC_KEY_BYTES &&
    !/PRIVATE KEY/i.test(value) &&
    /-----BEGIN PUBLIC KEY-----/.test(value);

  const validRegistryUrl = (value) => {
    if (typeof value !== 'string' || value.length > 2048) return false;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'https:') return true;
      return (
        parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)
      );
    } catch {
      return false;
    }
  };

  const registerRegistryIpc = () => {
    try {
      ipcMain.handle('tvmod:registry:list', async () => {
        const result = await runCli(['plugin', 'browse', '--json']);
        if (!result.ok) {
          return { ok: false, error: cliError(result) };
        }
        try {
          return {
            ok: true,
            plugins: JSON.parse(result.stdout || '[]'),
            warnings: cliWarnings(result)
          };
        } catch {
          return { ok: false, error: 'registry browse returned invalid JSON' };
        }
      });

      ipcMain.handle('tvmod:registry:sources', async () => {
        const result = await runCli(['plugin', 'registry', 'list', '--json']);
        if (!result.ok) {
          return { ok: false, error: cliError(result) };
        }
        try {
          const parsed = JSON.parse(result.stdout || '[]');
          if (!Array.isArray(parsed)) throw new Error('not an array');
          return { ok: true, sources: parsed };
        } catch {
          return { ok: false, error: 'registry list returned invalid JSON' };
        }
      });

      ipcMain.handle('tvmod:registry:add', async (_event, name, url, publicKey) => {
        if (typeof name !== 'string' || !REGISTRY_NAME.test(name)) {
          return { ok: false, error: 'invalid registry name' };
        }
        if (!validRegistryUrl(url)) {
          return {
            ok: false,
            error: 'registry URLs must use HTTPS (HTTP is allowed only for localhost)'
          };
        }
        if (!validPublicKey(publicKey)) {
          return { ok: false, error: 'invalid public key' };
        }

        const content = publicKey.endsWith('\\n') ? publicKey : publicKey + '\\n';
        const result = await runCliWithInput(
          ['plugin', 'registry', 'add', name, url, '--key', '-'],
          content
        );
        return result.ok
          ? { ok: true }
          : { ok: false, error: cliError(result) };
      });

      ipcMain.handle('tvmod:registry:remove', async (_event, name) => {
        if (typeof name !== 'string' || !REGISTRY_NAME.test(name)) {
          return { ok: false, error: 'invalid registry name' };
        }
        const result = await runCli([
          'plugin',
          'registry',
          'remove',
          name,
          '--yes'
        ]);
        return result.ok
          ? { ok: true }
          : { ok: false, error: cliError(result) };
      });

      ipcMain.handle('tvmod:registry:pick-key', async (event) => {
        try {
          const owner = BrowserWindow.fromWebContents(event.sender);
          const options = {
            title: 'Choose a TVMod registry public key',
            properties: ['openFile'],
            filters: [
              {
                name: 'PEM public key',
                extensions: ['pem', 'pub', 'key', 'txt']
              }
            ]
          };
          const picked = owner
            ? await dialog.showOpenDialog(owner, options)
            : await dialog.showOpenDialog(options);
          if (picked.canceled || picked.filePaths.length === 0) {
            return { ok: false, canceled: true };
          }
          const file = picked.filePaths[0];
          const stat = fs.statSync(file);
          if (stat.size > MAX_PUBLIC_KEY_BYTES) {
            return { ok: false, error: 'public key is larger than 16 KiB' };
          }
          const publicKey = fs.readFileSync(file, 'utf8');
          if (!validPublicKey(publicKey)) {
            return { ok: false, error: 'invalid public key' };
          }
          return { ok: true, name: path.basename(file), publicKey };
        } catch (error) {
          return {
            ok: false,
            error: String(error && error.message ? error.message : error)
          };
        }
      });

      ipcMain.handle('tvmod:registry:install', async (_event, id, registry, force, noReload) => {
        if (typeof id !== 'string' || !PLUGIN_ID.test(id)) {
          return { ok: false, error: 'invalid plugin id' };
        }
        const args = ['plugin', 'install', id];
        if (typeof registry === 'string' && registry) {
          if (!REGISTRY_NAME.test(registry)) {
            return { ok: false, error: 'invalid registry name' };
          }
          args.push('--registry', registry);
        }
        if (force === true) args.push('--force');
        if (noReload === true) args.push('--no-reload');
        const result = await runCli(args);
        return {
          ok: result.ok,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.ok ? undefined : cliError(result)
        };
      });

      ipcMain.handle('tvmod:reload', () => {
        return { ok: true, reloaded: reloadTradingViewPages() };
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
          const reloaded = reloadTradingViewPages();
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ reloaded }));
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
