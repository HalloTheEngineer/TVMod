import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = `tvmod-${pkg.version}-linux-x64`;
const releaseDir = path.join(root, 'release');
const stage = path.join(releaseDir, name);
const binary = path.join(root, 'dist', 'tvmod');
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
fs.copyFileSync(binary, path.join(stage, 'tvmod'));
fs.copyFileSync(preload, path.join(stage, 'preload.cjs'));
fs.chmodSync(path.join(stage, 'tvmod'), 0o755);

const tarball = path.join(releaseDir, `${name}.tar.gz`);
const tar = spawnSync(
  'tar',
  ['-czf', tarball, '-C', releaseDir, name],
  { stdio: 'inherit' }
);
if (tar.status !== 0) process.exit(tar.status ?? 1);

const hash = crypto.createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
fs.writeFileSync(
  path.join(releaseDir, 'SHA256SUMS'),
  `${hash}  ${path.basename(tarball)}\n`
);

console.log(tarball);
console.log(`${hash}  ${path.basename(tarball)}`);
