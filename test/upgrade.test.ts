import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafeUpgradeClass, isUpgradeText } from '../src/core/upgrade.js';

test('upgrade copy detection is exact and size-capped', () => {
  assert.equal(isUpgradeText('Analyze markets in TradingView Desktop'), true);
  assert.equal(
    isUpgradeText(
      'Upgrade your plan and discover the full power of TradingView Desktop'
    ),
    true
  );
  assert.equal(isUpgradeText('Link symbols across tabs'), true);
  assert.equal(isUpgradeText('Loading chart…'), false);
  assert.equal(
    isUpgradeText('x'.repeat(4001) + ' Analyze markets in TradingView Desktop'),
    false
  );
});

test('upgrade containers never match chart or app roots', () => {
  assert.equal(isSafeUpgradeClass('chart-container'), false);
  assert.equal(isSafeUpgradeClass('layout__area--center'), false);
  assert.equal(isSafeUpgradeClass('tvmod-root'), false);
  assert.equal(isSafeUpgradeClass('workspace'), false);
  assert.equal(isSafeUpgradeClass('dialog-hsBoleDO'), true);
  assert.equal(isSafeUpgradeClass('x-portal-123'), true);
});
