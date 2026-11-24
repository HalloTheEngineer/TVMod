import assert from 'node:assert/strict';
import test from 'node:test';
import { parseKeywords } from '../src/core/keyword-filter.js';
import {
  isBlockedPrivacyHost,
  stripTrackingParams,
} from '../src/lib/privacy.js';

test('privacy hosts match suffixes but not lookalikes', () => {
  assert.equal(
    isBlockedPrivacyHost('https://www.google-analytics.com/collect'),
    true
  );
  assert.equal(
    isBlockedPrivacyHost('https://region1.google-analytics.com/g/collect'),
    true
  );
  assert.equal(
    isBlockedPrivacyHost('https://notgoogle-analytics.com/collect'),
    false
  );
  assert.equal(
    isBlockedPrivacyHost('https://data.tradingview.com/chart'),
    false
  );
  assert.equal(
    isBlockedPrivacyHost('https://example.com/?next=https://google-analytics.com'),
    false
  );
});

test('tracking parameters are removed without touching useful parameters', () => {
  assert.equal(
    stripTrackingParams(
      'https://example.com/page?utm_source=x&utm_medium=y&gclid=abc&id=42&fbclid=z'
    ),
    'https://example.com/page?id=42'
  );
  assert.equal(
    stripTrackingParams('https://example.com/page?id=42'),
    'https://example.com/page?id=42'
  );
});

test('parseKeywords normalizes, deduplicates, and limits terms', () => {
  assert.deepEqual(parseKeywords(' Tesla, nvidia , tesla, a, '), [
    'tesla',
    'nvidia',
  ]);
  assert.equal(parseKeywords('x').length, 0);

  const many = Array.from({ length: 30 }, (_, index) => `term${index}`);
  assert.equal(parseKeywords(many.join(',')).length, 20);
});
