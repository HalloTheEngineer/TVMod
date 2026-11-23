import {
  GET_PRELOADS_SCRIPT,
  GET_WEB_CONTENTS_SCRIPT,
} from './bootstrap.js';
import { sleep } from './util.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private closed = false;

  constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      this.onMessage(String(event.data));
    });
    ws.addEventListener('close', () => {
      this.closed = true;
      this.rejectAll(new Error('CDP connection closed'));
    });
    ws.addEventListener('error', () => {
      this.rejectAll(new Error('CDP connection error'));
    });
  }

  static async connect(url: string, timeoutMs = 10_000): Promise<CdpClient> {
    if (typeof WebSocket === 'undefined') {
      throw new Error('tvmod requires Node.js 22 or newer');
    }

    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        try {
          ws.close();
        } catch {
          // Ignore.
        }
        reject(new Error('timed out connecting to the inspector'));
      }, timeoutMs);

      const onOpen = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error('failed to connect to the inspector'));
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
    });

    return new CdpClient(ws);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.closed || this.ws.readyState !== 1) {
      return Promise.reject(new Error('CDP connection is not open'));
    }

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, 20_000);

      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      includeCommandLineAPI: true,
    });

    if (result?.exceptionDetails) {
      const details = result.exceptionDetails;
      const description =
        details.exception?.description ?? details.text ?? 'evaluation failed';
      throw new Error(description);
    }

    return result?.result?.value as T;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      // Ignore.
    }
    this.rejectAll(new Error('CDP connection closed'));
  }

  private onMessage(text: string): void {
    let message: any;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }

    if (!message || typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;

    this.pending.delete(message.id);
    clearTimeout(pending.timer);

    if (message.error) {
      pending.reject(
        new Error(message.error.message ?? 'inspector request failed')
      );
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

export async function waitForMainProcess(
  client: CdpClient,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ready = await client.evaluate<boolean>(
        `(() => {
          try {
            return typeof require === 'function' && !!require('electron');
          } catch {
            return false;
          }
        })()`
      );
      if (ready) return;
    } catch {
      // The main context may not be ready yet.
    }
    await sleep(100);
  }
  throw new Error('timed out waiting for the Electron main process');
}

export async function waitForPreload(
  client: CdpClient,
  preloadPath: string,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const preloads = await client
      .evaluate<string[]>(GET_PRELOADS_SCRIPT)
      .catch((): string[] => []);

    if (preloads.includes(preloadPath)) return;
    await sleep(100);
  }
  throw new Error('timed out waiting for the preload to be installed');
}

export async function getWebContents(
  client: CdpClient
): Promise<Array<{ id: number; url: string; type: string; loading: boolean }>> {
  return client.evaluate(GET_WEB_CONTENTS_SCRIPT);
}
