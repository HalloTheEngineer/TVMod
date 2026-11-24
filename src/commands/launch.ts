import { TVMOD_VERSION } from '../version.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  CLOSE_INSPECTOR_SCRIPT,
  GET_WEB_CONTENTS_SCRIPT,
  VERIFY_PRELOAD_SCRIPT,
  buildBootstrapScript,
  buildReloadScript,
} from '../lib/bootstrap.js';
import { CdpClient, waitForMainProcess, waitForPreload } from '../lib/cdp.js';
import {
  findInstall,
  installRoot,
  type AppInstall,
} from '../lib/app-detect.js';
import { UserError } from '../lib/errors.js';
import {
  configFile,
  controlFile,
  isStandaloneBinary,
  launchLog,
  logsDir,
  ensureDir,
} from '../lib/paths.js';
import {
  terminatePids,
  tradingViewPids,
  waitForExit,
} from '../lib/proc.js';
import { readState } from '../lib/state.js';
import { debug, fail, heading, info, label, ok, warn } from '../lib/logger.js';
import { askRestart } from '../lib/restart-prompt.js';
import {
  errorMessage,
  notify,
  parseInspectorUrl,
  readIfExists,
  sha256File,
  sleep,
  tailFile,
} from '../lib/util.js';

export interface LaunchOptions {
  app?: string;
  restart?: boolean;
  userDataDir?: string;
  noReload?: boolean;
  noPrompt?: boolean;
  keepInspector?: boolean;
  printPid?: boolean;
  timeoutSeconds?: number;
  verbose?: boolean;
  extraArgs?: string[];
}

async function evaluateMain<T>(
  client: CdpClient,
  expression: string,
  what: string,
  attempts = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await client.evaluate<T>(expression);
    } catch (error) {
      lastError = error;
      debug(`${what} failed (${attempt}/${attempts}): ${errorMessage(error)}`);
      await sleep(200);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${what} failed`);
}

async function waitForInspector(
  logPath: string,
  timeoutMs: number,
  isAlive: () => boolean
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const url = parseInspectorUrl(readIfExists(logPath));
    if (url) return url;
    if (!isAlive()) {
      throw new UserError(
        `TradingView exited before the inspector started.\n\n${tailFile(logPath)}`
      );
    }
    await sleep(100);
  }

  throw new UserError(
    `timed out waiting for TradingView's inspector.\n\n${tailFile(logPath)}`
  );
}

async function verifyPage(
  client: CdpClient,
  preloadPath: string,
  options: LaunchOptions
): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  let reloaded = false;
  let announcedNoPage = false;

  while (Date.now() < deadline) {
    const result = await client
      .evaluate<{ found: boolean; url?: string; urls?: string[] }>(
        VERIFY_PRELOAD_SCRIPT
      )
      .catch(() => null);

    if (result?.found) {
      ok(`preload active in ${result.url ?? 'TradingView page'}`);
      return true;
    }

    if (result?.urls?.length && !reloaded && !options.noReload) {
      const contents = await client
        .evaluate<Array<{ id: number; url: string }>>(GET_WEB_CONTENTS_SCRIPT)
        .catch(() => []);

      const ids = contents
        .filter((item) => item.url.startsWith('https://www.tradingview.com'))
        .map((item) => item.id);

      if (ids.length > 0) {
        warn('page loaded before injection; reloading it once');
        await client.evaluate(buildReloadScript(ids)).catch(() => null);
        reloaded = true;
        await sleep(1500);
        continue;
      }
    }

    if (!result?.urls?.length && !announcedNoPage) {
      debug('no TradingView page yet; waiting for navigation');
      announcedNoPage = true;
    }

    await sleep(500);
  }

  warn('preload is installed, but no loaded TradingView page could be verified yet.');
  warn('Open a chart tab; the preload will apply on the next page load.');
  return false;
}

async function ensureClosedForLaunch(options: LaunchOptions): Promise<void> {
  if (options.userDataDir) return;

  const pids = tradingViewPids();
  if (pids.length === 0) return;

  if (options.restart) {
    warn(`closing TradingView (PID ${pids.join(', ')})`);
    terminatePids(pids);
    if (!(await waitForExit(pids))) {
      throw new UserError(
        'TradingView did not exit. Close it manually and try again.'
      );
    }
    return;
  }

  if (options.noPrompt) {
    throw new UserError(
      `TradingView is already running (PID ${pids.join(
        ', '
      )}). Close it and try again, or run "tvmod launch --restart".`
    );
  }

  const answer = await askRestart();

  if (answer === 'yes') {
    warn(`closing TradingView (PID ${pids.join(', ')})`);
    terminatePids(pids);
    if (!(await waitForExit(pids))) {
      throw new UserError(
        'TradingView did not exit. Close it manually and try again.'
      );
    }
    return;
  }

  if (answer === 'unavailable') {
    notify(
      'TVMod',
      'TradingView is already running. Close it and click the icon again.'
    );
    throw new UserError(
      'TradingView is already running and no prompt tool is available. Close it and try again.'
    );
  }

  throw new UserError('restart cancelled');
}

function assertLaunchable(install: AppInstall): void {
  if (install.flavor !== 'msix') return;
  throw new UserError(
    [
      'TradingView is installed as a Microsoft Store MSIX package.',
      'MSIX builds require package identity, and Windows filters the inspector flags TVMod needs.',
      'The launcher and patch backends cannot attach to this package.',
      '',
      'Use a legacy standalone Windows build if available, run TradingView on Linux, or use the web chart with your browser.',
      'See docs/PLATFORMS.md for the current platform support matrix.',
    ].join('\n')
  );
}

async function launchPatched(
  install: AppInstall,
  options: LaunchOptions
): Promise<void> {
  assertLaunchable(install);
  await ensureClosedForLaunch(options);

  ensureDir(logsDir);
  fs.writeFileSync(launchLog, '');

  const fd = fs.openSync(launchLog, 'a');
  const args = [
    ...(options.userDataDir
      ? [`--user-data-dir=${path.resolve(options.userDataDir)}`]
      : []),
    ...(options.extraArgs ?? []),
  ];

  let child: ChildProcess;
  try {
    child = spawn(install.command, [...install.baseArgs, ...args], {
      cwd:
        install.flavor === 'snap'
          ? process.env.HOME
          : installRoot(install),
      detached: true,
      stdio: ['ignore', fd, fd],
      env: { ...process.env, TVMOD: '1' },
    });
  } catch (error) {
    fs.closeSync(fd);
    throw new UserError(`failed to start TradingView: ${errorMessage(error)}`);
  }

  fs.closeSync(fd);
  child.unref();

  if (!child.pid) {
    throw new UserError(`TradingView did not start.\n\n${tailFile(launchLog)}`);
  }

  heading(`TVMod ${TVMOD_VERSION} (patched install)`);
  label('TradingView', install.version ?? 'unknown');
  label('pid', String(child.pid));
  if (options.printPid) info(`pid=${child.pid}`);
  ok('TradingView is patched and was started normally.');
}

export async function launchCommand(options: LaunchOptions): Promise<void> {
  const state = readState();

  if (!state) {
    throw new UserError('TVMod is not installed. Run "tvmod install" first.');
  }

  const install = findInstall(options.app ?? state.app.exe);
  if (!install) {
    throw new UserError(
      `TradingView was not found at ${options.app ?? state.app.exe}. Reinstall or pass --app.`
    );
  }

  assertLaunchable(install);

  if (state.patch && install.asar) {
    let currentHash: string | null = null;
    try {
      currentHash = sha256File(install.asar);
    } catch {
      currentHash = null;
    }

    if (currentHash === state.patch.patchedHash) {
      await launchPatched(install, options);
      return;
    }

    if (currentHash !== state.patch.originalHash) {
      warn('the TVMod patch is stale (TradingView changed); falling back to the launcher.');
      warn('Run "tvmod repair" or "tvmod unpatch" to update the patch state.');
    }
  }

  if (!fs.existsSync(state.preloadPath)) {
    throw new UserError(
      `preload is missing at ${state.preloadPath}. Run "tvmod install" again.`
    );
  }

  await ensureClosedForLaunch(options);

  ensureDir(logsDir);
  try {
    fs.truncateSync(launchLog, 0);
  } catch {
    fs.writeFileSync(launchLog, '');
  }

  const fd = fs.openSync(launchLog, 'a');
  const args = [
    '--inspect=127.0.0.1:0',
    ...(options.userDataDir
      ? [`--user-data-dir=${path.resolve(options.userDataDir)}`]
      : []),
  ];
  let child: ChildProcess;
  try {
    child = spawn(
      install.command,
      [...install.baseArgs, ...args, ...(options.extraArgs ?? [])],
      {
        cwd:
          install.flavor === 'snap'
            ? process.env.HOME
            : installRoot(install),
        detached: true,
        stdio: ['ignore', fd, fd],
        env: { ...process.env, TVMOD: '1' },
      }
    );
  } catch (error) {
    fs.closeSync(fd);
    throw new UserError(`failed to start TradingView: ${errorMessage(error)}`);
  }

  fs.closeSync(fd);
  child.unref();

  if (!child.pid) {
    throw new UserError(`TradingView did not start.\n\n${tailFile(launchLog)}`);
  }

  let client: CdpClient | null = null;

  try {
    const timeoutMs = Math.max(5, options.timeoutSeconds ?? 30) * 1000;
    const wsUrl = await waitForInspector(
      launchLog,
      timeoutMs,
      () => child.exitCode === null
    );

    debug(`inspector: ${wsUrl}`);
    client = await CdpClient.connect(wsUrl);
    debug('inspector connected');
    await client.send('Runtime.enable');
    debug('runtime enabled');

    if (install.flavor !== 'snap') {
      const inspectedPid = await evaluateMain<number>(
        client,
        'process.pid',
        'PID check'
      );
      debug(`inspected pid: ${String(inspectedPid)}`);
      if (inspectedPid !== child.pid) {
        throw new UserError(
          `inspector PID mismatch (expected ${child.pid}, got ${inspectedPid})`
        );
      }
    }

    await waitForMainProcess(client, timeoutMs);
    debug('main process ready');

    const bootstrap = await evaluateMain<{
      ok: boolean;
      deferred: boolean;
      preloads?: string[];
    }>(
      client,
      buildBootstrapScript(
        state.preloadPath,
        controlFile,
        [
          process.execPath,
          ...(isStandaloneBinary() ? [] : [process.argv[1] ?? '']),
        ],
        configFile
      ),
      'bootstrap'
    );
    debug(`bootstrap: ${JSON.stringify(bootstrap)}`);

    if (!bootstrap?.ok) {
      throw new UserError('the main-process bootstrap was rejected');
    }

    await waitForPreload(client, state.preloadPath, timeoutMs);
    debug('preload confirmed');

    heading(`TVMod ${TVMOD_VERSION}`);
    label('TradingView', install.version ?? 'unknown');
    label('pid', String(child.pid));
    label('preload', state.preloadPath);

    await verifyPage(client, state.preloadPath, options);

    if (options.keepInspector) {
      info(`inspector kept open: ${wsUrl}`);
      client.close();
    } else {
      await Promise.race([
        client.evaluate(CLOSE_INSPECTOR_SCRIPT).catch(() => null),
        sleep(1000),
      ]);
      client.close();
    }

    if (options.printPid) {
      info(`pid=${child.pid}`);
    }

    ok('TradingView is running with TVMod. Open Settings (Ctrl+,) for TVMod.');
  } catch (error) {
    const logText = readIfExists(launchLog);
    const secondInstance = logText.includes('(second-instance)');

    if (client) {
      if (!options.keepInspector) {
        await Promise.race([
          client.evaluate(CLOSE_INSPECTOR_SCRIPT).catch(() => null),
          sleep(1000),
        ]);
      }
      client.close();
    }

    fail(`launch log: ${launchLog}`);
    if (child.exitCode === null) {
      info('TradingView is still running without mods; close it if necessary.');
    }

    if (secondInstance) {
      throw new UserError(
        "another TradingView instance is already using this profile.\nClose it and try again (the development --user-data-dir flag does not bypass the app's single-instance lock)."
      );
    }

    throw new UserError(errorMessage(error));
  }
}
