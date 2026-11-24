import type {
  PanelPlugin,
  PluginSettingDefinition,
  PluginSettingValue,
  PluginSettings,
} from './plugin-types.js';
import { PLUGINS } from './plugins.js';

export interface PluginState {
  enabled: boolean;
  settings?: PluginSettings;
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

export function sanitizeSettingValue(
  definition: PluginSettingDefinition,
  value: unknown
): PluginSettingValue {
  switch (definition.type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : definition.default;
    case 'string':
      return typeof value === 'string'
        ? value.slice(0, 200)
        : definition.default;
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return definition.default;
      }
      let next = value;
      if (definition.min !== undefined && next < definition.min) {
        next = definition.min;
      }
      if (definition.max !== undefined && next > definition.max) {
        next = definition.max;
      }
      return next;
    }
    case 'select':
      return typeof value === 'string' &&
        definition.options.some((option) => option.value === value)
        ? value
        : definition.default;
  }
}

function defaultsFor(
  settings: PluginSettingDefinition[] | undefined
): PluginSettings | undefined {
  if (!settings || settings.length === 0) return undefined;
  return Object.fromEntries(
    settings.map((setting) => [setting.key, setting.default])
  );
}

function sanitizeSettings(
  settings: PluginSettingDefinition[] | undefined,
  values: Record<string, unknown>
): PluginSettings | undefined {
  if (!settings || settings.length === 0) return undefined;
  return Object.fromEntries(
    settings.map((setting) => [
      setting.key,
      sanitizeSettingValue(
        setting,
        setting.key in values ? values[setting.key] : setting.default
      ),
    ])
  );
}

function makeState(plugin: PanelPlugin): PluginState {
  const state: PluginState = { enabled: plugin.defaultEnabled };
  const settings = defaultsFor(plugin.settings);
  if (settings) state.settings = settings;
  return state;
}

export function defaultConfig(defs: PanelPlugin[] = PLUGINS): TvmodConfig {
  return {
    version: 2,
    plugins: Object.fromEntries(defs.map((plugin) => [plugin.id, makeState(plugin)])),
  };
}

export function normalizeConfig(
  input: unknown,
  defs: PanelPlugin[] = PLUGINS
): TvmodConfig {
  const config = defaultConfig(defs);
  if (!input || typeof input !== 'object') return config;

  const raw = input as { plugins?: unknown };
  if (!raw.plugins || typeof raw.plugins !== 'object') return config;

  const definitions = new Map(
    defs.map((plugin) => [plugin.id, plugin.settings])
  );
  const plugins = raw.plugins as Record<string, unknown>;
  for (const [id, entry] of Object.entries(plugins)) {
    if (!entry || typeof entry !== 'object') continue;
    const value = entry as { enabled?: unknown; settings?: unknown };
    if (typeof value.enabled !== 'boolean') continue;

    const state: PluginState = { enabled: value.enabled };
    if (value.settings && typeof value.settings === 'object') {
      const rawSettings = value.settings as Record<string, unknown>;
      if (definitions.has(id)) {
        const settings = sanitizeSettings(
          definitions.get(id),
          rawSettings
        );
        if (settings) state.settings = settings;
      } else {
        const settings: PluginSettings = {};
        for (const [key, setting] of Object.entries(rawSettings)) {
          if (
            typeof setting === 'boolean' ||
            typeof setting === 'number' ||
            typeof setting === 'string'
          ) {
            settings[key] = setting;
          }
        }
        if (Object.keys(settings).length > 0) state.settings = settings;
      }
    }
    config.plugins[id] = state;
  }

  for (const plugin of defs) {
    const state = config.plugins[plugin.id] ?? makeState(plugin);
    const defaults = defaultsFor(plugin.settings);
    if (defaults) {
      state.settings = sanitizeSettings(plugin.settings, state.settings ?? {})
        ?? defaults;
    } else {
      delete state.settings;
    }
    config.plugins[plugin.id] = state;
  }

  return config;
}

export function migrateLegacySettings(
  input: unknown,
  defs: PanelPlugin[] = PLUGINS
): TvmodConfig {
  const config = defaultConfig(defs);
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

export function loadConfig(
  storage?: StorageLike | null,
  defs: PanelPlugin[] = PLUGINS
): TvmodConfig {
  try {
    const store = storage ?? getStorage();
    if (!store) return defaultConfig(defs);

    const raw = store.getItem(CONFIG_KEY);
    if (raw) return normalizeConfig(JSON.parse(raw), defs);

    const legacy = store.getItem(LEGACY_SETTINGS_KEY);
    if (legacy) {
      const migrated = migrateLegacySettings(JSON.parse(legacy), defs);
      try {
        store.setItem(CONFIG_KEY, JSON.stringify(migrated));
      } catch {
        // Storage may be unavailable; the migrated value is still returned.
      }
      return migrated;
    }

    return defaultConfig(defs);
  } catch {
    return defaultConfig(defs);
  }
}

export function saveConfig(
  config: TvmodConfig,
  storage?: StorageLike | null
): boolean {
  try {
    const store = storage ?? getStorage();
    if (!store) return false;
    store.setItem(CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
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
  const current = config.plugins[id];
  return {
    version: 2,
    plugins: {
      ...config.plugins,
      [id]: { ...(current ?? {}), enabled },
    },
  };
}

export function withPluginSetting(
  config: TvmodConfig,
  id: string,
  key: string,
  value: PluginSettingValue
): TvmodConfig {
  const current = config.plugins[id];
  return {
    version: 2,
    plugins: {
      ...config.plugins,
      [id]: {
        ...(current ?? { enabled: false }),
        settings: { ...(current?.settings ?? {}), [key]: value },
      },
    },
  };
}

export function getPluginSettings(
  config: TvmodConfig,
  plugin: PanelPlugin
): PluginSettings {
  const defaults = defaultsFor(plugin.settings) ?? {};
  const stored = config.plugins[plugin.id]?.settings ?? {};
  if (!plugin.settings) return { ...stored };
  return sanitizeSettings(plugin.settings, { ...defaults, ...stored }) ?? {};
}
