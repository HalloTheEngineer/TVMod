import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface PlatformPaths {
  configDir: string;
  dataDir: string;
  stateDir: string;
  logsDir: string;
  launchLog: string;
  stateFile: string;
  controlFile: string;
  registriesFile: string;
  preloadTarget: string;
  snapPreloadTarget: string;
  backupsDir: string;
  pluginsDir: string;
  copiedAppDir: string;
  localBinDir: string;
  wrapperPath: string;
  desktopDir: string;
  desktopFile: string;
  vanillaDesktopFile: string;
  desktopBackupFile: string;
  wrapperBackupFile: string;
}

function envDir(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string
): string {
  const value = env[name];
  return value && value.trim() ? path.resolve(value) : fallback;
}

export function computePaths(
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
  env: NodeJS.ProcessEnv = process.env
): PlatformPaths {
  let configDir: string;
  let dataDir: string;
  let stateDir: string;
  let logsDir: string;
  let localBinDir: string;
  let wrapperName: string;
  let desktopDir: string;
  let desktopName: string;
  let vanillaName: string;
  let copiedAppDir: string;

  if (platform === 'win32') {
    const appData = envDir(
      env,
      'APPDATA',
      path.join(home, 'AppData', 'Roaming')
    );
    const localAppData = envDir(
      env,
      'LOCALAPPDATA',
      path.join(home, 'AppData', 'Local')
    );
    configDir = path.join(appData, 'tvmod');
    dataDir = path.join(localAppData, 'tvmod');
    stateDir = path.join(dataDir, 'state');
    logsDir = path.join(stateDir, 'logs');
    localBinDir = path.join(dataDir, 'bin');
    wrapperName = 'tvmod.cmd';
    desktopDir = path.join(
      appData,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs'
    );
    desktopName = 'TradingView (TVMod).lnk';
    vanillaName = 'TradingView (Vanilla).lnk';
    copiedAppDir = path.join(dataDir, 'apps', 'tradingview');
  } else if (platform === 'darwin') {
    const appSupport = path.join(
      home,
      'Library',
      'Application Support',
      'tvmod'
    );
    configDir = appSupport;
    dataDir = appSupport;
    stateDir = path.join(appSupport, 'state');
    logsDir = path.join(home, 'Library', 'Logs', 'tvmod');
    localBinDir = path.join(home, '.local', 'bin');
    wrapperName = 'tvmod';
    desktopDir = path.join(home, 'Applications');
    desktopName = 'TradingView (TVMod).command';
    vanillaName = 'TradingView (Vanilla).command';
    copiedAppDir = path.join(appSupport, 'apps', 'TradingView.app');
  } else {
    configDir = path.join(
      envDir(env, 'XDG_CONFIG_HOME', path.join(home, '.config')),
      'tvmod'
    );
    dataDir = path.join(
      envDir(env, 'XDG_DATA_HOME', path.join(home, '.local/share')),
      'tvmod'
    );
    stateDir = path.join(
      envDir(env, 'XDG_STATE_HOME', path.join(home, '.local/state')),
      'tvmod'
    );
    logsDir = path.join(stateDir, 'logs');
    localBinDir = path.join(home, '.local', 'bin');
    wrapperName = 'tvmod';
    desktopDir = path.join(
      envDir(env, 'XDG_DATA_HOME', path.join(home, '.local/share')),
      'applications'
    );
    desktopName = 'tradingview.desktop';
    vanillaName = 'tradingview-vanilla.desktop';
    copiedAppDir = path.join(home, '.local', 'opt', 'tradingview');
  }

  const stateFile = path.join(configDir, 'state.json');
  const preloadTarget = path.join(dataDir, 'preload.js');
  const wrapperPath = path.join(localBinDir, wrapperName);
  const desktopFile = path.join(desktopDir, desktopName);

  return {
    configDir,
    dataDir,
    stateDir,
    logsDir,
    launchLog: path.join(logsDir, 'launch.log'),
    stateFile,
    controlFile: path.join(stateDir, 'control.json'),
    registriesFile: path.join(configDir, 'registries.json'),
    preloadTarget,
    snapPreloadTarget: path.join(
      home,
      'snap',
      'tradingview',
      'common',
      'tvmod',
      'preload.js'
    ),
    backupsDir: path.join(dataDir, 'backups'),
    pluginsDir: path.join(dataDir, 'plugins'),
    copiedAppDir,
    localBinDir,
    wrapperPath,
    desktopDir,
    desktopFile,
    vanillaDesktopFile: path.join(desktopDir, vanillaName),
    desktopBackupFile: `${desktopFile}.tvmod-backup`,
    wrapperBackupFile: `${wrapperPath}.tvmod-backup`,
  };
}

export const paths = computePaths();
export const configDir = paths.configDir;
export const dataDir = paths.dataDir;
export const stateDir = paths.stateDir;
export const logsDir = paths.logsDir;
export const launchLog = paths.launchLog;
export const stateFile = paths.stateFile;
export const controlFile = paths.controlFile;
export const registriesFile = paths.registriesFile;
export const preloadTarget = paths.preloadTarget;
export const snapPreloadTarget = paths.snapPreloadTarget;
export const backupsDir = paths.backupsDir;
export const pluginsDir = paths.pluginsDir;
export const copiedAppDir = paths.copiedAppDir;
export const localBinDir = paths.localBinDir;
export const wrapperPath = paths.wrapperPath;
export const desktopDir = paths.desktopDir;
export const desktopFile = paths.desktopFile;
export const vanillaDesktopFile = paths.vanillaDesktopFile;
export const desktopBackupFile = paths.desktopBackupFile;
export const wrapperBackupFile = paths.wrapperBackupFile;

export function preloadTargetForFlavor(flavor: string): string {
  return flavor === 'snap' ? snapPreloadTarget : preloadTarget;
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function isStandaloneBinary(): boolean {
  const bun = Boolean(
    (process.versions as Record<string, string | undefined>).bun
  );
  return bun && path.basename(process.execPath) !== 'bun';
}

export function preloadSourcePath(): string {
  const entry = isStandaloneBinary() ? process.execPath : process.argv[1];
  if (!entry) {
    throw new Error('cannot determine the tvmod entry point');
  }
  return path.join(path.dirname(path.resolve(entry)), 'preload.cjs');
}

export function displayPath(filePath: string): string {
  const home = os.homedir();
  const relative = path.relative(home, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return filePath;
  }
  return `~/${relative}`;
}
