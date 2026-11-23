import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readAsarPackageJson } from './asar-lite.js';

export type InstallFlavor =
  | 'aur'
  | 'tarball'
  | 'snap'
  | 'macos'
  | 'windows'
  | 'msix'
  | 'custom';

export interface AppInstall {
  /** Path used to launch the app. */
  exe: string;
  /** Resolved executable for normal installs. */
  realExe: string;
  /** app.asar path, when it can be located. */
  asar: string | null;
  flavor: InstallFlavor;
  version: string | null;
  /** Command used to spawn the app. */
  command: string;
  /** Arguments that must precede the TVMod arguments. */
  baseArgs: string[];
}

export function inferFlavor(
  exe: string,
  platform: NodeJS.Platform = process.platform
): InstallFlavor {
  const normalized = path.resolve(exe);

  if (platform === 'win32') {
    if (/[\\/]WindowsApps[\\/]/i.test(normalized)) return 'msix';
    return 'windows';
  }

  if (platform === 'darwin') {
    if (/\.app[\\/]Contents[\\/]MacOS[\\/]/i.test(normalized)) return 'macos';
    return 'custom';
  }

  if (normalized.startsWith('/snap/')) return 'snap';
  if (normalized.startsWith('/usr/lib/tradingview')) return 'aur';
  if (normalized.startsWith('/opt/TradingView')) return 'tarball';
  return 'custom';
}

export function findInPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const pathValue = env.PATH ?? '';
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next directory.
    }
  }
  return null;
}

let cachedMsixLocation: string | null | undefined;

export function msixInstallLocation(): string | null {
  if (process.platform !== 'win32') return null;
  if (cachedMsixLocation !== undefined) return cachedMsixLocation;

  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Get-AppxPackage | Where-Object { $_.Name -like '*TradingView*' } | Select-Object -First 1 -ExpandProperty InstallLocation",
    ],
    { encoding: 'utf8', timeout: 15_000, windowsHide: true }
  );

  const output = (result.stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  cachedMsixLocation = output.at(-1) ?? null;
  return cachedMsixLocation;
}

export function candidatePaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string[] {
  const candidates: string[] = [];
  if (env.TVMOD_APP) candidates.push(env.TVMOD_APP);

  if (platform === 'win32') {
    if (env.LOCALAPPDATA) {
      candidates.push(
        path.join(env.LOCALAPPDATA, 'Programs', 'TradingView', 'TradingView.exe'),
        path.join(env.LOCALAPPDATA, 'TradingView', 'TradingView.exe'),
        path.join(
          env.LOCALAPPDATA,
          'Microsoft',
          'WindowsApps',
          'TradingView.exe'
        ),
        path.join(
          env.LOCALAPPDATA,
          'Programs',
          'TradingView Desktop',
          'TradingView.exe'
        )
      );
    }
    if (env.PROGRAMFILES) {
      candidates.push(
        path.join(env.PROGRAMFILES, 'TradingView', 'TradingView.exe'),
        path.join(
          env.PROGRAMFILES,
          'TradingView Desktop',
          'TradingView.exe'
        )
      );
    }
    if (env['PROGRAMFILES(X86)']) {
      candidates.push(
        path.join(env['PROGRAMFILES(X86)'], 'TradingView', 'TradingView.exe')
      );
    }

    const fromPath =
      findInPath('TradingView.exe', env) ??
      findInPath('tradingview.exe', env);
    if (fromPath) candidates.push(fromPath);

    const msix = msixInstallLocation();
    if (msix) candidates.push(path.join(msix, 'TradingView.exe'));
  } else if (platform === 'darwin') {
    for (const appDir of [
      '/Applications/TradingView.app',
      path.join(home, 'Applications', 'TradingView.app'),
      '/Applications/TradingView Desktop.app',
      path.join(home, 'Applications', 'TradingView Desktop.app'),
    ]) {
      candidates.push(appDir);
    }
    const fromPath = findInPath('TradingView', env);
    if (fromPath) candidates.push(fromPath);
  } else {
    candidates.push(
      '/usr/bin/tradingview',
      '/opt/TradingView/tradingview',
      '/snap/bin/tradingview'
    );
    const fromPath = findInPath('tradingview', env);
    if (fromPath) candidates.push(fromPath);
  }

  return [
    ...new Set(
      candidates
        .filter((value): value is string => Boolean(value))
        .map((value) => path.resolve(value))
    ),
  ];
}

function snapAsarCandidates(): string[] {
  return [
    '/snap/tradingview/current/resources/app.asar',
    '/snap/tradingview/current/usr/lib/tradingview/resources/app.asar',
  ];
}

function normalAsar(exe: string): string | null {
  const appRoot = path.dirname(exe);
  const candidate = path.join(appRoot, 'resources', 'app.asar');
  return fs.existsSync(candidate) ? candidate : null;
}

function macAsar(exe: string): string | null {
  const contents = path.dirname(path.dirname(exe));
  const candidate = path.join(contents, 'Resources', 'app.asar');
  if (fs.existsSync(candidate)) return candidate;
  return normalAsar(exe);
}

function macExecutable(appDir: string): string | null {
  const macosDir = path.join(appDir, 'Contents', 'MacOS');
  const preferred = path.join(macosDir, 'TradingView');
  if (fs.existsSync(preferred)) return preferred;

  try {
    const entry = fs
      .readdirSync(macosDir, { withFileTypes: true })
      .find((item) => item.isFile());
    return entry ? path.join(macosDir, entry.name) : null;
  } catch {
    return null;
  }
}

function inspectMsix(
  rawPath: string,
  platform: NodeJS.Platform
): AppInstall | null {
  if (platform !== 'win32') return null;
  if (!/[\\/]WindowsApps[\\/]/i.test(rawPath)) return null;

  const exe = rawPath.toLowerCase().endsWith('.exe')
    ? rawPath
    : path.join(rawPath, 'TradingView.exe');
  const asar = path.join(path.dirname(exe), 'resources', 'app.asar');

  let version: string | null = null;
  try {
    if (fs.existsSync(asar)) {
      version = readAsarPackageJson(asar).version ?? null;
    }
  } catch {
    version = null;
  }

  return {
    exe,
    realExe: exe,
    asar: fs.existsSync(asar) ? asar : null,
    flavor: 'msix',
    version,
    command: exe,
    baseArgs: [],
  };
}

export function inspectInstallPath(
  rawPath: string,
  platform: NodeJS.Platform = process.platform
): AppInstall | null {
  const msix = inspectMsix(rawPath, platform);
  if (msix) return msix;

  let candidate = path.resolve(rawPath);

  try {
    if (fs.statSync(candidate).isDirectory()) {
      if (platform === 'darwin' && candidate.endsWith('.app')) {
        const inner = macExecutable(candidate);
        if (inner) candidate = inner;
      } else if (platform === 'win32') {
        const exe = path.join(candidate, 'TradingView.exe');
        if (fs.existsSync(exe)) {
          candidate = exe;
        } else {
          try {
            const entry = fs
              .readdirSync(candidate, { withFileTypes: true })
              .find(
                (item) =>
                  item.isFile() &&
                  item.name.toLowerCase() === 'tradingview.exe'
              );
            if (entry) candidate = path.join(candidate, entry.name);
          } catch {
            // Leave the directory candidate as-is.
          }
        }
      } else {
        const exe = path.join(candidate, 'tradingview');
        if (fs.existsSync(exe)) candidate = exe;
      }
    }
  } catch {
    return null;
  }

  if (!fs.existsSync(candidate)) return null;

  const snap = candidate.startsWith('/snap/');
  let realExe = candidate;

  if (!snap) {
    try {
      realExe = fs.realpathSync(candidate);
    } catch {
      return null;
    }
  }

  const flavor = inferFlavor(realExe, platform);
  let asar: string | null = null;

  if (flavor === 'snap') {
    asar = snapAsarCandidates().find((value) => fs.existsSync(value)) ?? null;
  } else if (flavor === 'macos') {
    asar = macAsar(realExe);
  } else {
    asar = normalAsar(realExe);
  }

  let version: string | null = null;
  if (asar) {
    try {
      version = readAsarPackageJson(asar).version ?? null;
    } catch {
      version = null;
    }
  }

  return {
    exe: candidate,
    realExe,
    asar,
    flavor,
    version,
    command: flavor === 'snap' ? 'snap' : realExe,
    baseArgs: flavor === 'snap' ? ['run', 'tradingview'] : [],
  };
}

export function findInstall(
  explicit?: string,
  platform: NodeJS.Platform = process.platform
): AppInstall | null {
  const paths = explicit ? [explicit] : candidatePaths(platform);
  for (const value of paths) {
    const install = inspectInstallPath(value, platform);
    if (install) return install;
  }
  return null;
}

export function installRoot(install: AppInstall): string {
  if (install.flavor !== 'macos') return path.dirname(install.realExe);

  const parts = install.realExe.split(path.sep);
  const appIndex = parts.findIndex((part) => part.endsWith('.app'));
  if (appIndex === -1) return path.dirname(install.realExe);
  return parts.slice(0, appIndex + 1).join(path.sep) || path.sep;
}

export function describeFlavor(flavor: InstallFlavor): string {
  switch (flavor) {
    case 'aur':
      return 'AUR / repackaged Snap';
    case 'tarball':
      return 'official tarball';
    case 'snap':
      return 'Snap';
    case 'macos':
      return 'macOS app';
    case 'windows':
      return 'Windows standalone';
    case 'msix':
      return 'Windows MSIX (Microsoft Store)';
    default:
      return 'custom install';
  }
}
