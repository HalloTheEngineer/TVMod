import assert from 'node:assert/strict';
import test from 'node:test';
import { planRegistryUpdates } from '../src/core/registry-updates.js';

const installed = [
  { id: 'hello-world', version: '1.0.0', external: true },
  { id: 'local-only', version: '0.1.0', external: true },
  { id: 'adblock', version: '1.0.0', external: false },
];

function plugin(
  id: string,
  version: string,
  registry = 'test'
) {
  return {
    id,
    name: id,
    description: '',
    version,
    registry,
  };
}

test('planRegistryUpdates finds version changes for external plugins', () => {
  const plan = planRegistryUpdates(
    [
      plugin('hello-world', '1.1.0'),
      plugin('local-only', '0.1.0'),
      plugin('new-plugin', '1.0.0'),
      plugin('adblock', '9.9.9'),
    ],
    installed
  );

  assert.deepEqual(plan.updates, [
    {
      id: 'hello-world',
      name: 'hello-world',
      registry: 'test',
      version: '1.1.0',
      installedVersion: '1.0.0',
    },
  ]);
  assert.deepEqual(plan.ambiguous, []);
});

test('planRegistryUpdates skips updates offered by multiple registries', () => {
  const plan = planRegistryUpdates(
    [
      plugin('hello-world', '1.1.0', 'alpha'),
      plugin('hello-world', '1.2.0', 'beta'),
    ],
    installed
  );

  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.ambiguous, ['hello-world']);
});
