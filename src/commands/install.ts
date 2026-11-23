import { TVMOD_VERSION } from '../version.js';
import fs from 'node:fs';
import {
  candidatePaths,
  describeFlavor,
  findInstall,
} from '../lib/app-detect.js';
import { writeDesktopEntries, writeWrapper } from '../lib/desktop.js';
import { copyAppForPatch } from '../lib/copy-app.js';
import { UserError } from '../lib/errors.js';
import { writeInstalledPreload } from '../lib/plugin-files.js';
import { patchCommand } from './patch.js';
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
  copiedAppDir,
  preloadTargetForFlavor,
} from '../lib/paths.js';
import { tradingViewPids } from '../lib/proc.js';
import { readState, writeState } from '../lib/state.js';
import { heading, info, label, ok, warn } from '../lib/logger.js';
import { sha256File } from '../lib/util.js';

export interface InstallOptions {
  app?: string;
  copy?: boolean;
  patch?: boolean;
  force?: boolean;
  yes?: boolean;
  system?: boolean;
}

export async function installCommand(options: InstallOptions): Promise<void> {
  if (options.patch && !options.yes) {
    throw new UserError('--patch modifies app.asar and requires --yes');
  }

  let install = findInstall(options.app);

  if (!install) {
    const candidates = candidatePaths();
    throw new UserError(
      `could not find TradingView Desktop.\nChecked:\n${candidates
        .map((value) => `  - ${value}`)
        .join('\n')}\nPass --app <path-to-tradingview> if it is installed elsewhere.`
    );
  }

  if (install.flavor === 'msix') {
    throw new UserError(
      [
        'TradingView is installed as a Microsoft Store MSIX package.',
        'MSIX builds cannot be launched with the inspector flags or patched by TVMod.',
        'Install a legacy standalone Windows build if available, or use TVMod on Linux/macOS.',
        'See docs/PLATFORMS.md for the support matrix.',
      ].join('\n')
    );
  }

  if (options.copy) {
    if (install.flavor === 'snap') {
      throw new UserError(
        'copying a confined Snap install is not supported; use the launcher backend.'
      );
    }
    info(`Copying TradingView to ${displayPath(copiedAppDir)} ...`);
    install = copyAppForPatch(install, { force: options.force });
    ok(`using user-owned copy at ${displayPath(copiedAppDir)}`);
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

  const preloadPath = preloadTargetForFlavor(install.flavor);
  const pluginResult = writeInstalledPreload(preloadPath);

  const wrapper = writeWrapper(process.argv[1] ?? source);
  const entries = writeDesktopEntries(install, wrapper);

  const previous = readState();
  const preservedPatch =
    previous?.patch && previous.app.asar === install.asar
      ? previous.patch
      : undefined;

  writeState({
    schema: 1,
    coreVersion: TVMOD_VERSION,
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
    preloadPath: pluginResult.path,
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

  heading(`TVMod ${TVMOD_VERSION} installed`);
  label('TradingView', `${install.version ?? 'unknown version'} (${describeFlavor(install.flavor)})`);
  label('executable', install.exe);
  label('app.asar', install.asar ?? 'not found (launcher only)');
  label('preload', displayPath(pluginResult.path));
  label('wrapper', displayPath(wrapperPath));
  label('launcher', displayPath(entries.desktop));
  label('external plugins', String(pluginResult.count));
  label('preload sha256', sha256File(pluginResult.path).slice(0, 16));

  for (const error of pluginResult.errors) {
    warn(`plugin ${error.id}: ${error.message}`);
  }

  const pids = tradingViewPids();
  if (pids.length > 0) {
    warn(`TradingView is currently running (e.g. PID ${pids[0]}).`);
    warn('Close it and start it again from the TradingView launcher.');
  } else {
    ok('Start TradingView from your normal launcher; TVMod will attach on launch.');
  }

  if (process.platform === 'darwin') {
    warn('macOS support is experimental and this build is unsigned.');
    warn(`Add ${displayPath(wrapperPath.replace(/\/[^/]+$/, ''))} to PATH to use the tvmod command.`);
  } else if (process.platform === 'win32') {
    warn('Windows standalone support is experimental.');
    warn('The Microsoft Store (MSIX) build is not supported.');
  }

  if (options.patch) {
    await patchCommand({
      app: install.exe,
      yes: true,
      system: options.system,
    });
  }

  if (install.flavor === 'snap') {
    warn('Snap support is experimental: validate the local inspector and preload under confinement.');
    warn('Run tools/snap/probe.sh on this Snap host and report the result.');
  }
}
