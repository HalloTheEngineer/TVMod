import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readEmbeddedPlugins, toPanelPlugin } from '../src/core/embedded-plugins.js';
import { composePreload, readPluginDirectory, validateManifest } from '../src/lib/plugin-files.js';

const exampleDir = path.resolve('examples/plugins/hello-world');

test('validateManifest rejects reserved ids and unsafe paths', () => {
  assert.throws(
    () =>
      validateManifest({
        id: 'adblock',
        name: 'Reserved',
        description: '',
        version: '1.0.0',
        main: 'index.js',
      }),
    /reserved/
  );

  assert.throws(
    () =>
      validateManifest({
        id: 'example',
        name: 'Example',
        description: '',
        version: '1.0.0',
        main: '../index.js',
      }),
    /single \.js/
  );

  assert.throws(
    () =>
      validateManifest({
        id: 'example',
        name: 'Example',
        description: '',
        version: '1.0.0',
        main: 'index.js',
        permissions: ['network'],
      }),
    /unsupported permission/
  );
});

test('readPluginDirectory reads the bundled example plugin', () => {
  const plugin = readPluginDirectory(exampleDir);
  assert.equal(plugin.manifest.id, 'hello-world');
  assert.equal(plugin.manifest.defaultEnabled, false);
  assert.match(plugin.source, /module\.exports/);
  assert.deepEqual(
    plugin.manifest.settings?.map((setting) => setting.type),
    ['boolean', 'string', 'select', 'number']
  );
});

test('validateManifest infers v1 boolean settings and validates typed settings', () => {
  const v1 = validateManifest({
    id: 'legacy',
    name: 'Legacy',
    description: '',
    version: '1.0.0',
    main: 'index.js',
    settings: [{ key: 'flag', name: 'Flag', default: true }],
  });
  assert.equal(v1.settings?.[0]?.type, 'boolean');

  const typed = validateManifest({
    id: 'typed',
    name: 'Typed',
    description: '',
    version: '1.0.0',
    main: 'index.js',
    settings: [
      {
        key: 'text',
        name: 'Text',
        type: 'string',
        default: 'hello',
        placeholder: 'Type here',
      },
      {
        key: 'size',
        name: 'Size',
        type: 'number',
        default: 8,
        min: 5,
        max: 10,
        step: 1,
      },
      {
        key: 'mode',
        name: 'Mode',
        type: 'select',
        default: 'a',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    ],
  });
  assert.deepEqual(
    typed.settings?.map((setting) => setting.type),
    ['string', 'number', 'select']
  );

  assert.throws(
    () =>
      validateManifest({
        id: 'bad-number',
        name: 'Bad number',
        description: '',
        version: '1.0.0',
        main: 'index.js',
        settings: [
          {
            key: 'size',
            name: 'Size',
            type: 'number',
            default: 1,
            min: 5,
          },
        ],
      }),
    /below min/
  );

  assert.throws(
    () =>
      validateManifest({
        id: 'bad-select',
        name: 'Bad select',
        description: '',
        version: '1.0.0',
        main: 'index.js',
        settings: [
          {
            key: 'mode',
            name: 'Mode',
            type: 'select',
            default: 'missing',
            options: [{ value: 'a', label: 'A' }],
          },
        ],
      }),
    /match one of its options/
  );
});

test('composePreload embeds plugin data before the base preload', () => {
  const plugin = readPluginDirectory(exampleDir);
  const composed = composePreload('console.log("base");', [plugin]);
  assert.match(composed, /^globalThis\.__TVMOD_EXTERNAL_PLUGINS__ = /);
  assert.match(composed, /console\.log\("base"\);/);

  const json = composed.slice(
    composed.indexOf('= ') + 2,
    composed.indexOf(';\nconsole.log')
  );
  const parsed = JSON.parse(json) as Array<{ manifest: { id: string }; source: string }>;
  assert.equal(parsed[0]?.manifest.id, 'hello-world');
  assert.match(parsed[0]?.source ?? '', /module\.exports/);
});

test('readEmbeddedPlugins validates and converts external manifests', () => {
  const plugin = readPluginDirectory(exampleDir);
  (globalThis as Record<string, unknown>).__TVMOD_EXTERNAL_PLUGINS__ = [plugin];

  try {
    const embedded = readEmbeddedPlugins();
    assert.equal(embedded.length, 1);
    assert.equal(embedded[0]?.manifest.id, 'hello-world');
    const panel = toPanelPlugin(embedded[0]!.manifest);
    assert.equal(panel.external, true);
    assert.equal(panel.settings?.[0]?.key, 'showBadge');
    assert.equal(panel.settings?.[2]?.type, 'select');
  } finally {
    delete (globalThis as Record<string, unknown>).__TVMOD_EXTERNAL_PLUGINS__;
  }
});
