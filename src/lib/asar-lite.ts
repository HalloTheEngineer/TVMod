import fs from 'node:fs';

interface AsarFileEntry {
  size?: number;
  offset?: string;
  unpacked?: boolean;
  files?: Record<string, AsarFileEntry>;
}

interface AsarHeader {
  files?: Record<string, AsarFileEntry>;
}

export interface AsarPackageJson {
  name?: string;
  version?: string;
  main?: string;
  [key: string]: unknown;
}

function readHeader(asarPath: string): {
  header: AsarHeader;
  dataBase: number;
} {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const head = Buffer.alloc(16);
    const read = fs.readSync(fd, head, 0, 16, 0);
    if (read < 16) throw new Error('ASAR header is truncated');

    const headerPickleSize = head.readUInt32LE(4);
    const headerStringSize = head.readUInt32LE(12);

    if (headerStringSize <= 0 || headerStringSize > 64 * 1024 * 1024) {
      throw new Error('ASAR header size is invalid');
    }

    const jsonBuffer = Buffer.alloc(headerStringSize);
    fs.readSync(fd, jsonBuffer, 0, headerStringSize, 16);
    const header = JSON.parse(jsonBuffer.toString('utf8')) as AsarHeader;

    return { header, dataBase: 8 + headerPickleSize };
  } finally {
    fs.closeSync(fd);
  }
}

function readEntry(asarPath: string, entry: AsarFileEntry): Buffer {
  if (entry.unpacked) {
    throw new Error('file is unpacked and not inside app.asar');
  }
  if (entry.offset === undefined || entry.size === undefined) {
    throw new Error('file entry has no data');
  }

  const { dataBase } = readHeader(asarPath);
  const fd = fs.openSync(asarPath, 'r');
  try {
    const offset = dataBase + Number(entry.offset);
    const data = Buffer.alloc(entry.size);
    fs.readSync(fd, data, 0, entry.size, offset);
    return data;
  } finally {
    fs.closeSync(fd);
  }
}

export function readAsarPackageJson(asarPath: string): AsarPackageJson {
  const { header } = readHeader(asarPath);
  const entry = header.files?.['package.json'];
  if (!entry) throw new Error('package.json not found in app.asar');
  return JSON.parse(readEntry(asarPath, entry).toString('utf8')) as AsarPackageJson;
}

export function listAsarTopLevel(asarPath: string): string[] {
  const { header } = readHeader(asarPath);
  return Object.keys(header.files ?? {});
}
