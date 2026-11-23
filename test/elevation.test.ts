import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as asar from '@electron/asar';
import { installAsarElevated } from '../src/lib/asar-patch.js';
import { sha256File } from '../src/lib/util.js';

test('installAsarElevated performs an atomic replacement through sudo', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tvmod-elevated-test-'));
  const originalPath = process.env.PATH;

  try {
    const fakeBin = path.join(root, 'bin');
    fs.mkdirSync(fakeBin);
    const fakeSudo = path.join(fakeBin, 'sudo');
    fs.writeFileSync(fakeSudo, '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });

    const makeAsar = async (version: string, file: string) => {
      const appDir = path.join(root, `app-${version}`);
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, 'package.json'),
        JSON.stringify({ name: 'fixture', version, main: 'index.js' })
      );
      fs.writeFileSync(path.join(appDir, 'index.js'), 'console.log("x");\n');
      await asar.createPackageWithOptions(appDir, file, {});
    };

    const source = path.join(root, 'source.asar');
    const target = path.join(root, 'target.asar');
    await makeAsar('1.0.0', target);
    await makeAsar('2.0.0', source);

    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ''}`;
    installAsarElevated(source, target);

    assert.equal(sha256File(target), sha256File(source));
    assert.equal(
      JSON.parse(asar.extractFile(target, 'package.json').toString()).version,
      '2.0.0'
    );
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
