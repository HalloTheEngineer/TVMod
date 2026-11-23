import assert from 'node:assert/strict';
import test from 'node:test';
import { installBootHooks } from '../src/core/boot.js';
import {
  CONFIG_KEY,
  LEGACY_SETTINGS_KEY,
  defaultConfig,
  isPluginEnabled,
  loadConfig,
  migrateLegacySettings,
  normalizeConfig,
  withPluginEnabled,
} from '../src/core/config.js';
import { inferFlavor } from '../src/lib/app-detect.js';
import { parseInspectorUrl, quoteDesktopArg } from '../src/lib/util.js';

test('parseInspectorUrl extracts the websocket url', () => {
  const text =
    'Debugger listening on ws://127.0.0.1:4567/abc-123\nFor help, see: ...';
  assert.equal(parseInspectorUrl(text), 'ws://127.0.0.1:4567/abc-123');
  assert.equal(parseInspectorUrl('nothing here'), null);
});

test('normalizeConfig keeps defaults and drops unknown plugin ids', () => {
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
  assert.equal('not-a-plugin' in config.plugins, false);
});

test('legacy flat settings migrate to plugin state', () => {
  const config = migrateLegacySettings({
    noPromos: false,
    cleanUi: false,
    hideSidebar: true,
  });

  assert.equal(isPluginEnabled(config, 'adblock'), false);
  assert.equal(isPluginEnabled(config, 'hide-ai-copilot'), false);
  assert.equal(isPluginEnabled(config, 'hide-community-hub'), false);
  assert.equal(isPluginEnabled(config, 'hide-sidebar'), true);
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
  const config = withPluginEnabled(defaultConfig(), 'hide-sidebar', true);
  assert.equal(isPluginEnabled(config, 'hide-sidebar'), true);
  assert.equal(isPluginEnabled(config, 'adblock'), true);
});

test('inferFlavor recognizes the Linux install layouts', () => {
  assert.equal(inferFlavor('/usr/lib/tradingview/tradingview'), 'aur');
  assert.equal(inferFlavor('/opt/TradingView/tradingview'), 'tarball');
  assert.equal(inferFlavor('/snap/tradingview/current/tradingview'), 'snap');
  assert.equal(inferFlavor('/home/user/TradingView/tradingview'), 'custom');
});

test('quoteDesktopArg quotes the Exec field safely', () => {
  assert.equal(quoteDesktopArg('/home/a b/tvmod'), '"/home/a b/tvmod"');
  assert.equal(quoteDesktopArg('/a$b'), '"/a\\$b"');
});

test('boot hooks filter offers and promo feature flags', () => {
  const fakeWindow: Record<string, unknown> = {};
  (globalThis as Record<string, unknown>).window = fakeWindow;

  try {
    installBootHooks({ adblock: true }, { version: 'test', at: 0 });

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
