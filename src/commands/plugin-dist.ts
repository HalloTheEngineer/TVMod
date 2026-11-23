import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  installPluginDirectory,
  readPluginDirectory,
} from '../lib/plugin-files.js';
import {
  createPluginBundle,
  generateKeyPairPem,
  sha256Hex,
  signRegistryIndex,
  validateRegistryEntry,
  verifyPluginBundle,
  type RegistryPluginEntry,
} from '../lib/plugin-signing.js';
import {
  addRegistry,
  fetchPluginBundleText,
  fetchRegistryIndex,
  getRegistry,
  loadRegistries,
  removeRegistry,
  resolvePluginUrl,
} from '../lib/registry.js';
import { UserError } from '../lib/errors.js';
import { displayPath, ensureDir } from '../lib/paths.js';
import { readState } from '../lib/state.js';
import { heading, info, label, ok, warn } from '../lib/logger.js';
import {
  refreshInstalledPreload,
  reloadRunningApp,
  warnIfPatched,
} from './plugin.js';

export interface PluginPackOptions {
  key?: string;
  out?: string;
  force?: boolean;
}

export function pluginKeygenCommand(
  outDir: string | undefined,
  options: { force?: boolean } = {}
): void {
  const dir = path.resolve(outDir ?? 'tvmod-plugin-keys');
  if (fs.existsSync(dir)) {
    if (!options.force) {
      throw new UserError(`${dir} already exists; choose another directory or pass --force`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  ensureDir(dir);
  const keys = generateKeyPairPem();
  const privatePath = path.join(dir, 'private-key.pem');
  const publicPath = path.join(dir, 'public-key.pem');

  fs.writeFileSync(privatePath, keys.privateKey, { mode: 0o600 });
  fs.chmodSync(privatePath, 0o600);
  fs.writeFileSync(publicPath, keys.publicKey, { mode: 0o644 });

  heading('Plugin signing keys generated');
  label('private key', displayPath(privatePath));
  label('public key', displayPath(publicPath));
  warn('Keep the private key offline; publish only the public key.');
}

export function pluginPackCommand(
  sourceDir: string | undefined,
  options: PluginPackOptions
): void {
  if (!sourceDir) {
    throw new UserError(
      'usage: tvmod plugin pack <plugin-directory> --key <private-key.pem> [--out <file>]'
    );
  }
  if (!options.key) {
    throw new UserError('--key <private-key.pem> is required');
  }

  const plugin = readPluginDirectory(sourceDir);
  const privateKey = fs.readFileSync(path.resolve(options.key), 'utf8');
  const bundle = createPluginBundle(
    plugin.manifest,
    plugin.source,
    privateKey
  );
  const outPath = path.resolve(
    options.out ?? `${plugin.manifest.id}-${plugin.manifest.version}.tvplug`
  );

  if (fs.existsSync(outPath) && !options.force) {
    throw new UserError(`${outPath} already exists; pass --force to replace it`);
  }

  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
  fs.writeFileSync(outPath, serialized, { mode: 0o644 });

  heading(`Packed plugin: ${plugin.manifest.name}`);
  label('id', plugin.manifest.id);
  label('version', plugin.manifest.version);
  label('bundle', displayPath(outPath));
  label('sha256', sha256Hex(serialized));
  info('Add this SHA-256 and the bundle filename to a registry index.');
}

export async function registryAddCommand(
  name: string | undefined,
  url: string | undefined,
  keyPath: string | undefined,
  options: { force?: boolean } = {}
): Promise<void> {
  if (!name || !url || !keyPath) {
    throw new UserError(
      'usage: tvmod plugin registry add <name> <index-url> --key <public-key.pem> [--force]'
    );
  }

  const publicKey = fs.readFileSync(path.resolve(keyPath), 'utf8');
  const index = await fetchRegistryIndex(url, publicKey);

  addRegistry(
    {
      name,
      url,
      publicKey,
      addedAt: new Date().toISOString(),
    },
    { force: options.force }
  );

  heading(`Registry added: ${name}`);
  label('url', url);
  label('plugins', String(index.plugins.length));
  ok('registry signature verified');
}

export function registryListCommand(): void {
  const config = loadRegistries();
  heading('Plugin registries');
  if (config.registries.length === 0) {
    info('  none configured');
    return;
  }
  for (const record of config.registries) {
    info(`  ${record.name}  ${record.url}`);
  }
}

export function registryRemoveCommand(
  name: string | undefined,
  options: { yes?: boolean }
): void {
  if (!name) throw new UserError('usage: tvmod plugin registry remove <name> --yes');
  if (!options.yes) throw new UserError('removing a registry requires --yes');
  removeRegistry(name);
  ok(`removed registry ${name}`);
}

export function registrySignCommand(
  indexPath: string | undefined,
  keyPath: string | undefined,
  options: { out?: string; force?: boolean } = {}
): void {
  if (!indexPath || !keyPath) {
    throw new UserError(
      'usage: tvmod plugin registry sign <index.json> --key <private-key.pem> [--out <file>]'
    );
  }

  const input = JSON.parse(fs.readFileSync(path.resolve(indexPath), 'utf8')) as {
    name?: unknown;
    plugins?: unknown;
  };

  if (typeof input.name !== 'string' || !Array.isArray(input.plugins)) {
    throw new UserError('index must contain a name and a plugins array');
  }

  const plugins: RegistryPluginEntry[] = [];
  for (const raw of input.plugins) {
    const entry = validateRegistryEntry(raw);
    if (!entry) {
      throw new UserError('index contains an invalid plugin entry');
    }
    plugins.push(entry);
  }

  const privateKey = fs.readFileSync(path.resolve(keyPath), 'utf8');
  const signed = signRegistryIndex({ name: input.name, plugins }, privateKey);
  const outPath = path.resolve(options.out ?? indexPath);

  if (fs.existsSync(outPath) && outPath !== path.resolve(indexPath) && !options.force) {
    throw new UserError(`${outPath} already exists; pass --force to replace it`);
  }

  fs.writeFileSync(outPath, `${JSON.stringify(signed, null, 2)}\n`, {
    mode: 0o644,
  });

  heading('Registry index signed');
  label('name', signed.name);
  label('plugins', String(signed.plugins.length));
  label('index', displayPath(outPath));
}

export async function pluginBrowseCommand(
  query: string | undefined,
  options: { registry?: string; json?: boolean } = {}
): Promise<void> {
  const config = loadRegistries();
  let records = config.registries;
  if (options.registry) {
    const record = getRegistry(options.registry);
    if (!record) throw new UserError(`registry ${options.registry} is not configured`);
    records = [record];
  }
  if (records.length === 0) {
    throw new UserError(
      'no registries configured; use "tvmod plugin registry add"'
    );
  }

  if (!options.json) heading('Registry plugins');
  let found = 0;
  let failures = 0;
  let firstError = '';
  const listed: Array<{
    id: string;
    name: string;
    description: string;
    version: string;
    author?: string;
    registry: string;
  }> = [];

  for (const record of records) {
    try {
      const index = await fetchRegistryIndex(record.url, record.publicKey);
      for (const entry of index.plugins) {
        const haystack = `${entry.id} ${entry.name} ${entry.description}`.toLowerCase();
        if (query && !haystack.includes(query.toLowerCase())) continue;
        found += 1;
        listed.push({
          id: entry.id,
          name: entry.name,
          description: entry.description,
          version: entry.version,
          author: entry.author,
          registry: record.name,
        });
        if (!options.json) {
          info(
            `  ${entry.id}  v${entry.version}  ${entry.name}  [${record.name}]`
          );
          if (entry.author) info(`      author: ${entry.author}`);
          if (entry.description) info(`      ${entry.description}`);
        }
      }
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (!firstError) firstError = `registry ${record.name}: ${message}`;
      warn(`registry ${record.name}: ${message}`);
    }
  }

  if (options.json) {
    if (found === 0 && failures === records.length) {
      throw new UserError(firstError || 'failed to load registries');
    }
    info(JSON.stringify(listed));
    return;
  }

  if (found === 0) info('  no matching plugins');
}

export async function pluginInstallCommand(
  id: string | undefined,
  options: { registry?: string; force?: boolean } = {}
): Promise<void> {
  if (!id) throw new UserError('usage: tvmod plugin install <id> [--registry <name>]');
  if (!readState()) {
    throw new UserError('TVMod is not installed. Run "tvmod install" first.');
  }

  const config = loadRegistries();
  let records = config.registries;
  if (options.registry) {
    const record = getRegistry(options.registry);
    if (!record) throw new UserError(`registry ${options.registry} is not configured`);
    records = [record];
  }

  const matches: Array<{
    record: (typeof records)[number];
    entry: RegistryPluginEntry;
  }> = [];

  for (const record of records) {
    try {
      const index = await fetchRegistryIndex(record.url, record.publicKey);
      const entry = index.plugins.find((plugin) => plugin.id === id);
      if (entry) matches.push({ record, entry });
    } catch (error) {
      warn(
        `registry ${record.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (matches.length === 0) {
    throw new UserError(`plugin ${id} was not found in any configured registry`);
  }
  if (matches.length > 1) {
    throw new UserError(
      `plugin ${id} exists in multiple registries (${matches
        .map((match) => match.record.name)
        .join(', ')}); pass --registry`
    );
  }

  const { record, entry } = matches[0]!;
  const bundleUrl = resolvePluginUrl(record.url, entry);
  const bundleText = await fetchPluginBundleText(bundleUrl);

  const actualHash = sha256Hex(Buffer.from(bundleText, 'utf8'));
  if (actualHash !== entry.sha256) {
    throw new UserError(
      `bundle checksum mismatch for ${entry.id}: expected ${entry.sha256}, got ${actualHash}`
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(bundleText);
  } catch {
    throw new UserError('plugin bundle is not valid JSON');
  }

  const bundle = verifyPluginBundle(raw, record.publicKey);
  if (!bundle) {
    throw new UserError('plugin bundle signature verification failed');
  }
  if (bundle.manifest.id !== entry.id) {
    throw new UserError(
      `bundle id ${bundle.manifest.id} does not match registry id ${entry.id}`
    );
  }
  if (bundle.manifest.version !== entry.version) {
    throw new UserError(
      `bundle version ${bundle.manifest.version} does not match registry version ${entry.version}`
    );
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tvmod-bundle-'));
  try {
    fs.writeFileSync(
      path.join(temp, 'manifest.json'),
      `${JSON.stringify(bundle.manifest, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(temp, bundle.manifest.main),
      bundle.source
    );
    installPluginDirectory(temp, { force: options.force });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  heading(`Installed plugin from ${record.name}: ${entry.name}`);
  label('id', entry.id);
  label('version', entry.version);
  label('registry', record.name);

  refreshInstalledPreload();
  warnIfPatched();
  await reloadRunningApp();
}
