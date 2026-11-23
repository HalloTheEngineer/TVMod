import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  inferFlavor,
  inspectInstallPath,
  installRoot,
} from '../src/lib/app-detect.js';
import { computePaths } from '../src/lib/paths.js';

test('platform paths follow native config locations', () => {
  const linux = computePaths('linux', '/home/u', {});
  assert.equal(linux.configDir, '/home/u/.config/tvmod');
  assert.equal(linux.wrapperPath, '/home/u/.local/bin/tvmod');
  assert.equal(linux.desktopFile, '/home/u/.local/share/applications/tradingview.desktop');

  const mac = computePaths('darwin', '/Users/u', {});
  assert.equal(mac.configDir, '/Users/u/Library/Application Support/tvmod');
  assert.equal(mac.logsDir, '/Users/u/Library/Logs/tvmod');
  assert.equal(mac.wrapperPath, '/Users/u/.local/bin/tvmod');

  const win = computePaths('win32', '/Users/u', {
    APPDATA: '/win/roaming',
    LOCALAPPDATA: '/win/local',
  });
  assert.equal(win.configDir, path.join('/win/roaming', 'tvmod'));
  assert.equal(
    win.wrapperPath,
    path.join('/win/local', 'tvmod', 'bin', 'tvmod.cmd')
  );
  assert.match(win.desktopFile, /TradingView \(TVMod\)\.lnk$/);
});

test('inspectInstallPath detects Linux, macOS, Windows, and MSIX layouts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tvmod-platform-'));

  try {
    const linuxDir = path.join(root, 'linux');
    fs.mkdirSync(path.join(linuxDir, 'resources'), { recursive: true });
    fs.writeFileSync(path.join(linuxDir, 'tradingview'), '');
    fs.writeFileSync(path.join(linuxDir, 'resources', 'app.asar'), '');
    const linux = inspectInstallPath(linuxDir, 'linux');
    assert.equal(linux?.flavor, 'custom');
    assert.equal(linux?.asar, path.join(linuxDir, 'resources', 'app.asar'));

    const appDir = path.join(root, 'TradingView.app');
    fs.mkdirSync(path.join(appDir, 'Contents', 'MacOS'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'Contents', 'Resources'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'Contents', 'MacOS', 'TradingView'), '');
    fs.writeFileSync(path.join(appDir, 'Contents', 'Resources', 'app.asar'), '');
    const mac = inspectInstallPath(appDir, 'darwin');
    assert.equal(mac?.flavor, 'macos');
    assert.equal(mac?.realExe, path.join(appDir, 'Contents', 'MacOS', 'TradingView'));
    assert.equal(
      mac?.asar,
      path.join(appDir, 'Contents', 'Resources', 'app.asar')
    );
    assert.equal(mac ? installRoot(mac) : null, appDir);

    const winDir = path.join(root, 'TradingView');
    fs.mkdirSync(path.join(winDir, 'resources'), { recursive: true });
    fs.writeFileSync(path.join(winDir, 'TradingView.exe'), '');
    fs.writeFileSync(path.join(winDir, 'resources', 'app.asar'), '');
    const win = inspectInstallPath(winDir, 'win32');
    assert.equal(win?.flavor, 'windows');
    assert.equal(win?.realExe, path.join(winDir, 'TradingView.exe'));
    assert.equal(win?.asar, path.join(winDir, 'resources', 'app.asar'));

    const msixDir = path.join(
      root,
      'WindowsApps',
      'TradingView.Desktop_1.0.0_x64__test'
    );
    const msix = inspectInstallPath(msixDir, 'win32');
    assert.equal(msix?.flavor, 'msix');
    assert.equal(msix?.exe, path.join(msixDir, 'TradingView.exe'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('flavor inference is platform-aware', () => {
  assert.equal(
    inferFlavor('/Applications/TradingView.app/Contents/MacOS/TradingView', 'darwin'),
    'macos'
  );
  assert.equal(
    inferFlavor('C:\\Program Files\\WindowsApps\\TradingView\\TradingView.exe', 'win32'),
    'msix'
  );
  assert.equal(
    inferFlavor('C:\\Program Files\\TradingView\\TradingView.exe', 'win32'),
    'windows'
  );
  assert.equal(inferFlavor('/snap/bin/tradingview', 'linux'), 'snap');
});
