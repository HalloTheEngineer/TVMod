import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readPluginDirectory } from '../src/lib/plugin-files.js';
import {
  canonicalJson,
  createPluginBundle,
  generateKeyPairPem,
  sha256Hex,
  signRegistryIndex,
  verifyPluginBundle,
  verifyRegistryIndex,
  type RegistryPluginEntry,
} from '../src/lib/plugin-signing.js';

const exampleDir = path.resolve('examples/plugins/hello-world');

test('canonicalJson is stable across object key order', () => {
  assert.equal(
    canonicalJson({ b: 1, a: { d: 2, c: 3 } }),
    canonicalJson({ a: { c: 3, d: 2 }, b: 1 })
  );
});

test('signed plugin bundles verify and reject tampering', () => {
  const keys = generateKeyPairPem();
  const plugin = readPluginDirectory(exampleDir);
  const bundle = createPluginBundle(plugin.manifest, plugin.source, keys.privateKey);
  const serialized = JSON.stringify(bundle);

  const verified = verifyPluginBundle(JSON.parse(serialized), keys.publicKey);
  assert.equal(verified?.manifest.id, 'hello-world');
  assert.equal(verified?.source, plugin.source);

  const tampered = { ...bundle, source: `${bundle.source}\n// tampered` };
  assert.equal(verifyPluginBundle(tampered, keys.publicKey), null);

  const other = generateKeyPairPem();
  assert.equal(verifyPluginBundle(bundle, other.publicKey), null);
});

test('signed registry indexes verify and reject tampering', () => {
  const keys = generateKeyPairPem();
  const plugin = readPluginDirectory(exampleDir);
  const bundle = createPluginBundle(plugin.manifest, plugin.source, keys.privateKey);
  const bundleText = JSON.stringify(bundle);
  const entry: RegistryPluginEntry = {
    id: 'hello-world',
    name: 'Hello World',
    description: 'Example',
    version: '1.0.0',
    bundle: 'hello-world.tvplug',
    sha256: sha256Hex(bundleText),
  };

  const index = signRegistryIndex(
    { name: 'test', plugins: [entry] },
    keys.privateKey
  );
  const verified = verifyRegistryIndex(index, keys.publicKey);
  assert.equal(verified?.plugins[0]?.id, 'hello-world');

  const tampered = {
    ...index,
    plugins: [{ ...entry, version: '9.9.9' }],
  };
  assert.equal(verifyRegistryIndex(tampered, keys.publicKey), null);
});

test('key material is PEM and SHA-256 is stable', () => {
  const keys = generateKeyPairPem();
  assert.match(keys.privateKey, /BEGIN PRIVATE KEY/);
  assert.match(keys.publicKey, /BEGIN PUBLIC KEY/);
  assert.equal(sha256Hex('abc'), sha256Hex(Buffer.from('abc')));
});
