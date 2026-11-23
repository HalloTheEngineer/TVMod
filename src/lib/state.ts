import fs from 'node:fs';
import type { InstallFlavor } from './app-detect.js';
import { ensureDir, stateFile } from './paths.js';

export interface AppState {
  schema: 1;
  coreVersion: string;
  installedAt: string;
  app: {
    exe: string;
    realExe: string;
    asar: string | null;
    flavor: InstallFlavor;
    version: string | null;
    command: string;
    baseArgs: string[];
  };
  preloadPath: string;
  wrapperPath: string;
  desktopFile: string;
  patch?: {
    originalHash: string;
    patchedHash: string;
    backupPath: string;
    appVersion: string | null;
    patchedAt: string;
  };
}

export function readState(): AppState | null {
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.schema !== 1 || !parsed.app || !parsed.preloadPath) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeState(state: AppState): void {
  ensureDir(stateFile.replace(/\/[^/]+$/, ''));
  const temp = `${stateFile}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o644,
  });
  fs.renameSync(temp, stateFile);
}

export function removeState(): void {
  try {
    fs.unlinkSync(stateFile);
  } catch {
    // Nothing to remove.
  }
}
