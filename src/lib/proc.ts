import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { sleep } from './util.js';

function pidsFromPs(): number[] {
  const result = spawnSync('ps', ['-A', '-o', 'pid=', '-o', 'comm='], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || !result.stdout) return [];

  const pids: number[] = [];
  for (const line of result.stdout.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match && match[2] === 'tradingview') {
      pids.push(Number(match[1]));
    }
  }
  return pids;
}

export function tradingViewPids(): number[] {
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

export function pidsForInstall(exe: string): number[] {
  if (exe.startsWith('/snap/')) return tradingViewPids();

  let realExe: string;
  try {
    realExe = fs.realpathSync(exe);
  } catch {
    realExe = exe;
  }

  return tradingViewPids().filter((pid) => {
    try {
      const link = fs.readlinkSync(`/proc/${pid}/exe`).replace(/ \(deleted\)$/, '');
      return link === realExe;
    } catch {
      return false;
    }
  });
}

export function isTradingViewRunning(): boolean {
  return tradingViewPids().some((pid) => pidAlive(pid));
}

export function terminatePids(pids: number[]): void {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
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
