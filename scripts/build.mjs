import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const outdir = path.join(root, 'dist');

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  legalComments: 'none',
  define: {
    __TVMOD_VERSION__: JSON.stringify(pkg.version),
  },
};

await build({
  ...common,
  entryPoints: [path.join(root, 'src/cli.ts')],
  outfile: path.join(outdir, 'cli.cjs'),
  platform: 'node',
  format: 'cjs',
  target: 'node20',
});

await build({
  ...common,
  entryPoints: [path.join(root, 'src/preload.ts')],
  outfile: path.join(outdir, 'preload.cjs'),
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
});

fs.chmodSync(path.join(outdir, 'cli.cjs'), 0o755);
console.log(`tvmod ${pkg.version} built in dist/`);
