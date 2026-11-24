import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_PERMISSIONS,
  type ExternalPluginManifest,
} from '../core/plugin-types.js';
import {
  installPluginDirectory,
  isPluginId,
  readInstalledPlugins,
  readPluginDirectory,
  removePluginDirectory,
  writeInstalledPreload,
} from '../lib/plugin-files.js';
import { requestPageReload } from '../lib/control.js';
import {
  clearRegistryInstall,
  getRegistryInstall,
} from '../lib/plugin-provenance.js';
import { UserError } from '../lib/errors.js';
import {
  displayPath,
  examplesDir,
  pluginsDir,
  preloadTargetForFlavor,
} from '../lib/paths.js';
import { readState } from '../lib/state.js';
import { heading, info, label, ok, warn } from '../lib/logger.js';

export interface PluginAddOptions {
  force?: boolean;
}

export function warnIfPatched(): void {
  const state = readState();
  if (state?.patch) {
    warn(
      'this install is patched: run "tvmod repair --yes" to embed the updated preload into app.asar'
    );
  }
}

export function refreshInstalledPreload(): void {
  const state = readState();
  const target =
    state?.preloadPath ??
    preloadTargetForFlavor(state?.app.flavor ?? 'custom');
  const result = writeInstalledPreload(target);
  for (const error of result.errors) {
    warn(`plugin ${error.id}: ${error.message}`);
  }
  label('external plugins', String(result.count));
  label('preload', displayPath(result.path));
}

export async function reloadRunningApp(): Promise<boolean> {
  if (readState()?.patch) {
    warn(
      'this install is patched: hot reload is unavailable; run "tvmod repair --yes" after plugin changes'
    );
    return false;
  }

  if (await requestPageReload()) {
    ok('TradingView reloaded with the updated plugin set.');
    return true;
  }

  warn(
    'TradingView is not running or its hot-reload endpoint is unavailable; reload the page manually.'
  );
  return false;
}

export async function pluginAddCommand(
  sourceDir: string | undefined,
  options: PluginAddOptions
): Promise<void> {
  if (!sourceDir) {
    throw new UserError('usage: tvmod plugin add <plugin-directory> [--force]');
  }
  if (!readState()) {
    throw new UserError('TVMod is not installed. Run "tvmod install" first.');
  }

  const manifest = installPluginDirectory(sourceDir, {
    force: options.force,
  });
  clearRegistryInstall(manifest.id);

  heading(`Installed plugin: ${manifest.name}`);
  label('id', manifest.id);
  label('version', manifest.version);
  label('author', manifest.author ?? 'unknown');
  label('permissions', (manifest.permissions ?? []).join(', ') || 'none');
  label('settings', String(manifest.settings?.length ?? 0));
  label('path', displayPath(`${pluginsDir}/${manifest.id}`));

  refreshInstalledPreload();
  warnIfPatched();
  await reloadRunningApp();
}

export function pluginListCommand(): void {
  const scan = readInstalledPlugins();

  heading('External plugins');
  label('directory', displayPath(pluginsDir));

  if (scan.plugins.length === 0) {
    info('  no external plugins installed');
  }

  for (const plugin of scan.plugins) {
    const manifest: ExternalPluginManifest = plugin.manifest;
    info(
      `  ${manifest.id}  v${manifest.version}  ${manifest.name}${
        manifest.defaultEnabled ? '  [default on]' : ''
      }`
    );
    if (manifest.author) info(`      author: ${manifest.author}`);
    if (manifest.permissions?.length) {
      info(`      permissions: ${manifest.permissions.join(', ')}`);
    }
    if (manifest.settings?.length) {
      info(`      settings: ${manifest.settings.map((s) => s.key).join(', ')}`);
    }
    const record = getRegistryInstall(manifest.id);
    if (record) {
      info(`      source: registry ${record.registry} (v${record.version})`);
    }
  }

  for (const error of scan.errors) {
    warn(`${error.id}: ${error.message}`);
  }

  info('');
  info(`allowed permissions: ${ALLOWED_PERMISSIONS.join(', ')}`);
}

export async function pluginRemoveCommand(
  id: string | undefined,
  options: { yes?: boolean }
): Promise<void> {
  if (!id) throw new UserError('usage: tvmod plugin remove <id> --yes');
  if (!options.yes) {
    throw new UserError('removing a plugin requires --yes');
  }

  removePluginDirectory(id);
  clearRegistryInstall(id);
  ok(`removed plugin ${id}`);
  refreshInstalledPreload();
  warnIfPatched();
  await reloadRunningApp();
}

export async function pluginRefreshCommand(): Promise<void> {
  if (!readState()) {
    throw new UserError('TVMod is not installed. Run "tvmod install" first.');
  }
  heading('Refreshing embedded plugins');
  refreshInstalledPreload();
  warnIfPatched();
  await reloadRunningApp();
}

export function pluginPathCommand(): void {
  info(pluginsDir);
}

export function pluginExamplesCommand(): void {
  const root = examplesDir();
  if (!root) {
    throw new UserError(
      'bundled examples were not found. Use a release archive or a source checkout.'
    );
  }

  heading('Bundled example plugins');
  label('directory', displayPath(root));

  let found = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const plugin = readPluginDirectory(path.join(root, entry.name));
      found += 1;
      info(
        `  ${plugin.manifest.id}  v${plugin.manifest.version}  ${plugin.manifest.name}`
      );
      if (plugin.manifest.description) {
        info(`      ${plugin.manifest.description}`);
      }
    } catch (error) {
      warn(
        `${entry.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (found === 0) {
    info('  no valid examples found');
    return;
  }

  info('');
  info('Install one with: tvmod plugin add-example <id>');
}

export async function pluginAddExampleCommand(
  id: string | undefined,
  options: PluginAddOptions
): Promise<void> {
  if (!id) {
    throw new UserError('usage: tvmod plugin add-example <id> [--force]');
  }
  if (!isPluginId(id)) {
    throw new UserError(`invalid example id: ${id}`);
  }

  const root = examplesDir();
  if (!root) {
    throw new UserError(
      'bundled examples were not found. Use a release archive or a source checkout.'
    );
  }

  const source = path.join(root, id);
  const resolvedRoot = `${path.resolve(root)}${path.sep}`;
  const resolvedSource = path.resolve(source);
  if (!resolvedSource.startsWith(resolvedRoot)) {
    throw new UserError(`invalid example id: ${id}`);
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedSource);
  } catch {
    throw new UserError(`unknown example: ${id} (run "tvmod plugin examples")`);
  }
  if (!stat.isDirectory()) {
    throw new UserError(`unknown example: ${id} (run "tvmod plugin examples")`);
  }

  await pluginAddCommand(resolvedSource, options);
}
