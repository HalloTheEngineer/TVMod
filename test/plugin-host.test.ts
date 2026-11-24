import assert from 'node:assert/strict';
import test from 'node:test';
import type { TvmodConfig } from '../src/core/config.js';
import type { Host } from '../src/core/host.js';
import { PluginHost } from '../src/core/plugin-host.js';
import type {
  EmbeddedPlugin,
  PluginPermission,
  PluginSettingDefinition,
  PluginSettings,
} from '../src/core/plugin-types.js';

const fakeHost: Host = {
  executeJavaScript: async () => undefined,
  insertCSS: () => 'css-key',
  removeInsertedCSS: () => {},
};

function plugin(
  id: string,
  source: string,
  permissions: PluginPermission[] = [],
  settings?: PluginSettingDefinition[]
): EmbeddedPlugin {
  return {
    manifest: {
      id,
      name: id,
      description: '',
      version: '1.0.0',
      main: 'index.js',
      permissions,
      settings,
    },
    source,
  };
}

function config(
  plugins: Record<string, { enabled: boolean; settings?: PluginSettings }>
): TvmodConfig {
  return { version: 2, plugins };
}

test('plugin events are delivered with the sender id and cleaned up on stop', async () => {
  const globals = globalThis as Record<string, unknown>;
  globals.__tvmodEvents = [];
  globals.__tvmodOnce = [];
  let current = config({
    alpha: { enabled: true },
    beta: { enabled: true },
  });

  const alpha = plugin(
    'alpha',
    `module.exports = {
      start(ctx) {
        ctx.events.on('ping', (payload, from) => {
          globalThis.__tvmodEvents.push([payload, from]);
        });
        ctx.events.once('once', (payload) => {
          globalThis.__tvmodOnce.push(payload);
        });
      }
    };`,
    ['events']
  );
  const beta = plugin(
    'beta',
    `module.exports = {
      start(ctx) {
        ctx.events.emit('ping', 42);
        ctx.events.emit('once', 'first');
        ctx.events.emit('once', 'second');
      }
    };`,
    ['events']
  );

  const host = new PluginHost([alpha, beta], () => current, fakeHost, 'test');

  try {
    await host.sync();
    assert.deepEqual(globals.__tvmodEvents, [[42, 'beta']]);
    assert.deepEqual(globals.__tvmodOnce, ['first']);

    current = config({
      alpha: { enabled: false },
      beta: { enabled: false },
    });
    await host.sync();
    current = config({
      alpha: { enabled: false },
      beta: { enabled: true },
    });
    await host.sync();

    assert.deepEqual(globals.__tvmodEvents, [[42, 'beta']]);
    assert.deepEqual(globals.__tvmodOnce, ['first']);
  } finally {
    delete globals.__tvmodEvents;
    delete globals.__tvmodOnce;
  }
});

test('onSettingsChange updates without restarting and ctx.onCleanup runs', async () => {
  const globals = globalThis as Record<string, unknown>;
  globals.__tvmodStarts = 0;
  globals.__tvmodChanges = [];
  globals.__tvmodCleanup = 0;

  let current = config({
    alpha: { enabled: true, settings: { value: 1 } },
  });
  const alpha = plugin(
    'alpha',
    `module.exports = {
      start(ctx) {
        globalThis.__tvmodStarts += 1;
        ctx.onCleanup(() => {
          globalThis.__tvmodCleanup += 1;
        });
      },
      onSettingsChange({ settings, previous, changed }) {
        globalThis.__tvmodChanges.push({
          value: settings.value,
          previous: previous.value,
          changed
        });
      }
    };`,
    [],
    [
      {
        key: 'value',
        name: 'Value',
        type: 'number',
        default: 0,
        min: 0,
        max: 10,
      },
    ]
  );

  const host = new PluginHost([alpha], () => current, fakeHost, 'test');

  try {
    await host.sync();
    assert.equal(globals.__tvmodStarts, 1);

    current = config({
      alpha: { enabled: true, settings: { value: 2 } },
    });
    await host.sync();

    assert.equal(globals.__tvmodStarts, 1);
    assert.deepEqual(globals.__tvmodChanges, [
      { value: 2, previous: 1, changed: ['value'] },
    ]);

    current = config({ alpha: { enabled: false } });
    await host.sync();
    assert.equal(globals.__tvmodCleanup, 1);
  } finally {
    delete globals.__tvmodStarts;
    delete globals.__tvmodChanges;
    delete globals.__tvmodCleanup;
  }
});

test('plugins without onSettingsChange restart when settings change', async () => {
  const globals = globalThis as Record<string, unknown>;
  globals.__tvmodRestarts = 0;
  globals.__tvmodStops = 0;

  let current = config({
    alpha: { enabled: true, settings: { value: 1 } },
  });
  const alpha = plugin(
    'alpha',
    `module.exports = {
      start() {
        globalThis.__tvmodRestarts += 1;
        return () => {
          globalThis.__tvmodStops += 1;
        };
      }
    };`,
    [],
    [{ key: 'value', name: 'Value', type: 'number', default: 0 }]
  );

  const host = new PluginHost([alpha], () => current, fakeHost, 'test');

  try {
    await host.sync();
    current = config({
      alpha: { enabled: true, settings: { value: 2 } },
    });
    await host.sync();

    assert.equal(globals.__tvmodRestarts, 2);
    assert.equal(globals.__tvmodStops, 1);
  } finally {
    delete globals.__tvmodRestarts;
    delete globals.__tvmodStops;
  }
});

test('a failing onSettingsChange stops the plugin and reports an error', async () => {
  const globals = globalThis as Record<string, unknown>;
  globals.__tvmodStop = 0;

  let current = config({
    alpha: { enabled: true, settings: { value: 1 } },
  });
  const alpha = plugin(
    'alpha',
    `module.exports = {
      start() {
        return () => {
          globalThis.__tvmodStop += 1;
        };
      },
      onSettingsChange() {
        throw new Error('settings hook failed');
      }
    };`,
    [],
    [{ key: 'value', name: 'Value', type: 'number', default: 0 }]
  );

  const host = new PluginHost([alpha], () => current, fakeHost, 'test');

  try {
    await host.sync();
    current = config({
      alpha: { enabled: true, settings: { value: 2 } },
    });
    await host.sync();

    assert.match(host.errorFor('alpha') ?? '', /settings hook failed/);
    assert.equal(globals.__tvmodStop, 1);
  } finally {
    delete globals.__tvmodStop;
  }
});
