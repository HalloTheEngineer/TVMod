import assert from 'node:assert/strict';
import test from 'node:test';
import { installBootHooks } from '../src/core/boot.js';
import { normalizeSettings } from '../src/core/settings.js';
import { inferFlavor } from '../src/lib/app-detect.js';
import { parseInspectorUrl, quoteDesktopArg } from '../src/lib/util.js';

test('parseInspectorUrl extracts the websocket url', () => {
  const text =
    'Debugger listening on ws://127.0.0.1:4567/abc-123\nFor help, see: ...';
  assert.equal(
    parseInspectorUrl(text),
    'ws://127.0.0.1:4567/abc-123'
  );
  assert.equal(parseInspectorUrl('nothing here'), null);
});

test('normalizeSettings fills defaults and rejects wrong types', () => {
  assert.deepEqual(normalizeSettings(null), {
    noPromos: true,
    cleanUi: true,
    hideSidebar: false,
  });
  assert.deepEqual(normalizeSettings({ noPromos: false, cleanUi: 'yes' }), {
    noPromos: false,
    cleanUi: true,
    hideSidebar: false,
  });
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
    installBootHooks({ noPromos: true }, { version: 'test', at: 0 });

    fakeWindow.initData = {
      offerButtonInfo: { title: 'Black Friday' },
      settings: {},
    };
    const initData = fakeWindow.initData as Record<string, unknown>;
    assert.equal('offerButtonInfo' in initData, false);

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
    delete (globalThis as Record<string, unknown>).window;
  }
});
