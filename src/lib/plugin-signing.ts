import crypto from 'node:crypto';
import type { ExternalPluginManifest } from '../core/plugin-types.js';
import { isPluginId, validateManifest } from './plugin-files.js';

export interface SignedPluginBundle {
  schema: 1;
  manifest: ExternalPluginManifest;
  source: string;
  signature: string;
}

export interface RegistryPluginEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  bundle: string;
  sha256: string;
}

export interface SignedRegistryIndex {
  schema: 1;
  name: string;
  plugins: RegistryPluginEntry[];
  signature: string;
}

const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_INDEX_PLUGINS = 500;

export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (item === undefined ? 'null' : canonicalJson(item)))
      .join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function signPayload(payload: unknown, privateKeyPem: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return crypto
    .sign(null, Buffer.from(canonicalJson(payload), 'utf8'), key)
    .toString('base64');
}

export function verifyPayload(
  payload: unknown,
  signature: string,
  publicKeyPem: string
): boolean {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(
      null,
      Buffer.from(canonicalJson(payload), 'utf8'),
      key,
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

export function generateKeyPairPem(): {
  privateKey: string;
  publicKey: string;
} {
  const pair = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey: pair.privateKey, publicKey: pair.publicKey };
}

export function sha256Hex(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createPluginBundle(
  manifest: ExternalPluginManifest,
  source: string,
  privateKeyPem: string
): SignedPluginBundle {
  const payload = { schema: 1 as const, manifest, source };
  return {
    ...payload,
    signature: signPayload(payload, privateKeyPem),
  };
}

export function verifyPluginBundle(
  input: unknown,
  publicKeyPem: string
): { manifest: ExternalPluginManifest; source: string } | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as {
    schema?: unknown;
    manifest?: unknown;
    source?: unknown;
    signature?: unknown;
  };

  if (value.schema !== 1) return null;
  if (!value.manifest || typeof value.manifest !== 'object') return null;
  if (typeof value.source !== 'string' || !value.source.trim()) return null;
  if (value.source.length > MAX_SOURCE_BYTES) return null;
  if (typeof value.signature !== 'string') return null;

  const payload = {
    schema: 1 as const,
    manifest: value.manifest,
    source: value.source,
  };

  if (!verifyPayload(payload, value.signature, publicKeyPem)) return null;

  let manifest: ExternalPluginManifest;
  try {
    manifest = validateManifest(value.manifest);
  } catch {
    return null;
  }

  return { manifest, source: value.source };
}

export function signRegistryIndex(
  input: {
    name: string;
    plugins: RegistryPluginEntry[];
  },
  privateKeyPem: string
): SignedRegistryIndex {
  const payload = { schema: 1 as const, name: input.name, plugins: input.plugins };
  return {
    ...payload,
    signature: signPayload(payload, privateKeyPem),
  };
}

export function validateRegistryEntry(
  input: unknown
): RegistryPluginEntry | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;

  if (typeof value.id !== 'string' || !isPluginId(value.id)) return null;
  if (typeof value.name !== 'string' || !value.name.trim()) return null;
  if (typeof value.description !== 'string') return null;
  if (typeof value.version !== 'string' || !value.version.trim()) return null;
  if (typeof value.bundle !== 'string' || !value.bundle.trim()) return null;
  if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256)) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    version: value.version,
    author: typeof value.author === 'string' ? value.author : undefined,
    bundle: value.bundle,
    sha256: value.sha256.toLowerCase(),
  };
}

export function verifyRegistryIndex(
  input: unknown,
  publicKeyPem: string
): SignedRegistryIndex | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as {
    schema?: unknown;
    name?: unknown;
    plugins?: unknown;
    signature?: unknown;
  };

  if (value.schema !== 1) return null;
  if (typeof value.name !== 'string' || !value.name.trim()) return null;
  if (!Array.isArray(value.plugins)) return null;
  if (value.plugins.length > MAX_INDEX_PLUGINS) return null;
  if (typeof value.signature !== 'string') return null;

  const plugins: RegistryPluginEntry[] = [];
  const ids = new Set<string>();
  for (const raw of value.plugins) {
    const entry = validateRegistryEntry(raw);
    if (!entry || ids.has(entry.id)) return null;
    ids.add(entry.id);
    plugins.push(entry);
  }

  const payload = {
    schema: 1 as const,
    name: value.name,
    plugins: value.plugins,
  };

  if (!verifyPayload(payload, value.signature, publicKeyPem)) return null;

  return {
    schema: 1,
    name: value.name,
    plugins,
    signature: value.signature,
  };
}
