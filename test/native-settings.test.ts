import assert from 'node:assert/strict';
import test from 'node:test';
import { isNativeSettingsLocation } from '../src/core/native-settings.js';

test('native settings detection only accepts the desktop dialog window', () => {
  assert.equal(
    isNativeSettingsLocation(
      'file:',
      '/usr/lib/tradingview/resources/app.asar/app/dialog-window/index.html'
    ),
    true
  );
  assert.equal(
    isNativeSettingsLocation(
      'file:',
      'C:\\Program Files\\TradingView\\resources\\app.asar\\app\\dialog-window\\index.html'
    ),
    true
  );
  assert.equal(
    isNativeSettingsLocation(
      'file:',
      '/usr/lib/tradingview/resources/app.asar/app/new-tab/index.html'
    ),
    false
  );
  assert.equal(
    isNativeSettingsLocation('https:', '/app/dialog-window/index.html'),
    false
  );
  assert.equal(isNativeSettingsLocation('file:', '/index.html'), false);
});
