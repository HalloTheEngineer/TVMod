import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTarget } from './targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const target = resolveTarget();
const name = `tvmod-${pkg.version}-${target.id}`;
const releaseDir = path.join(root, 'release');
const stage = path.join(releaseDir, name);
const binaryName = `tvmod${target.ext}`;
const binary = path.join(root, 'dist', binaryName);
const preload = path.join(root, 'dist', 'preload.cjs');

for (const required of [binary, preload]) {
  if (!fs.existsSync(required)) {
    console.error(`${required} is missing; run "npm run build:binary" first`);
    process.exit(1);
  }
}

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

for (const file of ['README.md', 'LICENSE', 'SECURITY.md', 'package.json']) {
  fs.copyFileSync(path.join(root, file), path.join(stage, file));
}
fs.cpSync(path.join(root, 'docs'), path.join(stage, 'docs'), { recursive: true });
fs.cpSync(path.join(root, 'examples'), path.join(stage, 'examples'), {
  recursive: true,
});
fs.cpSync(path.join(root, 'tools/snap'), path.join(stage, 'tools/snap'), {
  recursive: true,
});
fs.copyFileSync(binary, path.join(stage, binaryName));
fs.copyFileSync(preload, path.join(stage, 'preload.cjs'));
if (target.platform !== 'win32') {
  fs.chmodSync(path.join(stage, binaryName), 0o755);
} else {
  fs.writeFileSync(
    path.join(stage, 'tvmod.cmd'),
    '@echo off\r\n"%~dp0tvmod.exe" %*\r\n'
  );
}

let archive;
if (target.archive === 'zip') {
  archive = path.join(releaseDir, `${name}.zip`);
  fs.rmSync(archive, { force: true });
  const zip = spawnSync('zip', ['-qr', archive, name], {
    cwd: releaseDir,
    stdio: 'inherit',
  });
  if (zip.error || zip.status !== 0) {
    console.error(zip.error ?? 'zip failed');
    process.exit(zip.status ?? 1);
  }
} else {
  archive = path.join(releaseDir, `${name}.tar.gz`);
  const tar = spawnSync('tar', ['-czf', archive, '-C', releaseDir, name], {
    stdio: 'inherit',
  });
  if (tar.error || tar.status !== 0) {
    console.error(tar.error ?? 'tar failed');
    process.exit(tar.status ?? 1);
  }
}

const hash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(archive))
  .digest('hex');
fs.writeFileSync(
  path.join(releaseDir, 'SHA256SUMS'),
  `${hash}  ${path.basename(archive)}\n`
);

console.log(archive);
console.log(`${hash}  ${path.basename(archive)}`);
