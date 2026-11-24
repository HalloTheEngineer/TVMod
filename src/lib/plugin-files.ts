import fs from 'node:fs';
import path from 'node:path';
import { isBuiltinPluginId } from '../core/plugins.js';
import {
  ALLOWED_PERMISSIONS,
  isPluginCategory,
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

const SETTING_VALUE_MAX = 200;

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function parseSetting(
  raw: Record<string, unknown>,
  seen: Set<string>
): PluginSettingDefinition {
  const key = readString(raw.key, 'setting.key', 1, 49);
  if (!SETTING_KEY_PATTERN.test(key)) {
    throw new Error(`invalid setting key: ${key}`);
  }
  if (seen.has(key)) throw new Error(`duplicate setting key: ${key}`);
  seen.add(key);

  const name = readString(raw.name, `setting.${key}.name`, 1, 100);
  const description =
    raw.description === undefined
      ? undefined
      : readString(raw.description, `setting.${key}.description`, 0, 300);

  const inferred =
    raw.type === undefined && typeof raw.default === 'boolean'
      ? 'boolean'
      : raw.type;

  switch (inferred) {
    case 'boolean': {
      if (typeof raw.default !== 'boolean') {
        throw new Error(`setting.${key}.default must be a boolean`);
      }
      return { key, name, description, type: 'boolean', default: raw.default };
    }
    case 'string': {
      const defaultValue = readString(
        raw.default,
        `setting.${key}.default`,
        0,
        SETTING_VALUE_MAX
      );
      const placeholder =
        raw.placeholder === undefined
          ? undefined
          : readString(
              raw.placeholder,
              `setting.${key}.placeholder`,
              0,
              100
            );
      return {
        key,
        name,
        description,
        type: 'string',
        default: defaultValue,
        ...(placeholder ? { placeholder } : {}),
      };
    }
    case 'number': {
      if (typeof raw.default !== 'number' || !Number.isFinite(raw.default)) {
        throw new Error(`setting.${key}.default must be a finite number`);
      }
      const min = optionalNumber(raw.min, `setting.${key}.min`);
      const max = optionalNumber(raw.max, `setting.${key}.max`);
      const step = optionalNumber(raw.step, `setting.${key}.step`);
      if (min !== undefined && max !== undefined && min > max) {
        throw new Error(`setting.${key}.min must not exceed max`);
      }
      if (step !== undefined && step <= 0) {
        throw new Error(`setting.${key}.step must be positive`);
      }
      if (min !== undefined && raw.default < min) {
        throw new Error(`setting.${key}.default is below min`);
      }
      if (max !== undefined && raw.default > max) {
        throw new Error(`setting.${key}.default is above max`);
      }
      return {
        key,
        name,
        description,
        type: 'number',
        default: raw.default,
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
        ...(step !== undefined ? { step } : {}),
      };
    }
    case 'select': {
      if (!Array.isArray(raw.options) || raw.options.length === 0) {
        throw new Error(`setting.${key}.options must be a non-empty array`);
      }
      if (raw.options.length > 32) {
        throw new Error(`setting.${key} has too many options`);
      }

      const options: Array<{ value: string; label: string }> = [];
      const values = new Set<string>();
      for (const entry of raw.options) {
        const option = assertObject(entry, `setting.${key}.option`);
        const optionValue = readString(
          option.value,
          `setting.${key}.option.value`,
          1,
          100
        );
        if (values.has(optionValue)) {
          throw new Error(`setting.${key} has duplicate option ${optionValue}`);
        }
        values.add(optionValue);
        options.push({
          value: optionValue,
          label: readString(
            option.label ?? optionValue,
            `setting.${key}.option.label`,
            1,
            100
          ),
        });
      }

      const defaultValue = readString(
        raw.default,
        `setting.${key}.default`,
        1,
        100
      );
      if (!values.has(defaultValue)) {
        throw new Error(
          `setting.${key}.default must match one of its options`
        );
      }

      return {
        key,
        name,
        description,
        type: 'select',
        default: defaultValue,
        options,
      };
    }
    default:
      throw new Error(
        `setting.${key}.type must be boolean, string, number, or select`
      );
  }
}

function parseSettings(value: unknown): PluginSettingDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('settings must be an array');
  if (value.length > 32) throw new Error('too many plugin settings');

  const seen = new Set<string>();
  const settings: PluginSettingDefinition[] = [];

  for (const entry of value) {
    settings.push(parseSetting(assertObject(entry, 'setting'), seen));
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

  if (value.category !== undefined) {
    if (
      typeof value.category !== 'string' ||
      !isPluginCategory(value.category)
    ) {
      throw new Error('category must be ads, interface, accessibility, tools, or other');
    }
    manifest.category = value.category;
  } else {
    manifest.category = 'other';
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
