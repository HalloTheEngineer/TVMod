import {
  isPluginPermission,
  type EmbeddedPlugin,
  type ExternalPluginManifest,
  type PanelPlugin,
  type PluginSettingDefinition,
} from './plugin-types.js';
import { isBuiltinPluginId } from './plugins.js';

const MAX_SOURCE_BYTES = 512 * 1024;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

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
    for (const entry of value.settings) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      if (
        typeof item.key !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.default !== 'boolean'
      ) {
        continue;
      }
      settings.push({
        key: item.key,
        name: item.name,
        description:
          typeof item.description === 'string' ? item.description : undefined,
        default: item.default,
      });
    }
  }

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
    version: manifest.version,
    author: manifest.author,
    permissions: manifest.permissions,
    settings: manifest.settings,
  };
}
