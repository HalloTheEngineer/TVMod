import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './util.js';

function nameMatches(comm: string): boolean {
  const base = path.basename(comm.trim()).replace(/\.exe$/i, '');
  return base.toLowerCase() === 'tradingview';
}

function pidsFromPs(): number[] {
  const result = spawnSync('ps', ['-A', '-o', 'pid=', '-o', 'comm='], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || !result.stdout) return [];

  const pids: number[] = [];
  for (const line of result.stdout.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match?.[1] && match[2]) {
      if (nameMatches(match[2])) pids.push(Number(match[1]));
    }
  }
  return pids;
}

function pidsFromPgrep(names: string[]): number[] {
  const pids: number[] = [];
  for (const name of names) {
    const result = spawnSync('pgrep', ['-x', name], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout) continue;
    for (const line of result.stdout.split('\n')) {
      const pid = Number.parseInt(line, 10);
      if (Number.isFinite(pid) && pid > 0) pids.push(pid);
    }
  }
  return [...new Set(pids)];
}

function pidsOnWindows(): number[] {
  const result = spawnSync(
    'tasklist',
    ['/FI', 'IMAGENAME eq TradingView.exe', '/FO', 'CSV', '/NH'],
    { encoding: 'utf8', windowsHide: true }
  );
  if (result.status !== 0 || !result.stdout) return [];

  const pids: number[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('"')) continue;
    const fields = trimmed
      .slice(1, -1)
      .split('","')
      .map((value) => value.replace(/""/g, '"'));
    const pid = Number.parseInt(fields[1] ?? '', 10);
    if (Number.isFinite(pid) && pid > 0) pids.push(pid);
  }
  return [...new Set(pids)];
}

export function tradingViewPids(
  platform: NodeJS.Platform = process.platform
): number[] {
  if (platform === 'win32') return pidsOnWindows();

  if (platform === 'darwin') {
    const pids = pidsFromPgrep(['TradingView', 'tradingview']);
    return pids.length > 0 ? pids : pidsFromPs();
  }

  const result = spawnSync('pgrep', ['-x', 'tradingview'], {
    encoding: 'utf8',
  });

  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return pidsFromPs();
  }

  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout
    .split('\n')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function executableForPid(
  pid: number,
  platform: NodeJS.Platform
): string | null {
  if (platform === 'linux') {
    try {
      return fs
        .readlinkSync(`/proc/${pid}/exe`)
        .replace(/ \(deleted\)$/, '');
    } catch {
      return null;
    }
  }

  if (platform === 'darwin') {
    const result = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], {
      encoding: 'utf8',
    });
    const value = result.status === 0 ? result.stdout.trim() : '';
    return value || null;
  }

  return null;
}

function sameExecutable(left: string, right: string): boolean {
  const a = path.resolve(left);
  const b = path.resolve(right);
  if (a === b) return true;

  try {
    if (path.resolve(fs.realpathSync(left)) === path.resolve(fs.realpathSync(right))) {
      return true;
    }
  } catch {
    // Fall through to the basename check.
  }

  return (
    path.basename(a).toLowerCase() === path.basename(b).toLowerCase()
  );
}

export function pidsForInstall(
  exe: string,
  platform: NodeJS.Platform = process.platform
): number[] {
  if (exe.startsWith('/snap/')) return tradingViewPids(platform);

  let realExe: string;
  try {
    realExe = fs.realpathSync(exe);
  } catch {
    realExe = exe;
  }

  const pids = tradingViewPids(platform);
  if (platform === 'win32') return pids;

  const resolved = pids.map((pid) => ({
    pid,
    executable: executableForPid(pid, platform),
  }));
  const known = resolved.filter(
    (item): item is { pid: number; executable: string } =>
      item.executable !== null
  );

  if (known.length === 0) return pids;

  return known
    .filter((item) => sameExecutable(item.executable, realExe))
    .map((item) => item.pid);
}

export function isTradingViewRunning(): boolean {
  return tradingViewPids().some((pid) => pidAlive(pid));
}

export function terminatePids(
  pids: number[],
  platform: NodeJS.Platform = process.platform
): void {
  for (const pid of pids) {
    try {
      if (platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch {
      // Process already exited.
    }
  }
}

export async function waitForExit(
  pids: number[],
  timeoutMs = 8000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pids.some((pid) => pidAlive(pid))) return true;
    await sleep(100);
  }
  return !pids.some((pid) => pidAlive(pid));
}

export function terminateTradingView(pids: number[]): void {
  terminatePids(pids);
}
