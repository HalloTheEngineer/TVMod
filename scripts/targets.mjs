export const TARGETS = {
  'linux-x64': {
    bun: 'bun-linux-x64',
    platform: 'linux',
    ext: '',
    archive: 'tar.gz',
  },
  'linux-arm64': {
    bun: 'bun-linux-arm64',
    platform: 'linux',
    ext: '',
    archive: 'tar.gz',
  },
  'darwin-x64': {
    bun: 'bun-darwin-x64',
    platform: 'darwin',
    ext: '',
    archive: 'tar.gz',
  },
  'darwin-arm64': {
    bun: 'bun-darwin-arm64',
    platform: 'darwin',
    ext: '',
    archive: 'tar.gz',
  },
  'windows-x64': {
    bun: 'bun-windows-x64',
    platform: 'win32',
    ext: '.exe',
    archive: 'zip',
  },
};

export function hostTarget() {
  if (process.platform === 'linux' && process.arch === 'x64') return 'linux-x64';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'linux-arm64';
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'darwin-arm64';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'darwin-x64';
  if (process.platform === 'win32' && process.arch === 'x64') return 'windows-x64';
  return null;
}

export function resolveTarget() {
  const id = process.env.TVMOD_TARGET ?? hostTarget();
  if (!id || !TARGETS[id]) {
    const supported = Object.keys(TARGETS).join(', ');
    throw new Error(
      `unsupported target ${id ?? `${process.platform}/${process.arch}`}; set TVMOD_TARGET to one of: ${supported}`
    );
  }
  return { id, ...TARGETS[id] };
}
