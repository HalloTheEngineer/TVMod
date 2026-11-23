import fs from 'node:fs';
import path from 'node:path';
import { findInstall, installRoot, type AppInstall } from './app-detect.js';
import { UserError } from './errors.js';
import { copiedAppDir, ensureDir } from './paths.js';
import { pidsForInstall } from './proc.js';

function copiedExecutable(install: AppInstall): string {
  if (install.flavor === 'macos') {
    return path.join(
      copiedAppDir,
      'Contents',
      'MacOS',
      path.basename(install.realExe)
    );
  }
  return path.join(copiedAppDir, path.basename(install.realExe));
}

export function copyAppForPatch(
  install: AppInstall,
  options: { force?: boolean } = {}
): AppInstall {
  if (install.flavor === 'snap') {
    throw new UserError(
      'copying a confined Snap install is not supported. Use the launcher backend or install TradingView from a tarball/AUR package.'
    );
  }
  if (install.flavor === 'msix') {
    throw new UserError(
      'copying an MSIX install is not supported. Microsoft Store builds use package identity and cannot be launched from a copy reliably.'
    );
  }

  const sourceDir = installRoot(install);
  if (path.resolve(sourceDir) === path.resolve(copiedAppDir)) {
    throw new UserError('the detected install already is the user-owned TVMod copy.');
  }

  if (fs.existsSync(copiedAppDir)) {
    if (pidsForInstall(copiedExecutable(install)).length > 0) {
      throw new UserError(
        'the copied TradingView instance is running. Close it before replacing the copy.'
      );
    }
    if (!options.force) {
      throw new UserError(
        `the user-owned copy already exists at ${copiedAppDir} (pass --force to replace it)`
      );
    }
    fs.rmSync(copiedAppDir, { recursive: true, force: true });
  }

  ensureDir(path.dirname(copiedAppDir));

  try {
    fs.cpSync(sourceDir, copiedAppDir, {
      recursive: true,
      force: true,
      dereference: false,
      preserveTimestamps: true,
    });
  } catch (error) {
    throw new UserError(
      `failed to copy TradingView to ${copiedAppDir}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const exe = copiedExecutable(install);
  if (!fs.existsSync(exe)) {
    throw new UserError(`the copied app is missing its executable at ${exe}`);
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(exe, 0o755);
    } catch {
      // The mode is usually preserved by cpSync; ignore if it is already executable.
    }
  }

  const copied = findInstall(exe);
  if (!copied) {
    throw new UserError(
      `the copied app could not be detected; inspect ${copiedAppDir}`
    );
  }

  return copied;
}
