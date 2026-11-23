import fs from 'node:fs';
import path from 'node:path';
import { readAsarPackageJson } from './asar-lite.js';

export type InstallFlavor = 'aur' | 'tarball' | 'snap' | 'custom';

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

export function inferFlavor(exe: string): InstallFlavor {
  const normalized = path.resolve(exe);
  if (normalized.startsWith('/snap/')) return 'snap';
  if (normalized.startsWith('/usr/lib/tradingview')) return 'aur';
  if (normalized.startsWith('/opt/TradingView')) return 'tarball';
  return 'custom';
}

export function candidatePaths(): string[] {
  const candidates = [
    process.env.TVMOD_APP,
    '/usr/bin/tradingview',
    '/opt/TradingView/tradingview',
    '/snap/bin/tradingview',
  ].filter((value): value is string => Boolean(value));

  const fromPath = findInPath('tradingview');
  if (fromPath) candidates.push(fromPath);

  return [...new Set(candidates.map((value) => path.resolve(value)))];
}

export function findInPath(name: string): string | null {
  const pathValue = process.env.PATH ?? '';
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

function tryInstall(rawPath: string): AppInstall | null {
  let candidate = path.resolve(rawPath);

  try {
    if (fs.statSync(candidate).isDirectory()) {
      candidate = path.join(candidate, 'tradingview');
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

  const flavor = inferFlavor(realExe);
  let asar: string | null = null;

  if (flavor === 'snap') {
    asar = snapAsarCandidates().find((value) => fs.existsSync(value)) ?? null;
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

export function findInstall(explicit?: string): AppInstall | null {
  const paths = explicit ? [explicit] : candidatePaths();
  for (const value of paths) {
    const install = tryInstall(value);
    if (install) return install;
  }
  return null;
}

export function describeFlavor(flavor: InstallFlavor): string {
  switch (flavor) {
    case 'aur':
      return 'AUR / repackaged Snap';
    case 'tarball':
      return 'official tarball';
    case 'snap':
      return 'Snap';
    default:
      return 'custom install';
  }
}
