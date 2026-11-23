import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, registriesFile } from './paths.js';
import {
  verifyRegistryIndex,
  type RegistryPluginEntry,
  type SignedRegistryIndex,
} from './plugin-signing.js';

export interface RegistryRecord {
  name: string;
  url: string;
  publicKey: string;
  addedAt: string;
}

export interface RegistryConfig {
  schema: 1;
  registries: RegistryRecord[];
}

const MAX_INDEX_BYTES = 1024 * 1024;
const MAX_BUNDLE_BYTES = 1024 * 1024;
const REGISTRY_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function isValidRegistryName(name: string): boolean {
  return REGISTRY_NAME.test(name);
}

function emptyConfig(): RegistryConfig {
  return { schema: 1, registries: [] };
}

export function loadRegistries(): RegistryConfig {
  try {
    const raw = fs.readFileSync(registriesFile, 'utf8');
    const parsed = JSON.parse(raw) as RegistryConfig;
    if (
      parsed.schema !== 1 ||
      !Array.isArray(parsed.registries) ||
      !parsed.registries.every(
        (record) =>
          typeof record.name === 'string' &&
          typeof record.url === 'string' &&
          typeof record.publicKey === 'string'
      )
    ) {
      return emptyConfig();
    }
    return parsed;
  } catch {
    return emptyConfig();
  }
}

export function saveRegistries(config: RegistryConfig): void {
  ensureDir(path.dirname(registriesFile));
  const temp = `${registriesFile}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o644,
  });
  fs.renameSync(temp, registriesFile);
}

export function addRegistry(
  record: RegistryRecord,
  options: { force?: boolean } = {}
): void {
  if (!isValidRegistryName(record.name)) {
    throw new Error('registry name must be 1-64 letters, digits, dots, dashes, or underscores');
  }
  assertAllowedUrl(record.url);

  const config = loadRegistries();
  const existing = config.registries.find((item) => item.name === record.name);
  if (existing && !options.force) {
    throw new Error(`registry ${record.name} already exists (pass --force to replace it)`);
  }

  config.registries = config.registries.filter(
    (item) => item.name !== record.name
  );
  config.registries.push(record);
  saveRegistries(config);
}

export function removeRegistry(name: string): void {
  const config = loadRegistries();
  const before = config.registries.length;
  config.registries = config.registries.filter((item) => item.name !== name);
  if (config.registries.length === before) {
    throw new Error(`registry ${name} is not configured`);
  }
  saveRegistries(config);
}

export function getRegistry(name: string): RegistryRecord | undefined {
  return loadRegistries().registries.find((item) => item.name === name);
}

export function assertAllowedUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid URL: ${value}`);
  }

  if (url.protocol === 'https:') return;
  if (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1')
  ) {
    return;
  }

  throw new Error('registry and plugin URLs must use HTTPS (HTTP is allowed only for localhost)');
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
  assertAllowedUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    assertAllowedUrl(response.url);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error(`response is larger than ${maxBytes} bytes: ${url}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRegistryIndex(
  url: string,
  publicKey: string
): Promise<SignedRegistryIndex> {
  const text = await fetchText(url, MAX_INDEX_BYTES);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`registry index is not valid JSON: ${url}`);
  }

  const index = verifyRegistryIndex(raw, publicKey);
  if (!index) {
    throw new Error(`registry signature verification failed: ${url}`);
  }
  return index;
}

export function resolvePluginUrl(indexUrl: string, entry: RegistryPluginEntry): string {
  const resolved = new URL(entry.bundle, indexUrl).toString();
  assertAllowedUrl(resolved);
  return resolved;
}

export async function fetchPluginBundleText(url: string): Promise<string> {
  return fetchText(url, MAX_BUNDLE_BYTES);
}
