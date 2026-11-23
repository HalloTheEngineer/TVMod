import fs from 'node:fs';
import {
  candidatePaths,
  describeFlavor,
  findInstall,
} from '../lib/app-detect.js';
import { writeDesktopEntries, writeWrapper } from '../lib/desktop.js';
import { UserError } from '../lib/errors.js';
import {
  displayPath,
  ensureDir,
  preloadSourcePath,
  preloadTarget,
  configDir,
  dataDir,
  logsDir,
  stateDir,
  wrapperPath,
} from '../lib/paths.js';
import { tradingViewPids } from '../lib/proc.js';
import { readState, writeState } from '../lib/state.js';
import { heading, label, ok, warn } from '../lib/logger.js';
import { sha256File } from '../lib/util.js';

export interface InstallOptions {
  app?: string;
}

export function installCommand(options: InstallOptions): void {
  const install = findInstall(options.app);

  if (!install) {
    const candidates = candidatePaths();
    throw new UserError(
      `could not find TradingView Desktop.\nChecked:\n${candidates
        .map((value) => `  - ${value}`)
        .join('\n')}\nPass --app <path-to-tradingview> if it is installed elsewhere.`
    );
  }

  const source = preloadSourcePath();
  if (!fs.existsSync(source)) {
    throw new UserError(
      `preload bundle not found at ${source}. Run "npm run build" before installing.`
    );
  }

  ensureDir(configDir);
  ensureDir(dataDir);
  ensureDir(stateDir);
  ensureDir(logsDir);

  fs.copyFileSync(source, preloadTarget);
  fs.chmodSync(preloadTarget, 0o644);

  const wrapper = writeWrapper(process.argv[1] ?? source);
  const entries = writeDesktopEntries(install, wrapper);

  const previous = readState();
  const preservedPatch =
    previous?.patch && previous.app.asar === install.asar
      ? previous.patch
      : undefined;

  writeState({
    schema: 1,
    coreVersion: __TVMOD_VERSION__,
    installedAt: new Date().toISOString(),
    app: {
      exe: install.exe,
      realExe: install.realExe,
      asar: install.asar,
      flavor: install.flavor,
      version: install.version,
      command: install.command,
      baseArgs: install.baseArgs,
    },
    preloadPath: preloadTarget,
    wrapperPath: wrapper,
    desktopFile: entries.desktop,
    ...(preservedPatch ? { patch: preservedPatch } : {}),
  });

  if (preservedPatch) {
    warn('this install already has a patch record; the record was preserved.');
    warn('Run "tvmod repair --yes" to refresh the embedded preload after rebuilding.');
  } else if (previous?.patch) {
    warn('the previous patch record pointed at a different app.asar and was dropped.');
  }

  heading(`TVMod ${__TVMOD_VERSION__} installed`);
  label('TradingView', `${install.version ?? 'unknown version'} (${describeFlavor(install.flavor)})`);
  label('executable', install.exe);
  label('app.asar', install.asar ?? 'not found (launcher only)');
  label('preload', displayPath(preloadTarget));
  label('wrapper', displayPath(wrapperPath));
  label('desktop', displayPath(entries.desktop));
  label('preload sha256', sha256File(preloadTarget).slice(0, 16));

  const pids = tradingViewPids();
  if (pids.length > 0) {
    warn(`TradingView is currently running (e.g. PID ${pids[0]}).`);
    warn('Close it and start it again from the TradingView icon.');
  } else {
    ok('Start TradingView from your normal icon; TVMod will attach on launch.');
  }

  if (install.flavor === 'snap') {
    warn('Snap support is experimental: the confined app may block the local inspector.');
  }
}
