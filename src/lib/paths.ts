import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = os.homedir();

function xdg(envName: string, fallback: string): string {
  const value = process.env[envName];
  return value && value.trim() ? path.resolve(value) : path.join(home, fallback);
}

export const configDir = path.join(xdg('XDG_CONFIG_HOME', '.config'), 'tvmod');
export const dataDir = path.join(xdg('XDG_DATA_HOME', '.local/share'), 'tvmod');
export const stateDir = path.join(xdg('XDG_STATE_HOME', '.local/state'), 'tvmod');

export const logsDir = path.join(stateDir, 'logs');
export const launchLog = path.join(logsDir, 'launch.log');
export const stateFile = path.join(configDir, 'state.json');
export const preloadTarget = path.join(dataDir, 'preload.js');
export const backupsDir = path.join(dataDir, 'backups');

export const localBinDir = path.join(home, '.local', 'bin');
export const wrapperPath = path.join(localBinDir, 'tvmod');

export const desktopDir = path.join(
  xdg('XDG_DATA_HOME', '.local/share'),
  'applications'
);
export const desktopFile = path.join(desktopDir, 'tradingview.desktop');
export const vanillaDesktopFile = path.join(
  desktopDir,
  'tradingview-vanilla.desktop'
);
export const desktopBackupFile = `${desktopFile}.tvmod-backup`;
export const wrapperBackupFile = `${wrapperPath}.tvmod-backup`;

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function preloadSourcePath(): string {
  const entry = process.argv[1];
  if (!entry) {
    throw new Error('cannot determine the tvmod entry point');
  }
  return path.join(path.dirname(path.resolve(entry)), 'preload.cjs');
}

export function displayPath(filePath: string): string {
  const relative = path.relative(home, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return filePath;
  }
  return `~/${relative}`;
}
