import { PLUGINS } from './plugins.js';

export interface PluginState {
  enabled: boolean;
}

export interface TvmodConfig {
  version: 2;
  plugins: Record<string, PluginState>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CONFIG_KEY = 'tvmod.config.v2';
export const LEGACY_SETTINGS_KEY = 'tvmod.settings.v1';

export function defaultConfig(): TvmodConfig {
  return {
    version: 2,
    plugins: Object.fromEntries(
      PLUGINS.map((plugin) => [plugin.id, { enabled: plugin.defaultEnabled }])
    ),
  };
}

export function normalizeConfig(input: unknown): TvmodConfig {
  const config = defaultConfig();
  if (!input || typeof input !== 'object') return config;

  const raw = input as { plugins?: unknown };
  if (!raw.plugins || typeof raw.plugins !== 'object') return config;

  const plugins = raw.plugins as Record<string, unknown>;
  for (const plugin of PLUGINS) {
    const entry = plugins[plugin.id];
    if (!entry || typeof entry !== 'object') continue;
    const enabled = (entry as { enabled?: unknown }).enabled;
    if (typeof enabled === 'boolean') {
      config.plugins[plugin.id] = { enabled };
    }
  }

  return config;
}

export function migrateLegacySettings(input: unknown): TvmodConfig {
  const config = defaultConfig();
  if (!input || typeof input !== 'object') return config;

  const legacy = input as {
    noPromos?: unknown;
    cleanUi?: unknown;
    hideSidebar?: unknown;
  };

  if (typeof legacy.noPromos === 'boolean') {
    config.plugins.adblock = { enabled: legacy.noPromos };
  }
  if (typeof legacy.cleanUi === 'boolean') {
    config.plugins['hide-ai-copilot'] = { enabled: legacy.cleanUi };
    config.plugins['hide-community-hub'] = { enabled: legacy.cleanUi };
  }
  if (typeof legacy.hideSidebar === 'boolean') {
    config.plugins['hide-sidebar'] = { enabled: legacy.hideSidebar };
  }

  return config;
}

function getStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadConfig(storage?: StorageLike | null): TvmodConfig {
  try {
    const store = storage ?? getStorage();
    if (!store) return defaultConfig();

    const raw = store.getItem(CONFIG_KEY);
    if (raw) return normalizeConfig(JSON.parse(raw));

    const legacy = store.getItem(LEGACY_SETTINGS_KEY);
    if (legacy) {
      const migrated = migrateLegacySettings(JSON.parse(legacy));
      saveConfigTo(store, migrated);
      return migrated;
    }

    return defaultConfig();
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(
  config: TvmodConfig,
  storage?: StorageLike | null
): boolean {
  try {
    const store = storage ?? getStorage();
    if (!store) return false;
    store.setItem(CONFIG_KEY, JSON.stringify(normalizeConfig(config)));
    return true;
  } catch {
    return false;
  }
}

function saveConfigTo(store: StorageLike, config: TvmodConfig): void {
  try {
    store.setItem(CONFIG_KEY, JSON.stringify(normalizeConfig(config)));
  } catch {
    // Storage may be unavailable; the migrated value is still returned.
  }
}

export function isPluginEnabled(config: TvmodConfig, id: string): boolean {
  return config.plugins[id]?.enabled === true;
}

export function withPluginEnabled(
  config: TvmodConfig,
  id: string,
  enabled: boolean
): TvmodConfig {
  return normalizeConfig({
    version: 2,
    plugins: {
      ...config.plugins,
      [id]: { enabled },
    },
  });
}
