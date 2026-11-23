import fs from 'node:fs';
import { removeDesktopEntries, removeWrapper } from '../lib/desktop.js';
import { UserError } from '../lib/errors.js';
import {
  dataDir,
  displayPath,
  snapPreloadTarget,
  stateFile,
  wrapperPath,
} from '../lib/paths.js';
import { removeState, readState } from '../lib/state.js';
import { heading, label, ok, warn } from '../lib/logger.js';

export interface UninstallOptions {
  purge?: boolean;
}

export function uninstallCommand(options: UninstallOptions): void {
  const state = readState();

  if (state?.patch) {
    throw new UserError(
      'this install is patched; run "tvmod unpatch --yes" before uninstalling'
    );
  }

  removeDesktopEntries();
  removeWrapper();
  removeState();

  if (options.purge) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(snapPreloadTarget.replace(/\/preload\.js$/, ''), {
      recursive: true,
      force: true,
    });
  }

  heading('TVMod uninstalled');
  label('desktop entries', 'removed/restored');
  label('wrapper', displayPath(wrapperPath));
  label('state', displayPath(stateFile));

  if (state?.patch) {
    warn(
      'This install had a patch record. Re-run your package manager if app files were modified.'
    );
  }

  if (!options.purge) {
    warn('Preload data was left in place; use --purge to remove it.');
  }

  ok('TradingView will launch unmodified from now on.');
}
