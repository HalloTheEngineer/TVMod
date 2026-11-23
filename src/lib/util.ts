import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseInspectorUrl(text: string): string | null {
  const match = text.match(/Debugger listening on (ws:\/\/[^\s]+)/);
  return match?.[1] ?? null;
}

export function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function readIfExists(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function tailFile(filePath: string, maxBytes = 4000): string {
  try {
    const stat = fs.statSync(filePath);
    const size = Math.min(stat.size, maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, stat.size - size);
    fs.closeSync(fd);
    return buffer.toString('utf8');
  } catch {
    return '';
  }
}

export function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function quoteDesktopArg(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$')}"`;
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function notify(summary: string, body: string): void {
  try {
    if (process.platform === 'linux') {
      spawnSync('notify-send', ['--app-name=TVMod', summary, body], {
        stdio: 'ignore',
      });
    } else if (process.platform === 'darwin') {
      const script = `display notification ${JSON.stringify(
        body
      )} with title ${JSON.stringify(summary)}`;
      spawnSync('osascript', ['-e', script], { stdio: 'ignore' });
    }
  } catch {
    // Notifications are best-effort.
  }
}
