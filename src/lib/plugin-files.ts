import fs from 'node:fs';
import path from 'node:path';
import { isBuiltinPluginId } from '../core/plugins.js';
import {
  ALLOWED_PERMISSIONS,
  isPluginPermission,
  type EmbeddedPlugin,
  type ExternalPluginManifest,
  type PluginSettingDefinition,
} from '../core/plugin-types.js';
import {
  ensureDir,
  pluginsDir,
  preloadSourcePath,
  preloadTarget,
} from './paths.js';

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 512 * 1024;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SETTING_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,48}$/;

export interface PluginScan {
  plugins: EmbeddedPlugin[];
  errors: Array<{ id: string; message: string }>;
}

export function isPluginId(value: string): boolean {
  return ID_PATTERN.test(value);
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readString(
  value: unknown,
  label: string,
  min: number,
  max: number
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new Error(`${label} must be ${min}-${max} characters`);
  }
  return trimmed;
}

function parseSettings(value: unknown): PluginSettingDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('settings must be an array');
  if (value.length > 32) throw new Error('too many plugin settings');

  const seen = new Set<string>();
  const settings: PluginSettingDefinition[] = [];

  for (const entry of value) {
    const raw = assertObject(entry, 'setting');
    const key = readString(raw.key, 'setting.key', 1, 49);
    if (!SETTING_KEY_PATTERN.test(key)) {
      throw new Error(`invalid setting key: ${key}`);
    }
    if (seen.has(key)) throw new Error(`duplicate setting key: ${key}`);
    seen.add(key);

    if (typeof raw.default !== 'boolean') {
      throw new Error(`setting.${key}.default must be a boolean`);
    }

    settings.push({
      key,
      name: readString(raw.name, `setting.${key}.name`, 1, 100),
      description:
        raw.description === undefined
          ? undefined
          : readString(raw.description, `setting.${key}.description`, 0, 300),
      default: raw.default,
    });
  }

  return settings.length > 0 ? settings : undefined;
}

function parsePermissions(value: unknown): ExternalPluginManifest['permissions'] {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('permissions must be an array');

  const permissions: NonNullable<ExternalPluginManifest['permissions']> = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !isPluginPermission(entry)) {
      throw new Error(
        `unsupported permission: ${String(entry)} (allowed: ${ALLOWED_PERMISSIONS.join(', ')})`
      );
    }
    if (!permissions.includes(entry)) permissions.push(entry);
  }

  return permissions.length > 0 ? permissions : undefined;
}

export function validateManifest(raw: unknown): ExternalPluginManifest {
  const value = assertObject(raw, 'manifest');
  const id = readString(value.id, 'id', 2, 64);

  if (!ID_PATTERN.test(id)) throw new Error(`invalid plugin id: ${id}`);
  if (isBuiltinPluginId(id)) throw new Error(`plugin id ${id} is reserved`);

  const main = readString(value.main ?? 'index.js', 'main', 3, 128);
  if (path.basename(main) !== main || !main.endsWith('.js')) {
    throw new Error('main must be a single .js filename inside the plugin directory');
  }

  const manifest: ExternalPluginManifest = {
    id,
    name: readString(value.name, 'name', 1, 100),
    description: readString(value.description ?? '', 'description', 0, 500),
    version: readString(value.version ?? '0.0.0', 'version', 1, 32),
    main,
    defaultEnabled: value.defaultEnabled === true,
    permissions: parsePermissions(value.permissions),
    settings: parseSettings(value.settings),
  };

  if (value.author !== undefined) {
    manifest.author = readString(value.author, 'author', 0, 100);
  }
  if (value.defaultEnabled !== undefined && typeof value.defaultEnabled !== 'boolean') {
    throw new Error('defaultEnabled must be a boolean');
  }

  return manifest;
}

export function readPluginDirectory(dir: string): EmbeddedPlugin {
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('plugin path must be a real directory, not a symlink');
  }

  const manifestPath = path.join(dir, 'manifest.json');
  const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error('manifest.json must be a regular file');
  }
  if (manifestStat.size > MAX_MANIFEST_BYTES) {
    throw new Error('manifest.json is too large');
  }

  const manifest = validateManifest(
    JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  );

  const sourcePath = path.join(dir, manifest.main);
  const sourceStat = fs.lstatSync(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`${manifest.main} must be a regular file`);
  }
  if (sourceStat.size > MAX_SOURCE_BYTES) {
    throw new Error(`${manifest.main} is larger than 512 KiB`);
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  if (!source.trim()) throw new Error(`${manifest.main} is empty`);

  return { manifest, source };
}

export function readInstalledPlugins(): PluginScan {
  const result: PluginScan = { plugins: [], errors: [] };

  if (!fs.existsSync(pluginsDir)) return result;

  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(pluginsDir, entry.name);

    try {
      result.plugins.push(readPluginDirectory(dir));
    } catch (error) {
      result.errors.push({
        id: entry.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  result.plugins.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  return result;
}

export function composePreload(
  baseSource: string,
  plugins: EmbeddedPlugin[]
): string {
  if (plugins.length === 0) return baseSource;

  const serialized = JSON.stringify(plugins)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return `globalThis.__TVMOD_EXTERNAL_PLUGINS__ = ${serialized};\n${baseSource}`;
}

export function writeInstalledPreload(
  target = preloadTarget
): {
  count: number;
  errors: PluginScan['errors'];
  path: string;
} {
  const base = fs.readFileSync(preloadSourcePath(), 'utf8');
  const scan = readInstalledPlugins();
  const composed = composePreload(base, scan.plugins);

  ensureDir(path.dirname(target));
  fs.writeFileSync(target, composed, { mode: 0o644 });

  return {
    count: scan.plugins.length,
    errors: scan.errors,
    path: target,
  };
}

export function installPluginDirectory(
  sourceDir: string,
  options: { force?: boolean } = {}
): ExternalPluginManifest {
  const plugin = readPluginDirectory(sourceDir);
  const destination = path.join(pluginsDir, plugin.manifest.id);

  if (fs.existsSync(destination)) {
    if (!options.force) {
      throw new Error(
        `plugin ${plugin.manifest.id} is already installed (pass --force to replace it)`
      );
    }
    fs.rmSync(destination, { recursive: true, force: true });
  }

  ensureDir(destination);
  fs.writeFileSync(
    path.join(destination, 'manifest.json'),
    `${JSON.stringify(plugin.manifest, null, 2)}\n`,
    { mode: 0o644 }
  );
  fs.writeFileSync(
    path.join(destination, plugin.manifest.main),
    plugin.source,
    { mode: 0o644 }
  );

  return plugin.manifest;
}

export function removePluginDirectory(id: string): void {
  if (!isPluginId(id)) throw new Error(`invalid plugin id: ${id}`);
  const target = path.join(pluginsDir, id);
  if (!fs.existsSync(target)) throw new Error(`plugin ${id} is not installed`);
  fs.rmSync(target, { recursive: true, force: true });
}
