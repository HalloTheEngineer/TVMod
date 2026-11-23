import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as asar from '@electron/asar';
import {
  HOST_PRELOAD_PATH,
  backupAsar,
  buildPatchedAsar,
  cleanupPatchedBuild,
  installAsar,
  isAsarPatched,
  restoreAsar,
} from '../src/lib/asar-patch.js';
import { sha256File } from '../src/lib/util.js';

test('patch core embeds the preload and restores the original ASAR', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tvmod-patch-test-'));

  try {
    const appDir = path.join(root, 'app');
    fs.mkdirSync(path.join(appDir, 'preload'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.2.3', main: 'index.js' })
    );
    fs.writeFileSync(path.join(appDir, 'index.js'), 'console.log("fixture");\n');
    fs.writeFileSync(
      path.join(appDir, 'preload', 'target-tvd-host-preload.js'),
      'console.log("host preload");\n'
    );

    const asarPath = path.join(root, 'app.asar');
    await asar.createPackageWithOptions(appDir, asarPath, {});

    const originalBackup = backupAsar(asarPath, path.join(root, 'backups'), '1.2.3');
    const preloadSource = path.join(root, 'preload.cjs');
    fs.writeFileSync(preloadSource, 'console.log("tvmod preload");\n');

    const build = await buildPatchedAsar(asarPath, preloadSource);
    assert.equal(isAsarPatched(build.tempAsar), true);

    const patchedHost = asar
      .extractFile(build.tempAsar, HOST_PRELOAD_PATH)
      .toString('utf8');
    assert.match(patchedHost, /TVMOD_PRELOAD_START/);
    assert.match(patchedHost, /tvmod preload/);

    installAsar(build.tempAsar, asarPath);
    cleanupPatchedBuild(build);
    assert.equal(isAsarPatched(asarPath), true);
    assert.notEqual(sha256File(asarPath), originalBackup.hash);

    restoreAsar(originalBackup.backupPath, asarPath);
    assert.equal(isAsarPatched(asarPath), false);
    assert.equal(sha256File(asarPath), originalBackup.hash);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
