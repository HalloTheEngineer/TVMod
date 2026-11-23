import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, registryInstallsFile } from './paths.js';

export interface RegistryInstallRecord {
  registry: string;
  indexUrl: string;
  version: string;
  installedAt: string;
}

interface RegistryInstallsFile {
  schema: 1;
  installs: Record<string, RegistryInstallRecord>;
}

const PLUGIN_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const REGISTRY_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const MAX_RECORDS = 500;

function emptyFile(): RegistryInstallsFile {
  return { schema: 1, installs: {} };
}

function validRecord(value: unknown): value is RegistryInstallRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.registry === 'string' &&
    REGISTRY_NAME.test(record.registry) &&
    typeof record.indexUrl === 'string' &&
    record.indexUrl.length > 0 &&
    record.indexUrl.length <= 2048 &&
    typeof record.version === 'string' &&
    record.version.length > 0 &&
    record.version.length <= 64 &&
    typeof record.installedAt === 'string'
  );
}

export function loadRegistryInstalls(): RegistryInstallsFile {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(registryInstallsFile, 'utf8')
    ) as Partial<RegistryInstallsFile>;
    if (parsed.schema !== 1 || !parsed.installs || typeof parsed.installs !== 'object') {
      return emptyFile();
    }

    const installs: Record<string, RegistryInstallRecord> = {};
    for (const [id, record] of Object.entries(parsed.installs)) {
      if (!PLUGIN_ID.test(id) || !validRecord(record)) continue;
      installs[id] = {
        registry: record.registry,
        indexUrl: record.indexUrl,
        version: record.version,
        installedAt: record.installedAt,
      };
    }
    return { schema: 1, installs };
  } catch {
    return emptyFile();
  }
}

export function saveRegistryInstalls(file: RegistryInstallsFile): void {
  ensureDir(path.dirname(registryInstallsFile));
  const entries = Object.entries(file.installs).slice(0, MAX_RECORDS);
  const temp = `${registryInstallsFile}.tmp`;
  fs.writeFileSync(
    temp,
    `${JSON.stringify(
      { schema: 1, installs: Object.fromEntries(entries) },
      null,
      2
    )}\n`,
    { mode: 0o644 }
  );
  fs.renameSync(temp, registryInstallsFile);
}

export function getRegistryInstall(
  id: string
): RegistryInstallRecord | undefined {
  return loadRegistryInstalls().installs[id];
}

export function recordRegistryInstall(
  id: string,
  record: RegistryInstallRecord
): void {
  if (!PLUGIN_ID.test(id)) throw new Error(`invalid plugin id: ${id}`);
  if (!validRecord(record)) throw new Error('invalid registry install record');
  const file = loadRegistryInstalls();
  file.installs[id] = record;
  saveRegistryInstalls(file);
}

export function clearRegistryInstall(id: string): void {
  const file = loadRegistryInstalls();
  if (!(id in file.installs)) return;
  delete file.installs[id];
  saveRegistryInstalls(file);
}
