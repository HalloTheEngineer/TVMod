import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { installRoot, type AppInstall } from './app-detect.js';
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
import { warn } from './logger.js';

const DESKTOP_MARKER = 'X-TVMod=true';
const WRAPPER_MARKER = 'tvmod wrapper';
const WINDOWS_OWNED_MARKER = `${desktopFile}.tvmod-owned`;
const WINDOWS_VANILLA_OWNED_MARKER = `${vanillaDesktopFile}.tvmod-owned`;

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

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function writeWindowsWrapper(cliEntry: string): string {
  ensureDir(path.dirname(wrapperFilePath));

  if (
    fs.existsSync(wrapperFilePath) &&
    !fileContains(wrapperFilePath, WRAPPER_MARKER)
  ) {
    backupOnce(wrapperFilePath, wrapperBackupFile);
  }

  const standalone = isStandaloneBinary();
  const command = standalone
    ? `${cmdQuote(process.execPath)} %*`
    : `${cmdQuote(process.execPath)} ${cmdQuote(cliEntry)} %*`;
  const content = `@echo off\r\nrem ${WRAPPER_MARKER}\r\n${command}\r\n`;

  fs.writeFileSync(wrapperFilePath, content);
  return wrapperFilePath;
}

function writePosixWrapper(cliEntry: string): string {
  ensureDir(path.dirname(wrapperFilePath));

  if (
    fs.existsSync(wrapperFilePath) &&
    !fileContains(wrapperFilePath, WRAPPER_MARKER)
  ) {
    backupOnce(wrapperFilePath, wrapperBackupFile);
  }

  const standalone = isStandaloneBinary();
  const content = standalone
    ? `#!/bin/sh\n# ${WRAPPER_MARKER}\nexec ${quoteDesktopArg(process.execPath)} "$@"\n`
    : `#!/bin/sh\n# ${WRAPPER_MARKER}\nexec ${quoteDesktopArg(
        process.execPath
      )} ${quoteDesktopArg(cliEntry)} "$@"\n`;

  fs.writeFileSync(wrapperFilePath, content, { mode: 0o755 });
  fs.chmodSync(wrapperFilePath, 0o755);
  return wrapperFilePath;
}

export function writeWrapper(cliEntry: string): string {
  return process.platform === 'win32'
    ? writeWindowsWrapper(cliEntry)
    : writePosixWrapper(cliEntry);
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

function writeLinuxDesktopEntries(
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

function writeMacLaunchers(
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

  fs.writeFileSync(
    desktopFile,
    `#!/bin/sh\n# ${DESKTOP_MARKER}\nexec ${shellQuote(wrapper)} launch "$@"\n`,
    { mode: 0o755 }
  );
  fs.chmodSync(desktopFile, 0o755);

  if (
    !fs.existsSync(vanillaDesktopFile) ||
    fileContains(vanillaDesktopFile, DESKTOP_MARKER)
  ) {
    const args = install.baseArgs.map(shellQuote).join(' ');
    fs.writeFileSync(
      vanillaDesktopFile,
      `#!/bin/sh\n# ${DESKTOP_MARKER}\nexec ${shellQuote(
        install.command
      )}${args ? ` ${args}` : ''} "$@"\n`,
      { mode: 0o755 }
    );
    fs.chmodSync(vanillaDesktopFile, 0o755);
  }

  return { desktop: desktopFile, vanilla: vanillaDesktopFile };
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function writeWindowsShortcut(
  shortcut: string,
  target: string,
  args: string,
  icon: string,
  workingDirectory: string
): void {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$ws = New-Object -ComObject WScript.Shell',
    `$s = $ws.CreateShortcut(${psQuote(shortcut)})`,
    `$s.TargetPath = ${psQuote(target)}`,
    `$s.Arguments = ${psQuote(args)}`,
    `$s.WorkingDirectory = ${psQuote(workingDirectory)}`,
    `$s.IconLocation = ${psQuote(`${icon},0`)}`,
    '$s.WindowStyle = 7',
    '$s.Save()',
  ].join('\r\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvmod-shortcut-'));
  const scriptPath = path.join(tempDir, 'shortcut.ps1');
  fs.writeFileSync(scriptPath, script);
  try {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
      ],
      { encoding: 'utf8', windowsHide: true }
    );
    if (result.error || result.status !== 0) {
      warn(
        `could not create shortcut ${shortcut}: ${
          result.error?.message || result.stderr?.trim() || 'powershell failed'
        }`
      );
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeWindowsShortcuts(
  install: AppInstall,
  wrapper: string
): { desktop: string; vanilla: string } {
  ensureDir(desktopDir);
  const root = installRoot(install);
  const icon = install.exe;
  const vanillaBackup = `${vanillaDesktopFile}.tvmod-backup`;

  if (fs.existsSync(desktopFile) && !fs.existsSync(WINDOWS_OWNED_MARKER)) {
    backupOnce(desktopFile, desktopBackupFile);
  }
  if (
    fs.existsSync(vanillaDesktopFile) &&
    !fs.existsSync(WINDOWS_VANILLA_OWNED_MARKER)
  ) {
    backupOnce(vanillaDesktopFile, vanillaBackup);
  }

  writeWindowsShortcut(desktopFile, wrapper, 'launch', icon, root);
  writeWindowsShortcut(vanillaDesktopFile, install.exe, '', icon, root);
  fs.writeFileSync(WINDOWS_OWNED_MARKER, 'tvmod\n');
  fs.writeFileSync(WINDOWS_VANILLA_OWNED_MARKER, 'tvmod\n');

  return { desktop: desktopFile, vanilla: vanillaDesktopFile };
}

export function writeDesktopEntries(
  install: AppInstall,
  wrapper: string
): { desktop: string; vanilla: string } {
  if (process.platform === 'win32') {
    return writeWindowsShortcuts(install, wrapper);
  }
  if (process.platform === 'darwin') {
    return writeMacLaunchers(install, wrapper);
  }
  return writeLinuxDesktopEntries(install, wrapper);
}

export function removeDesktopEntries(): void {
  if (process.platform === 'win32') {
    if (fs.existsSync(WINDOWS_OWNED_MARKER)) {
      if (fs.existsSync(desktopFile)) fs.rmSync(desktopFile, { force: true });
      if (fs.existsSync(desktopBackupFile)) {
        fs.renameSync(desktopBackupFile, desktopFile);
      }
      fs.rmSync(WINDOWS_OWNED_MARKER, { force: true });
    }
    if (fs.existsSync(WINDOWS_VANILLA_OWNED_MARKER)) {
      if (fs.existsSync(vanillaDesktopFile)) {
        fs.rmSync(vanillaDesktopFile, { force: true });
      }
      const vanillaBackup = `${vanillaDesktopFile}.tvmod-backup`;
      if (fs.existsSync(vanillaBackup)) {
        fs.renameSync(vanillaBackup, vanillaDesktopFile);
      }
      fs.rmSync(WINDOWS_VANILLA_OWNED_MARKER, { force: true });
    }
    return;
  }

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

  if (process.platform !== 'darwin') updateDesktopDatabase();
}

export function hasModdedDesktopEntry(): boolean {
  if (process.platform === 'win32') {
    return fs.existsSync(WINDOWS_OWNED_MARKER);
  }
  return fileContains(desktopFile, DESKTOP_MARKER);
}

export function updateDesktopDatabase(): void {
  if (process.platform !== 'linux') return;
  spawnSync('update-desktop-database', [desktopDir], { stdio: 'ignore' });
}
