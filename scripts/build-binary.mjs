import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostTarget, resolveTarget } from './targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = resolveTarget();
const outfile = path.join(root, 'dist', `tvmod${target.ext}`);
const preload = path.join(root, 'dist', 'preload.cjs');

if (!fs.existsSync(preload)) {
  console.error('dist/preload.cjs is missing; run "npm run build" first');
  process.exit(1);
}

const bun = process.env.BUN ?? 'bun';

const result = spawnSync(
  bun,
  [
    'build',
    path.join(root, 'src/cli.ts'),
    '--compile',
    `--target=${target.bun}`,
    `--outfile=${outfile}`,
  ],
  { cwd: root, stdio: 'inherit' }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (target.platform !== 'win32') {
  fs.chmodSync(outfile, 0o755);
}

if (target.id === hostTarget()) {
  const version = spawnSync(outfile, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0) {
    console.error(version.stderr || 'standalone binary self-test failed');
    process.exit(version.status ?? 1);
  }
  console.log(`standalone binary: ${outfile} (${version.stdout.trim()})`);
} else {
  console.log(`standalone binary: ${outfile} (${target.id}, cross-compiled)`);
}
