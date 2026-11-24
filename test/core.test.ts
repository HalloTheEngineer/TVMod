import assert from 'node:assert/strict';
import test from 'node:test';
import { installBootHooks } from '../src/core/boot.js';
import {
  CONFIG_KEY,
  LEGACY_SETTINGS_KEY,
  OBSOLETE_PLUGIN_IDS,
  defaultConfig,
  getPluginSettings,
  isPluginEnabled,
  loadConfig,
  migrateLegacySettings,
  normalizeConfig,
  withPluginEnabled,
  withPluginSetting,
} from '../src/core/config.js';
import type { PanelPlugin } from '../src/core/plugin-types.js';
import { inferFlavor } from '../src/lib/app-detect.js';
import {
  preloadTargetForFlavor,
  snapPreloadTarget,
} from '../src/lib/paths.js';
import { parseInspectorUrl, quoteDesktopArg } from '../src/lib/util.js';

test('parseInspectorUrl extracts the websocket url', () => {
  const text =
    'Debugger listening on ws://127.0.0.1:4567/abc-123\nFor help, see: ...';
  assert.equal(parseInspectorUrl(text), 'ws://127.0.0.1:4567/abc-123');
  assert.equal(parseInspectorUrl('nothing here'), null);
});

test('normalizeConfig keeps defaults and preserves external plugin state', () => {
  assert.deepEqual(normalizeConfig(null), defaultConfig());

  const config = normalizeConfig({
    version: 2,
    plugins: {
      adblock: { enabled: false },
      'not-a-plugin': { enabled: true },
    },
  });

  assert.equal(isPluginEnabled(config, 'adblock'), false);
  assert.equal(isPluginEnabled(config, 'hide-ai-copilot'), true);
  assert.equal(isPluginEnabled(config, 'not-a-plugin'), true);
});

test('normalizeConfig merges external plugin settings with defaults', () => {
  const external = {
    id: 'external',
    name: 'External',
    description: 'test',
    defaultEnabled: false,
    category: 'tools' as const,
    external: true,
    settings: [
      { key: 'foo', name: 'Foo', type: 'boolean' as const, default: true },
    ],
  };

  const config = normalizeConfig(
    {
      version: 2,
      plugins: {
        external: { enabled: true, settings: { foo: false } },
      },
    },
    [external]
  );

  assert.equal(isPluginEnabled(config, 'external'), true);
  assert.equal(config.plugins.external?.settings?.foo, false);
});

test('normalizeConfig removes obsolete visual plugin states', () => {
  const config = normalizeConfig({
    version: 2,
    plugins: {
      adblock: { enabled: true },
      'hide-community-hub': { enabled: true },
      'hide-sidebar': { enabled: true },
      'hide-right-toolbar': { enabled: true },
      'hide-watchlist': { enabled: true },
      'hide-details': { enabled: true },
      'hide-bottom-controls': { enabled: true },
      'hide-toolbar-extras': { enabled: true },
      'hide-trade-buttons': { enabled: true },
    },
  });

  for (const id of OBSOLETE_PLUGIN_IDS) {
    assert.equal(config.plugins[id], undefined);
  }
});

test('withPluginSetting preserves the enabled state', () => {
  const config = withPluginSetting(defaultConfig(), 'adblock', 'foo', true);
  assert.equal(isPluginEnabled(config, 'adblock'), true);
  assert.equal(config.plugins.adblock?.settings?.foo, true);
});

test('normalizeConfig validates typed setting values', () => {
  const external: PanelPlugin = {
    id: 'typed',
    name: 'Typed',
    description: '',
    defaultEnabled: true,
    category: 'tools' as const,
    external: true,
    settings: [
      { key: 'flag', name: 'Flag', type: 'boolean', default: true },
      { key: 'text', name: 'Text', type: 'string', default: 'hello' },
      {
        key: 'size',
        name: 'Size',
        type: 'number',
        default: 8,
        min: 5,
        max: 10,
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
  };

  const config = normalizeConfig(
    {
      version: 2,
      plugins: {
        typed: {
          enabled: true,
          settings: {
            flag: 'nope',
            text: 42,
            size: 99,
            mode: 'missing',
          },
        },
      },
    },
    [external]
  );

  assert.deepEqual(config.plugins.typed?.settings, {
    flag: true,
    text: 'hello',
    size: 10,
    mode: 'a',
  });
  assert.deepEqual(getPluginSettings(config, external), {
    flag: true,
    text: 'hello',
    size: 10,
    mode: 'a',
  });
});

test('normalizeConfig accepts typed values within their constraints', () => {
  const external: PanelPlugin = {
    id: 'typed',
    name: 'Typed',
    description: '',
    defaultEnabled: false,
    category: 'tools' as const,
    external: true,
    settings: [
      { key: 'text', name: 'Text', type: 'string', default: 'hello' },
      {
        key: 'size',
        name: 'Size',
        type: 'number',
        default: 8,
        min: 5,
        max: 10,
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
  };

  const config = normalizeConfig(
    {
      version: 2,
      plugins: {
        typed: {
          enabled: true,
          settings: { text: 'custom', size: 7, mode: 'b' },
        },
      },
    },
    [external]
  );

  assert.deepEqual(config.plugins.typed?.settings, {
    text: 'custom',
    size: 7,
    mode: 'b',
  });
});

test('legacy flat settings migrate to plugin state', () => {
  const config = migrateLegacySettings({
    noPromos: false,
    cleanUi: false,
    hideSidebar: true,
  });

  assert.equal(isPluginEnabled(config, 'adblock'), false);
  assert.equal(isPluginEnabled(config, 'hide-ai-copilot'), false);
  assert.equal(config.plugins['hide-community-hub'], undefined);
  assert.equal(config.plugins['hide-sidebar'], undefined);
});

test('loadConfig migrates the legacy key and writes the new key', () => {
  const values = new Map<string, string>([
    [
      LEGACY_SETTINGS_KEY,
      JSON.stringify({ noPromos: false, cleanUi: true, hideSidebar: false }),
    ],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };

  const config = loadConfig(storage);
  assert.equal(isPluginEnabled(config, 'adblock'), false);
  assert.equal(isPluginEnabled(config, 'hide-ai-copilot'), true);
  assert.ok(values.has(CONFIG_KEY));
});

test('withPluginEnabled updates one plugin without losing others', () => {
  const config = withPluginEnabled(defaultConfig(), 'focus-mode', true);
  assert.equal(isPluginEnabled(config, 'focus-mode'), true);
  assert.equal(isPluginEnabled(config, 'adblock'), true);
});

test('inferFlavor recognizes the Linux install layouts', () => {
  assert.equal(inferFlavor('/usr/lib/tradingview/tradingview'), 'aur');
  assert.equal(inferFlavor('/opt/TradingView/tradingview'), 'tarball');
  assert.equal(inferFlavor('/snap/tradingview/current/tradingview'), 'snap');
  assert.equal(inferFlavor('/home/user/TradingView/tradingview'), 'custom');
});

test('Snap installs use the Snap user-common preload path', () => {
  assert.equal(preloadTargetForFlavor('snap'), snapPreloadTarget);
  assert.match(
    snapPreloadTarget,
    /\/snap\/tradingview\/common\/tvmod\/preload\.js$/
  );
  assert.notEqual(preloadTargetForFlavor('aur'), snapPreloadTarget);
});

test('quoteDesktopArg quotes the Exec field safely', () => {
  assert.equal(quoteDesktopArg('/home/a b/tvmod'), '"/home/a b/tvmod"');
  assert.equal(quoteDesktopArg('/a$b'), '"/a\\$b"');
});

test('boot hooks filter offers and promo feature flags', () => {
  const fakeWindow: Record<string, unknown> = {};
  (globalThis as Record<string, unknown>).window = fakeWindow;

  try {
    installBootHooks(
      { adblock: true, disableAi: false, privacy: false, privacyHosts: [] },
      { version: 'test', at: 0 }
    );

    fakeWindow.initData = {
      offerButtonInfo: { title: 'Black Friday' },
      settings: {},
    };
    const initData = fakeWindow.initData as Record<string, unknown>;
    assert.equal(initData.offerButtonInfo, undefined);

    fakeWindow.user = {
      available_offers: { black_friday: { available: true } },
    };
    const user = fakeWindow.user as Record<string, unknown>;
    assert.deepEqual(user.available_offers, {});

    fakeWindow.featureToggleState = {
      black_friday_popup: 1,
      broker_side_promotion: 1,
      currency_unit_conversion_paywall: 1,
      some_real_feature: 1,
    };
    const flags = fakeWindow.featureToggleState as Record<string, number>;
    assert.equal(flags.black_friday_popup, 0);
    assert.equal(flags.broker_side_promotion, 0);
    assert.equal(flags.currency_unit_conversion_paywall, 1);
    assert.equal(flags.some_real_feature, 1);
  } finally {
    const interval = fakeWindow.__TVMOD_BOOT_INTERVAL__;
    if (interval) {
      clearInterval(interval as ReturnType<typeof setInterval>);
    }
    delete (globalThis as Record<string, unknown>).window;
  }
});

test('boot hooks disable AI, tracking flags, and privacy hosts', async () => {
  const fakeWindow: Record<string, unknown> = {
    fetch: async (input: unknown) => ({
      status: 200,
      url: String(input),
    }),
  };
  const globals = globalThis as Record<string, unknown>;
  globals.window = fakeWindow;
  globals.location = { href: 'https://www.tradingview.com/chart/' };

  try {
    installBootHooks(
      {
        adblock: false,
        disableAi: true,
        privacy: true,
        privacyHosts: ['google-analytics.com'],
      },
      { version: 'test', at: 0 }
    );

    fakeWindow.featureToggleState = {
      enable_ai_copilot: 1,
      enable_ai_copilot_chart_range: 1,
      enable_ai_support_entrypoint: 1,
      'adwords-analytics': 1,
      trading_general_events_ga_tracking: 1,
      trading_general_events_snowplow_tracking: 1,
      some_real_feature: 1,
    };
    const flags = fakeWindow.featureToggleState as Record<string, number>;
    assert.equal(flags.enable_ai_copilot, 0);
    assert.equal(flags.enable_ai_copilot_chart_range, 0);
    assert.equal(flags.enable_ai_support_entrypoint, 1);
    assert.equal(flags['adwords-analytics'], 0);
    assert.equal(flags.trading_general_events_ga_tracking, 0);
    assert.equal(flags.trading_general_events_snowplow_tracking, 0);
    assert.equal(flags.some_real_feature, 1);

    const blocked = await (
      fakeWindow.fetch as (input: string) => Promise<{ status: number }>
    )('https://www.google-analytics.com/collect');
    assert.equal(blocked.status, 204);
    assert.ok(Number(fakeWindow.__TVMOD_PRIVACY_BLOCKED__) > 0);

    const allowed = await (
      fakeWindow.fetch as (input: string) => Promise<{ status: number }>
    )('https://data.tradingview.com/chart');
    assert.equal(allowed.status, 200);
  } finally {
    const interval = fakeWindow.__TVMOD_BOOT_INTERVAL__;
    if (interval) {
      clearInterval(interval as ReturnType<typeof setInterval>);
    }
    delete globals.window;
    delete globals.location;
  }
});
