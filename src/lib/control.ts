import fs from 'node:fs';
import { controlFile } from './paths.js';

export interface ControlState {
  port: number;
  token: string;
  pid: number;
  startedAt: number;
}

function readControl(): ControlState | null {
  try {
    const raw = fs.readFileSync(controlFile, 'utf8');
    const value = JSON.parse(raw) as Partial<ControlState>;
    if (
      typeof value.port !== 'number' ||
      typeof value.token !== 'string' ||
      typeof value.pid !== 'number'
    ) {
      return null;
    }
    return value as ControlState;
  } catch {
    return null;
  }
}

export async function requestPageReload(): Promise<boolean> {
  const control = readControl();
  if (!control) return false;

  try {
    const response = await fetch(
      `http://127.0.0.1:${control.port}/reload`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${control.token}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}
