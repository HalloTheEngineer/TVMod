import { sanitizeSettingValue, type TvmodConfig } from './config.js';
import type { Host } from './host.js';
import type {
  EmbeddedPlugin,
  ExternalPluginManifest,
  PluginPermission,
  PluginSettings,
} from './plugin-types.js';

export interface SettingsChange {
  settings: Readonly<PluginSettings>;
  previous: Readonly<PluginSettings>;
  changed: string[];
}

export interface PluginEvents {
  on(
    name: string,
    handler: (payload: unknown, from: string) => unknown
  ): () => void;
  once(
    name: string,
    handler: (payload: unknown, from: string) => unknown
  ): () => void;
  emit(name: string, payload?: unknown): void;
}

export interface PluginContext {
  id: string;
  manifest: ExternalPluginManifest;
  settings: Readonly<PluginSettings>;
  app: { version: string; host: 'desktop'; platform: string };
  log: (...args: unknown[]) => void;
  onCleanup(cleanup: () => void | Promise<void>): void;
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
  events?: PluginEvents;
}

interface PluginExports {
  start?: (ctx: PluginContext) => unknown;
  stop?: (ctx: PluginContext) => unknown;
  onSettingsChange?: (change: SettingsChange) => unknown;
}

interface Runtime {
  signature: string;
  settings: PluginSettings;
  exports?: PluginExports;
  context?: PluginContext;
  cleanup?: () => void | Promise<void>;
  dispose?: () => void | Promise<void>;
  error?: string;
}

interface EventListener {
  pluginId: string;
  handler: (payload: unknown, from: string) => unknown;
}

const EVENT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const MAX_EVENT_LISTENERS = 200;


function changedKeys(
  previous: PluginSettings,
  next: PluginSettings
): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys]
    .filter((key) => previous[key] !== next[key])
    .sort();
}

export class PluginHost {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly eventListeners = new Map<string, Set<EventListener>>();
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

      const settings: PluginSettings = Object.fromEntries(
        (plugin.manifest.settings ?? []).map((setting) => [
          setting.key,
          sanitizeSettingValue(
            setting,
            setting.key in (state.settings ?? {})
              ? state.settings?.[setting.key]
              : setting.default
          ),
        ])
      );
      const signature = JSON.stringify(settings);
      const runtime = this.runtimes.get(id);

      if (runtime && runtime.signature === signature) continue;

      if (runtime?.exports?.onSettingsChange) {
        const previous = runtime.settings;
        const changed = changedKeys(previous, settings);
        try {
          await Promise.resolve(
            runtime.exports.onSettingsChange({
              settings: Object.freeze({ ...settings }),
              previous: Object.freeze({ ...previous }),
              changed,
            })
          );
          runtime.settings = settings;
          runtime.signature = signature;
          continue;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`[tvmod:${id}] onSettingsChange failed:`, error);
          await this.stop(id);
          this.runtimes.set(id, { signature, settings, error: message });
          continue;
        }
      }

      await this.stop(id);
      await this.start(plugin, settings, signature);
    }
  }

  private async start(
    plugin: EmbeddedPlugin,
    settings: PluginSettings,
    signature: string
  ): Promise<void> {
    const id = plugin.manifest.id;
    let context: PluginContext | null = null;
    let dispose: (() => void | Promise<void>) | undefined;

    try {
      const created = this.createContext(plugin, settings);
      context = created.context;
      dispose = created.dispose;

      const module = { exports: {} as Record<string, unknown> };
      const factory = new Function(
        'module',
        'exports',
        'ctx',
        'require',
        'process',
        `"use strict";\n${plugin.source}`
      );

      factory(module, module.exports, context, undefined, undefined);

      const exported = module.exports as PluginExports;

      if (typeof exported.start !== 'function') {
        throw new Error('plugin must export a start(ctx) function');
      }

      const result = await Promise.resolve(exported.start(context));

      let cleanup: (() => void | Promise<void>) | undefined;
      if (typeof result === 'function') {
        cleanup = result as () => void | Promise<void>;
      } else if (
        result &&
        typeof (result as { stop?: unknown }).stop === 'function'
      ) {
        cleanup = async () => {
          await (result as { stop: () => unknown }).stop();
        };
      } else if (typeof exported.stop === 'function') {
        cleanup = async () => {
          await exported.stop?.(context as PluginContext);
        };
      }

      this.runtimes.set(id, {
        signature,
        settings,
        exports: exported,
        context,
        cleanup,
        dispose,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[tvmod:${id}] plugin failed to start:`, error);
      if (dispose) {
        try {
          await Promise.resolve(dispose());
        } catch {
          // Ignore cleanup failures while reporting the start error.
        }
      }
      this.runtimes.set(id, { signature, settings, error: message });
    }
  }

  private async stop(id: string): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    this.runtimes.delete(id);

    if (runtime.cleanup) {
      try {
        await Promise.resolve(runtime.cleanup());
      } catch (error) {
        console.error(`[tvmod:${id}] plugin cleanup failed:`, error);
      }
    }

    if (runtime.dispose) {
      try {
        await Promise.resolve(runtime.dispose());
      } catch (error) {
        console.error(`[tvmod:${id}] plugin dispose failed:`, error);
      }
    }
  }

  private createContext(
    plugin: EmbeddedPlugin,
    settings: PluginSettings
  ): {
    context: PluginContext;
    dispose: () => Promise<void>;
  } {
    const manifest = plugin.manifest;
    const id = manifest.id;
    const permissions = new Set<PluginPermission>(manifest.permissions ?? []);
    const cleanups: Array<() => void | Promise<void>> = [];
    const disposals: Array<() => void> = [];

    const dispose = async (): Promise<void> => {
      for (const cleanup of cleanups.splice(0).reverse()) {
        try {
          await Promise.resolve(cleanup());
        } catch (error) {
          console.error(`[tvmod:${id}] registered cleanup failed:`, error);
        }
      }
      for (const off of disposals.splice(0).reverse()) {
        try {
          off();
        } catch (error) {
          console.error(`[tvmod:${id}] disposal failed:`, error);
        }
      }
    };

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
      onCleanup: (cleanup) => {
        if (typeof cleanup === 'function') cleanups.push(cleanup);
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
          const off = (): void => observer.disconnect();
          disposals.push(off);
          return off;
        },
      };
    }

    if (permissions.has('style')) {
      context.style = {
        add: (css) => {
          const key = this.host.insertCSS(css);
          let active = true;
          const remove = (): void => {
            if (!active) return;
            active = false;
            try {
              this.host.removeInsertedCSS(key);
            } catch {
              // Ignore.
            }
          };
          disposals.push(remove);
          return remove;
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

    if (permissions.has('events')) {
      let subscriptions = 0;

      const validate = (name: string, handler: unknown): void => {
        if (typeof name !== 'string' || !EVENT_NAME.test(name)) {
          throw new Error(`invalid event name: ${String(name)}`);
        }
        if (typeof handler !== 'function') {
          throw new Error('event handler must be a function');
        }
      };

      const on = (
        name: string,
        handler: (payload: unknown, from: string) => unknown
      ): (() => void) => {
        validate(name, handler);
        if (subscriptions >= MAX_EVENT_LISTENERS) {
          throw new Error(
            `too many event subscriptions (max ${MAX_EVENT_LISTENERS})`
          );
        }

        subscriptions += 1;
        const entry: EventListener = { pluginId: id, handler };
        const listeners = this.eventListeners.get(name) ?? new Set();
        listeners.add(entry);
        this.eventListeners.set(name, listeners);

        let active = true;
        const off = (): void => {
          if (!active) return;
          active = false;
          subscriptions -= 1;
          listeners.delete(entry);
          if (listeners.size === 0) this.eventListeners.delete(name);
        };
        disposals.push(off);
        return off;
      };

      context.events = {
        on,
        once: (name, handler) => {
          validate(name, handler);
          const off = on(name, (payload, from) => {
            off();
            return handler(payload, from);
          });
          return off;
        },
        emit: (name, payload) => {
          if (typeof name !== 'string' || !EVENT_NAME.test(name)) {
            throw new Error(`invalid event name: ${String(name)}`);
          }
          const listeners = this.eventListeners.get(name);
          if (!listeners) return;

          for (const listener of [...listeners]) {
            try {
              const result = listener.handler(payload, id);
              if (
                result &&
                typeof (result as PromiseLike<unknown>).then === 'function'
              ) {
                Promise.resolve(result).catch((error) => {
                  console.error(
                    `[tvmod:${listener.pluginId}] event ${name} handler failed:`,
                    error
                  );
                });
              }
            } catch (error) {
              console.error(
                `[tvmod:${listener.pluginId}] event ${name} handler failed:`,
                error
              );
            }
          }
        },
      };
    }

    return { context, dispose };
  }
}
