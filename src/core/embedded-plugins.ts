import {
  isPluginCategory,
  isPluginPermission,
  type EmbeddedPlugin,
  type ExternalPluginManifest,
  type PanelPlugin,
  type PluginSettingDefinition,
} from './plugin-types.js';
import { isBuiltinPluginId } from './plugins.js';

const MAX_SOURCE_BYTES = 512 * 1024;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

function normalizeSetting(value: unknown): PluginSettingDefinition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;

  const key = text(item.key, 1, 49);
  const name = text(item.name, 1, 100);
  if (!key || !name) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,48}$/.test(key)) return null;

  const description =
    item.description === undefined
      ? undefined
      : text(item.description, 0, 300) ?? undefined;
  const type =
    item.type === undefined && typeof item.default === 'boolean'
      ? 'boolean'
      : item.type;

  if (type === 'boolean') {
    if (typeof item.default !== 'boolean') return null;
    return { key, name, description, type: 'boolean', default: item.default };
  }

  if (type === 'string') {
    const defaultValue = text(item.default, 0, 200);
    if (defaultValue === null) return null;
    const placeholder =
      item.placeholder === undefined
        ? undefined
        : text(item.placeholder, 0, 100) ?? undefined;
    return {
      key,
      name,
      description,
      type: 'string',
      default: defaultValue,
      ...(placeholder ? { placeholder } : {}),
    };
  }

  if (type === 'number') {
    if (typeof item.default !== 'number' || !Number.isFinite(item.default)) {
      return null;
    }
    const min =
      typeof item.min === 'number' && Number.isFinite(item.min)
        ? item.min
        : undefined;
    const max =
      typeof item.max === 'number' && Number.isFinite(item.max)
        ? item.max
        : undefined;
    const step =
      typeof item.step === 'number' &&
      Number.isFinite(item.step) &&
      item.step > 0
        ? item.step
        : undefined;
    if (min !== undefined && max !== undefined && min > max) return null;
    if (min !== undefined && item.default < min) return null;
    if (max !== undefined && item.default > max) return null;
    return {
      key,
      name,
      description,
      type: 'number',
      default: item.default,
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(step !== undefined ? { step } : {}),
    };
  }

  if (type === 'select') {
    if (!Array.isArray(item.options) || item.options.length === 0) return null;
    const options: Array<{ value: string; label: string }> = [];
    const seen = new Set<string>();
    for (const raw of item.options.slice(0, 32)) {
      if (!raw || typeof raw !== 'object') return null;
      const entry = raw as Record<string, unknown>;
      const optionValue = text(entry.value, 1, 100);
      const label = text(entry.label ?? entry.value, 1, 100);
      if (!optionValue || !label || seen.has(optionValue)) return null;
      seen.add(optionValue);
      options.push({ value: optionValue, label });
    }
    const defaultValue = text(item.default, 1, 100);
    if (!defaultValue || !seen.has(defaultValue)) return null;
    return {
      key,
      name,
      description,
      type: 'select',
      default: defaultValue,
      options,
    };
  }

  return null;
}

function normalizeManifest(raw: unknown): ExternalPluginManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) return null;
  if (isBuiltinPluginId(value.id)) return null;
  if (typeof value.name !== 'string' || !value.name.trim()) return null;
  if (typeof value.description !== 'string') return null;
  if (typeof value.version !== 'string') return null;
  if (typeof value.main !== 'string' || !value.main.endsWith('.js')) return null;

  const permissions = Array.isArray(value.permissions)
    ? value.permissions.filter(
        (permission): permission is NonNullable<ExternalPluginManifest['permissions']>[number] =>
          typeof permission === 'string' && isPluginPermission(permission)
      )
    : undefined;

  const settings: PluginSettingDefinition[] = [];
  if (Array.isArray(value.settings)) {
    for (const entry of value.settings.slice(0, 32)) {
      const setting = normalizeSetting(entry);
      if (setting) settings.push(setting);
    }
  }

  const category =
    typeof value.category === 'string' && isPluginCategory(value.category)
      ? value.category
      : 'other';

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    version: value.version,
    author: typeof value.author === 'string' ? value.author : undefined,
    main: value.main,
    defaultEnabled: value.defaultEnabled === true,
    permissions: permissions && permissions.length > 0 ? permissions : undefined,
    settings: settings.length > 0 ? settings : undefined,
    category,
  };
}

export function readEmbeddedPlugins(): EmbeddedPlugin[] {
  const raw = (globalThis as { __TVMOD_EXTERNAL_PLUGINS__?: unknown })
    .__TVMOD_EXTERNAL_PLUGINS__;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const plugins: EmbeddedPlugin[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const value = entry as { manifest?: unknown; source?: unknown };
    const manifest = normalizeManifest(value.manifest);
    if (!manifest || seen.has(manifest.id)) continue;
    if (typeof value.source !== 'string' || !value.source.trim()) continue;
    if (value.source.length > MAX_SOURCE_BYTES) continue;

    seen.add(manifest.id);
    plugins.push({ manifest, source: value.source });
  }

  return plugins;
}

export function toPanelPlugin(manifest: ExternalPluginManifest): PanelPlugin {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    defaultEnabled: manifest.defaultEnabled === true,
    external: true,
    category: manifest.category ?? 'other',
    version: manifest.version,
    author: manifest.author,
    permissions: manifest.permissions,
    settings: manifest.settings,
  };
}
