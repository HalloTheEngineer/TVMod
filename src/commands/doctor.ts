import { TVMOD_VERSION } from '../version.js';
import fs from 'node:fs';
import {
  candidatePaths,
  describeFlavor,
  findInstall,
} from '../lib/app-detect.js';
import { UserError } from '../lib/errors.js';
import { readInstalledPlugins } from '../lib/plugin-files.js';
import {
  displayPath,
  launchLog,
  preloadTarget,
  wrapperPath,
  desktopFile,
} from '../lib/paths.js';
import { tradingViewPids } from '../lib/proc.js';
import { readState } from '../lib/state.js';
import { heading, info, label, warn } from '../lib/logger.js';
import { sha256File } from '../lib/util.js';

export interface DoctorOptions {
  app?: string;
}

export function doctorCommand(options: DoctorOptions): void {
  const state = readState();
  const install = findInstall(options.app ?? state?.app.exe);

  heading(`TVMod ${TVMOD_VERSION}`);
  label('host', `${process.platform} ${process.arch}`);
  const bun = (process.versions as Record<string, string | undefined>).bun;
  label('runtime', bun ? `bun ${bun}` : `node ${process.version}`);

  if (!install) {
    warn('TradingView Desktop was not found.');
    info('Checked:');
    for (const candidate of candidatePaths()) info(`  - ${candidate}`);
    throw new UserError('nothing to inspect; install TradingView or pass --app');
  }

  label('TradingView', install.version ?? 'unknown version');
  label('flavor', describeFlavor(install.flavor));
  label('executable', install.exe);
  label('app.asar', install.asar ?? 'not found');
  label('preload', displayPath(preloadTarget));

  if (fs.existsSync(preloadTarget)) {
    label('preload hash', sha256File(preloadTarget).slice(0, 16));
  } else {
    warn('preload is not installed; run "tvmod install"');
  }

  label('wrapper', fs.existsSync(wrapperPath) ? displayPath(wrapperPath) : 'missing');
  label('desktop', fs.existsSync(desktopFile) ? displayPath(desktopFile) : 'missing');
  label('launch log', displayPath(launchLog));

  const pluginScan = readInstalledPlugins();
  label('external plugins', String(pluginScan.plugins.length));
  for (const error of pluginScan.errors) {
    warn(`plugin ${error.id}: ${error.message}`);
  }

  if (state) {
    label('installed state', displayPath(state.preloadPath));
    if (state.app.version && install.version && state.app.version !== install.version) {
      warn(
        `TradingView changed since install (${state.app.version} -> ${install.version}).`
      );
      warn('Run "tvmod install" again to refresh the launcher metadata.');
    }
    if (state.patch) {
      label('patch', `${state.patch.appVersion ?? 'unknown'} (patch mode)`);
    }
  } else {
    warn('TVMod is not installed; run "tvmod install"');
  }

  const pids = tradingViewPids();
  label('running', pids.length > 0 ? `yes (${pids.length} processes)` : 'no');

  if (install.flavor === 'snap') {
    warn('Snap support is experimental; launcher injection may be blocked by confinement.');
  }
}
