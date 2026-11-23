import fs from 'node:fs';
import path from 'node:path';
import { findInstall, type AppInstall } from '../lib/app-detect.js';
import {
  backupAsar,
  buildPatchedAsar,
  cleanupPatchedBuild,
  installAsar,
  isAsarPatched,
  restoreAsar,
} from '../lib/asar-patch.js';
import { UserError } from '../lib/errors.js';
import {
  backupsDir,
  displayPath,
  preloadSourcePath,
} from '../lib/paths.js';
import {
  pidsForInstall,
  terminatePids,
  waitForExit,
} from '../lib/proc.js';
import { readState, writeState, type AppState } from '../lib/state.js';
import { heading, info, label, ok, warn } from '../lib/logger.js';
import { sha256File } from '../lib/util.js';

export interface PatchOptions {
  app?: string;
  restart?: boolean;
  yes?: boolean;
}

function requireInstalled(): AppState {
  const state = readState();
  if (!state) {
    throw new UserError('TVMod is not installed. Run "tvmod install" first.');
  }
  return state;
}

function requirePatchableInstall(
  state: AppState,
  app?: string
): AppInstall {
  const install = findInstall(app ?? state.app.exe);
  if (!install) {
    throw new UserError(`TradingView was not found at ${app ?? state.app.exe}.`);
  }
  if (!install.asar) {
    throw new UserError('app.asar was not found; the patch backend cannot run.');
  }
  if (install.flavor === 'snap') {
    throw new UserError(
      'official Snap installs are read-only and cannot be patched. Use the launcher backend.'
    );
  }
  return install;
}

function requireWritable(install: AppInstall): void {
  if (!install.asar) throw new UserError('app.asar was not found.');
  try {
    fs.accessSync(path.dirname(install.asar), fs.constants.W_OK);
  } catch {
    throw new UserError(
      `app.asar is not user-writable:\n  ${install.asar}\n\n` +
        'This build only supports user-owned installs or copies. ' +
        'Use the launcher backend, or install TradingView into a user-owned directory ' +
        'and run "tvmod install --app <path>" against that copy.'
    );
  }
}

async function ensureStopped(
  install: AppInstall,
  restart: boolean | undefined
): Promise<void> {
  const pids = pidsForInstall(install.realExe);
  if (pids.length === 0) return;

  if (!restart) {
    throw new UserError(
      `TradingView is running (PID ${pids.join(
        ', '
      )}). Close it, or pass --restart to close it before patching.`
    );
  }

  warn(`closing TradingView (PID ${pids.join(', ')})`);
  terminatePids(pids);
  if (!(await waitForExit(pids))) {
    throw new UserError('TradingView did not exit. Close it manually and retry.');
  }
}

function preloadForPatch(state: AppState): string {
  if (fs.existsSync(state.preloadPath)) return state.preloadPath;

  const source = preloadSourcePath();
  if (fs.existsSync(source)) return source;

  throw new UserError(
    `preload source not found at ${state.preloadPath}. Run "tvmod install" or "npm run build".`
  );
}

async function applyPatch(
  state: AppState,
  install: AppInstall
): Promise<{ changed: boolean; hash: string }> {
  if (!install.asar) throw new UserError('app.asar was not found.');

  const currentHash = sha256File(install.asar);
  if (state.patch && currentHash === state.patch.patchedHash) {
    return { changed: false, hash: currentHash };
  }

  if (isAsarPatched(install.asar)) {
    throw new UserError(
      'app.asar already contains a TVMod preload but the patch state does not match. Run "tvmod unpatch" or reinstall the app.'
    );
  }

  const preload = preloadForPatch(state);
  const backup = backupAsar(
    install.asar,
    backupsDir,
    install.version ?? state.app.version
  );

  const build = await buildPatchedAsar(install.asar, preload);

  try {
    installAsar(build.tempAsar, install.asar);
  } finally {
    cleanupPatchedBuild(build);
  }

  const patchedHash = sha256File(install.asar);
  if (patchedHash === backup.hash) {
    throw new UserError('the patched ASAR is unchanged; refusing to record a bad patch');
  }

  state.patch = {
    originalHash: backup.hash,
    patchedHash,
    backupPath: backup.backupPath,
    appVersion: install.version,
    patchedAt: new Date().toISOString(),
  };
  state.app.version = install.version;
  writeState(state);

  return { changed: true, hash: patchedHash };
}

export async function patchCommand(options: PatchOptions): Promise<void> {
  if (!options.yes) {
    throw new UserError(
      'patch mode modifies app.asar and requires explicit confirmation. Re-run with --yes.'
    );
  }

  const state = requireInstalled();
  const install = requirePatchableInstall(state, options.app);
  requireWritable(install);
  await ensureStopped(install, options.restart);

  const result = await applyPatch(state, install);

  heading(`TVMod ${__TVMOD_VERSION__} patch`);
  label('TradingView', install.version ?? 'unknown');
  label('app.asar', install.asar ?? 'unknown');
  label('backup', displayPath(state.patch?.backupPath ?? ''));
  label('patched hash', result.hash.slice(0, 16));

  if (result.changed) {
    ok('app.asar patched. Start TradingView normally; the preload is embedded.');
    warn('All launchers for this install now start the patched app.');
    warn('Run "tvmod unpatch --yes" to restore the backup.');
  } else {
    ok('this install is already patched.');
  }
}

export async function repairCommand(options: PatchOptions): Promise<void> {
  if (!options.yes) {
    throw new UserError(
      'repair mode modifies app.asar and requires explicit confirmation. Re-run with --yes.'
    );
  }

  const state = requireInstalled();
  if (!state.patch) {
    throw new UserError('this install has no TVMod patch to repair.');
  }

  const install = requirePatchableInstall(state, options.app);
  if (!install.asar) throw new UserError('app.asar was not found.');
  requireWritable(install);

  const currentHash = sha256File(install.asar);
  if (currentHash === state.patch.patchedHash) {
    ok('patch is intact; nothing to repair.');
    return;
  }

  await ensureStopped(install, options.restart);
  const result = await applyPatch(state, install);

  heading(`TVMod ${__TVMOD_VERSION__} repair`);
  label('TradingView', install.version ?? 'unknown');
  label('app.asar', install.asar);
  label('backup', displayPath(state.patch?.backupPath ?? ''));
  label('patched hash', result.hash.slice(0, 16));
  ok('patch refreshed.');
}

export async function unpatchCommand(options: PatchOptions): Promise<void> {
  if (!options.yes) {
    throw new UserError(
      'unpatch mode modifies app.asar and requires explicit confirmation. Re-run with --yes.'
    );
  }

  const state = requireInstalled();
  if (!state.patch) {
    info('this install is not patched.');
    return;
  }

  const install = requirePatchableInstall(state, options.app);
  if (!install.asar) throw new UserError('app.asar was not found.');
  requireWritable(install);
  await ensureStopped(install, options.restart);

  const currentHash = sha256File(install.asar);

  if (currentHash !== state.patch.patchedHash) {
    if (!isAsarPatched(install.asar)) {
      warn('TradingView was updated; the old TVMod patch is already gone.');
      delete state.patch;
      writeState(state);
      ok('stale patch state removed; the launcher backend remains available.');
      return;
    }

    throw new UserError(
      'app.asar changed but still contains the TVMod preload. Reinstall TradingView or restore it manually.'
    );
  }

  if (!fs.existsSync(state.patch.backupPath)) {
    throw new UserError(
      `the original backup is missing: ${state.patch.backupPath}`
    );
  }

  if (sha256File(state.patch.backupPath) !== state.patch.originalHash) {
    throw new UserError('the ASAR backup failed its hash check; refusing to restore it.');
  }

  restoreAsar(state.patch.backupPath, install.asar);

  if (sha256File(install.asar) !== state.patch.originalHash) {
    throw new UserError('the restored ASAR does not match the recorded original hash.');
  }

  delete state.patch;
  writeState(state);

  heading(`TVMod ${__TVMOD_VERSION__} unpatch`);
  label('app.asar', install.asar);
  ok('original app.asar restored.');
}
