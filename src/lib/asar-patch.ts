import * as asar from '@electron/asar';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDir } from './paths.js';
import { sha256File } from './util.js';

export const HOST_PRELOAD_PATH = 'preload/target-tvd-host-preload.js';
export const TVMOD_MARKER_START = '/* TVMOD_PRELOAD_START */';
export const TVMOD_MARKER_END = '/* TVMOD_PRELOAD_END */';

export interface PatchedBuild {
  tempAsar: string;
  tempDir: string;
  version: string | null;
}

function asarVersion(asarPath: string): string | null {
  try {
    const raw = asar.extractFile(asarPath, 'package.json');
    return (JSON.parse(raw.toString('utf8')) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function verifyUnpackedNativeModules(asarPath: string, tempAsar: string): void {
  const generated = `${tempAsar}.unpacked`;
  const installed = `${asarPath}.unpacked`;

  for (const file of walkFiles(generated)) {
    const relative = path.relative(generated, file);
    const target = path.join(installed, relative);

    if (!fs.existsSync(target)) {
      throw new Error(
        `native module ${relative} would need app.asar.unpacked replacement; refusing an unsafe patch`
      );
    }

    if (fs.statSync(target).size !== fs.statSync(file).size) {
      throw new Error(`native module ${relative} differs from the installed copy`);
    }
  }
}

export async function buildPatchedAsar(
  asarPath: string,
  preloadSource: string
): Promise<PatchedBuild> {
  if (!fs.existsSync(preloadSource)) {
    throw new Error(`preload source not found: ${preloadSource}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvmod-patch-'));
  const extractDir = path.join(tempDir, 'app');
  const tempAsar = path.join(tempDir, 'app.asar');
  const version = asarVersion(asarPath);

  try {
    asar.extractAll(asarPath, extractDir);

    const hostPreload = path.join(extractDir, HOST_PRELOAD_PATH);
    if (!fs.existsSync(hostPreload)) {
      throw new Error(
        `${HOST_PRELOAD_PATH} was not found; this app layout is not supported by the patch backend`
      );
    }

    const hostContent = fs.readFileSync(hostPreload, 'utf8');
    if (hostContent.includes(TVMOD_MARKER_START)) {
      throw new Error('this app.asar already contains the TVMod preload');
    }

    const preloadCode = fs.readFileSync(preloadSource, 'utf8');
    const inlined = [
      '',
      TVMOD_MARKER_START,
      '(function () {',
      preloadCode,
      '})();',
      TVMOD_MARKER_END,
      '',
    ].join('\n');

    fs.writeFileSync(hostPreload, `${hostContent}\n${inlined}`);

    await asar.createPackageWithOptions(extractDir, tempAsar, {
      unpack: '**/*.node',
    });

    const patchedHost = asar
      .extractFile(tempAsar, HOST_PRELOAD_PATH)
      .toString('utf8');
    if (
      !patchedHost.includes(TVMOD_MARKER_START) ||
      !patchedHost.includes(TVMOD_MARKER_END)
    ) {
      throw new Error('rebuilt ASAR failed preload verification');
    }

    const packageJson = JSON.parse(
      asar.extractFile(tempAsar, 'package.json').toString('utf8')
    ) as { version?: string };
    if (version && packageJson.version !== version) {
      throw new Error('rebuilt ASAR changed the app version; refusing to install');
    }

    verifyUnpackedNativeModules(asarPath, tempAsar);

    return { tempAsar, tempDir, version };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export function installAsarElevated(
  sourceAsar: string,
  targetAsar: string
): void {
  if ((process.getuid?.() ?? -1) === 0) {
    installAsar(sourceAsar, targetAsar);
    return;
  }

  const targetDir = path.dirname(targetAsar);
  const tempTarget = path.join(
    targetDir,
    `.app.asar.tvmod-elevated-${process.pid}-${Date.now()}.tmp`
  );

  const script = [
    '/usr/bin/install -m 0644 "$1" "$2" || { /usr/bin/rm -f "$2"; exit 1; }',
    '/usr/bin/mv -f "$2" "$3" || exit 1',
  ].join('\n');

  const args = ['/bin/sh', '-c', script, 'sh', sourceAsar, tempTarget, targetAsar];

  let result = spawnSync('sudo', args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    result = spawnSync('pkexec', args, { stdio: 'inherit' });
  }

  if (result.error || result.status !== 0) {
    throw new Error(
      'elevation failed; app.asar was not replaced. Install sudo or pkexec and try again.'
    );
  }

  asar.uncacheAll();
}

export function installAsar(sourceAsar: string, targetAsar: string): void {
  const targetDir = path.dirname(targetAsar);
  const tempTarget = path.join(
    targetDir,
    `.app.asar.tvmod-${process.pid}-${Date.now()}.tmp`
  );

  try {
    fs.copyFileSync(sourceAsar, tempTarget);
    fs.chmodSync(tempTarget, 0o644);
    fs.renameSync(tempTarget, targetAsar);
    asar.uncacheAll();
  } finally {
    try {
      fs.unlinkSync(tempTarget);
    } catch {
      // Already renamed or never created.
    }
  }
}

export function backupAsar(
  asarPath: string,
  backupDir: string,
  version: string | null
): { backupPath: string; hash: string } {
  ensureDir(backupDir);

  const hash = sha256File(asarPath);
  const name = `app-${version ?? 'unknown'}-${hash.slice(0, 12)}.asar`;
  const backupPath = path.join(backupDir, name);

  if (fs.existsSync(backupPath)) {
    if (sha256File(backupPath) !== hash) {
      throw new Error(`backup hash mismatch: ${backupPath}`);
    }
    return { backupPath, hash };
  }

  fs.copyFileSync(asarPath, backupPath);
  if (sha256File(backupPath) !== hash) {
    fs.unlinkSync(backupPath);
    throw new Error('failed to create a verified ASAR backup');
  }

  return { backupPath, hash };
}

export function restoreAsar(backupPath: string, asarPath: string): void {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`backup not found: ${backupPath}`);
  }
  installAsar(backupPath, asarPath);
}

export function isAsarPatched(asarPath: string): boolean {
  try {
    const host = asar
      .extractFile(asarPath, HOST_PRELOAD_PATH)
      .toString('utf8');
    return host.includes(TVMOD_MARKER_START);
  } catch {
    return false;
  }
}

export function cleanupPatchedBuild(build: PatchedBuild): void {
  fs.rmSync(build.tempDir, { recursive: true, force: true });
}
