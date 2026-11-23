import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { AppInstall } from './app-detect.js';
import {
  desktopBackupFile,
  desktopDir,
  desktopFile,
  ensureDir,
  isStandaloneBinary,
  vanillaDesktopFile,
  wrapperBackupFile,
  wrapperPath as wrapperFilePath,
} from './paths.js';
import { quoteDesktopArg } from './util.js';

const DESKTOP_MARKER = 'X-TVMod=true';
const WRAPPER_MARKER = '# tvmod wrapper';

function fileContains(filePath: string, needle: string): boolean {
  try {
    return fs.readFileSync(filePath, 'utf8').includes(needle);
  } catch {
    return false;
  }
}

function backupOnce(filePath: string, backupPath: string): void {
  if (!fs.existsSync(filePath)) return;
  if (fs.existsSync(backupPath)) return;
  fs.copyFileSync(filePath, backupPath);
}

export function writeWrapper(cliEntry: string): string {
  ensureDir(wrapperFilePath.replace(/\/[^/]+$/, ''));

  if (fs.existsSync(wrapperBackupFile)) {
    // Keep the original backup; do not clobber it.
  } else if (
    fs.existsSync(wrapperFilePath) &&
    !fileContains(wrapperFilePath, WRAPPER_MARKER)
  ) {
    backupOnce(wrapperFilePath, wrapperBackupFile);
  }

  const standalone = isStandaloneBinary();
  const content = standalone
    ? `#!/bin/sh\n${WRAPPER_MARKER}\nexec ${quoteDesktopArg(process.execPath)} "$@"\n`
    : `#!/bin/sh\n${WRAPPER_MARKER}\nexec ${quoteDesktopArg(
        process.execPath
      )} ${quoteDesktopArg(cliEntry)} "$@"\n`;

  fs.writeFileSync(wrapperFilePath, content, { mode: 0o755 });
  fs.chmodSync(wrapperFilePath, 0o755);
  return wrapperFilePath;
}

export function removeWrapper(): void {
  if (fileContains(wrapperFilePath, WRAPPER_MARKER)) {
    try {
      fs.unlinkSync(wrapperFilePath);
    } catch {
      // Nothing to remove.
    }
    if (fs.existsSync(wrapperBackupFile)) {
      fs.renameSync(wrapperBackupFile, wrapperFilePath);
    }
  }
}

function desktopContent(options: {
  name: string;
  comment: string;
  exec: string;
  mime?: boolean;
}): string {
  return `[Desktop Entry]
Type=Application
Name=${options.name}
Comment=${options.comment}
Exec=${options.exec}
Icon=tradingview
Terminal=false
Categories=Office;Finance;
${options.mime ? 'MimeType=x-scheme-handler/tradingview;\n' : ''}StartupWMClass=TradingView
${DESKTOP_MARKER}
`;
}

export function writeDesktopEntries(
  install: AppInstall,
  wrapper: string
): { desktop: string; vanilla: string } {
  ensureDir(desktopDir);

  if (
    fs.existsSync(desktopFile) &&
    !fileContains(desktopFile, DESKTOP_MARKER)
  ) {
    backupOnce(desktopFile, desktopBackupFile);
  }

  const moddedExec = `${quoteDesktopArg(wrapper)} launch %U`;
  fs.writeFileSync(
    desktopFile,
    desktopContent({
      name: 'TradingView',
      comment: 'TradingView with local mods (TVMod)',
      exec: moddedExec,
      mime: true,
    }),
    { mode: 0o644 }
  );

  const vanillaExec =
    install.flavor === 'snap'
      ? 'snap run tradingview %U'
      : `${quoteDesktopArg(install.exe)} %U`;

  if (
    !fs.existsSync(vanillaDesktopFile) ||
    fileContains(vanillaDesktopFile, DESKTOP_MARKER)
  ) {
    fs.writeFileSync(
      vanillaDesktopFile,
      desktopContent({
        name: 'TradingView (Vanilla)',
        comment: 'TradingView without TVMod',
        exec: vanillaExec,
        mime: false,
      }),
      { mode: 0o644 }
    );
  }

  updateDesktopDatabase();
  return { desktop: desktopFile, vanilla: vanillaDesktopFile };
}

export function removeDesktopEntries(): void {
  if (fileContains(desktopFile, DESKTOP_MARKER)) {
    try {
      fs.unlinkSync(desktopFile);
    } catch {
      // Nothing to remove.
    }
    if (fs.existsSync(desktopBackupFile)) {
      fs.renameSync(desktopBackupFile, desktopFile);
    }
  }

  if (fileContains(vanillaDesktopFile, DESKTOP_MARKER)) {
    try {
      fs.unlinkSync(vanillaDesktopFile);
    } catch {
      // Nothing to remove.
    }
  }

  updateDesktopDatabase();
}

export function hasModdedDesktopEntry(): boolean {
  return fileContains(desktopFile, DESKTOP_MARKER);
}

export function updateDesktopDatabase(): void {
  spawnSync('update-desktop-database', [desktopDir], { stdio: 'ignore' });
}
