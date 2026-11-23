import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAllowedUrl,
  resolvePluginUrl,
} from '../src/lib/registry.js';

test('registry URLs require HTTPS except for localhost', () => {
  assert.doesNotThrow(() => assertAllowedUrl('https://example.com/index.json'));
  assert.doesNotThrow(() => assertAllowedUrl('http://localhost:8765/index.json'));
  assert.doesNotThrow(() => assertAllowedUrl('http://127.0.0.1:8765/index.json'));
  assert.doesNotThrow(() => assertAllowedUrl('http://[::1]:8765/index.json'));

  assert.throws(() => assertAllowedUrl('http://example.com/index.json'));
  assert.throws(() => assertAllowedUrl('file:///tmp/index.json'));
  assert.throws(() => assertAllowedUrl('not a url'));
});

test('bundle URLs resolve relative to the index URL', () => {
  assert.equal(
    resolvePluginUrl('https://example.com/tvmod/index.json', {
      id: 'hello-world',
      name: 'Hello World',
      description: '',
      version: '1.0.0',
      bundle: 'hello-world.tvplug',
      sha256: 'a'.repeat(64),
    }),
    'https://example.com/tvmod/hello-world.tvplug'
  );

  assert.equal(
    resolvePluginUrl('https://example.com/tvmod/index.json', {
      id: 'hello-world',
      name: 'Hello World',
      description: '',
      version: '1.0.0',
      bundle: 'https://cdn.example.com/hello-world.tvplug',
      sha256: 'a'.repeat(64),
    }),
    'https://cdn.example.com/hello-world.tvplug'
  );

  assert.throws(() =>
    resolvePluginUrl('https://example.com/tvmod/index.json', {
      id: 'hello-world',
      name: 'Hello World',
      description: '',
      version: '1.0.0',
      bundle: 'http://example.com/hello-world.tvplug',
      sha256: 'a'.repeat(64),
    })
  );
});
