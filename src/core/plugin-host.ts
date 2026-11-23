import type { TvmodConfig } from './config.js';
import type { Host } from './host.js';
import type {
  EmbeddedPlugin,
  ExternalPluginManifest,
  PluginPermission,
  PluginSettingDefinition,
} from './plugin-types.js';

interface Runtime {
  signature: string;
  cleanup?: () => void | Promise<void>;
  error?: string;
}

interface SettingsRecord {
  [key: string]: boolean;
}

interface PluginContext {
  id: string;
  manifest: ExternalPluginManifest;
  settings: Readonly<SettingsRecord>;
  app: { version: string; host: 'desktop'; platform: string };
  log: (...args: unknown[]) => void;
  dom?: {
    query<T extends Element = Element>(selector: string): T | null;
    queryAll<T extends Element = Element>(selector: string): T[];
    waitFor(selector: string, timeoutMs?: number): Promise<Element>;
    observe(callback: () => void): () => void;
  };
  style?: {
    add(css: string): () => void;
    hide(selector: string): () => void;
  };
  storage?: {
    get<T = unknown>(key: string, fallback?: T): T | undefined;
    set(key: string, value: unknown): void;
    remove(key: string): void;
  };
}

function defaultSettings(
  settings: PluginSettingDefinition[] | undefined
): SettingsRecord {
  return Object.fromEntries(
    (settings ?? []).map((setting) => [setting.key, setting.default])
  );
}

export class PluginHost {
  private readonly runtimes = new Map<string, Runtime>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly plugins: EmbeddedPlugin[],
    private readonly getConfig: () => TvmodConfig,
    private readonly host: Host,
    private readonly version: string
  ) {}

  errorFor(id: string): string | null {
    return this.runtimes.get(id)?.error ?? null;
  }

  sync(): Promise<void> {
    this.queue = this.queue
      .then(() => this.syncInternal())
      .catch((error) => {
        console.error('[tvmod] plugin sync failed', error);
      });
    return this.queue;
  }

  private async syncInternal(): Promise<void> {
    const config = this.getConfig();

    for (const plugin of this.plugins) {
      const id = plugin.manifest.id;
      const state = config.plugins[id];

      if (!state?.enabled) {
        await this.stop(id);
        continue;
      }

      const settings: SettingsRecord = {
        ...defaultSettings(plugin.manifest.settings),
        ...(state.settings ?? {}),
      };
      const signature = JSON.stringify(settings);
      const runtime = this.runtimes.get(id);

      if (runtime && runtime.signature === signature) continue;

      await this.stop(id);
      await this.start(plugin, settings, signature);
    }
  }

  private async start(
    plugin: EmbeddedPlugin,
    settings: SettingsRecord,
    signature: string
  ): Promise<void> {
    const id = plugin.manifest.id;

    try {
      const ctx = this.createContext(plugin, settings, signature);
      const module = { exports: {} as Record<string, unknown> };
      const factory = new Function(
        'module',
        'exports',
        'ctx',
        'require',
        'process',
        `"use strict";\n${plugin.source}`
      );

      factory(module, module.exports, ctx, undefined, undefined);

      const exported = module.exports as {
        start?: (ctx: PluginContext) => unknown;
        stop?: (ctx: PluginContext) => unknown;
      };

      if (typeof exported.start !== 'function') {
        throw new Error('plugin must export a start(ctx) function');
      }

      const result = await Promise.resolve(exported.start(ctx));

      let cleanup: (() => void | Promise<void>) | undefined;
      if (typeof result === 'function') {
        cleanup = result as () => void | Promise<void>;
      } else if (
        result &&
        typeof (result as { stop?: unknown }).stop === 'function'
      ) {
        cleanup = () => {
          (result as { stop: () => unknown }).stop();
        };
      } else if (typeof exported.stop === 'function') {
        cleanup = () => {
          exported.stop?.(ctx);
        };
      }

      this.runtimes.set(id, { signature, cleanup });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[tvmod:${id}] plugin failed to start:`, error);
      this.runtimes.set(id, { signature, error: message });
    }
  }

  private async stop(id: string): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    this.runtimes.delete(id);

    if (!runtime.cleanup) return;

    try {
      await Promise.resolve(runtime.cleanup());
    } catch (error) {
      console.error(`[tvmod:${id}] plugin cleanup failed:`, error);
    }
  }

  private createContext(
    plugin: EmbeddedPlugin,
    settings: SettingsRecord,
    signature: string
  ): PluginContext {
    void signature;
    const manifest = plugin.manifest;
    const id = manifest.id;
    const permissions = new Set<PluginPermission>(manifest.permissions ?? []);

    const context: PluginContext = {
      id,
      manifest,
      settings: Object.freeze({ ...settings }),
      app: {
        version: this.version,
        host: 'desktop',
        platform: process.platform,
      },
      log: (...args: unknown[]) => {
        console.log(`[tvmod:${id}]`, ...args);
      },
    };

    if (permissions.has('dom')) {
      context.dom = {
        query: (selector) => document.querySelector(selector),
        queryAll: (selector) =>
          Array.from(document.querySelectorAll(selector)),
        waitFor: (selector, timeoutMs = 15_000) =>
          new Promise<Element>((resolve, reject) => {
            const existing = document.querySelector(selector);
            if (existing) {
              resolve(existing);
              return;
            }

            const observer = new MutationObserver(() => {
              const element = document.querySelector(selector);
              if (element) {
                cleanup();
                resolve(element);
              }
            });
            const timer = setTimeout(() => {
              cleanup();
              reject(new Error(`timed out waiting for ${selector}`));
            }, timeoutMs);
            const cleanup = (): void => {
              observer.disconnect();
              clearTimeout(timer);
            };

            observer.observe(document.documentElement, {
              childList: true,
              subtree: true,
            });
          }),
        observe: (callback) => {
          const observer = new MutationObserver(() => {
            try {
              callback();
            } catch (error) {
              console.error(`[tvmod:${id}] observer callback failed:`, error);
            }
          });
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
          });
          return () => observer.disconnect();
        },
      };
    }

    if (permissions.has('style')) {
      context.style = {
        add: (css) => {
          const key = this.host.insertCSS(css);
          let active = true;
          return () => {
            if (!active) return;
            active = false;
            try {
              this.host.removeInsertedCSS(key);
            } catch {
              // Ignore.
            }
          };
        },
        hide: (selector) =>
          context.style!.add(`${selector} { display: none !important; }`),
      };
    }

    if (permissions.has('storage')) {
      const prefix = `tvmod.plugin.${id}.`;
      context.storage = {
        get: <T = unknown>(key: string, fallback?: T): T | undefined => {
          try {
            const raw = localStorage.getItem(prefix + key);
            if (raw === null) return fallback;
            return JSON.parse(raw) as T;
          } catch {
            return fallback;
          }
        },
        set: (key, value) => {
          try {
            localStorage.setItem(prefix + key, JSON.stringify(value));
          } catch {
            // Ignore quota/security failures.
          }
        },
        remove: (key) => {
          try {
            localStorage.removeItem(prefix + key);
          } catch {
            // Ignore.
          }
        },
      };
    }

    return context;
  }
}
