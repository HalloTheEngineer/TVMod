import { contextBridge, ipcRenderer, webFrame } from 'electron';
import { start } from './core/index.js';
import type {
  ConfigLoadResult,
  Host,
  RegistryActionResult,
  RegistryInstallResult,
  RegistryKeyResult,
  RegistryListResult,
  RegistryReloadResult,
  RegistrySourcesResult,
} from './core/host.js';
import {
  isNativeSettingsLocation,
  startNativeSettings,
} from './core/native-settings.js';
import { TVMOD_VERSION } from './version.js';

const VERSION = TVMOD_VERSION;

function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function isSupportedPage(): boolean {
  if (!isTopFrame()) return false;

  const host = location.hostname;
  if (host.startsWith('auth.')) return false;
  if (host !== 'tradingview.com' && !host.endsWith('.tradingview.com')) {
    return false;
  }

  if (
    /^\/(accounts|order|checkout|billing|payments|login|signup|pricing|gopro|black-friday)/i.test(
      location.pathname
    )
  ) {
    return false;
  }

  return true;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function hasConfigBridge(): boolean {
  try {
    return ipcRenderer.sendSync('tvmod:config:probe') === true;
  } catch {
    return false;
  }
}

function registryClient(): NonNullable<Host['registry']> {
  return {
    list: () =>
      ipcRenderer.invoke(
        'tvmod:registry:list'
      ) as Promise<RegistryListResult>,
    sources: () =>
      ipcRenderer.invoke(
        'tvmod:registry:sources'
      ) as Promise<RegistrySourcesResult>,
    add: (name, url, publicKey) =>
      ipcRenderer.invoke(
        'tvmod:registry:add',
        name,
        url,
        publicKey
      ) as Promise<RegistryActionResult>,
    remove: (name) =>
      ipcRenderer.invoke(
        'tvmod:registry:remove',
        name
      ) as Promise<RegistryActionResult>,
    pickKey: () =>
      ipcRenderer.invoke('tvmod:registry:pick-key') as Promise<RegistryKeyResult>,
    install: (id, registry, force, noReload) =>
      ipcRenderer.invoke(
        'tvmod:registry:install',
        id,
        registry,
        force,
        noReload
      ) as Promise<RegistryInstallResult>,
    reload: () =>
      ipcRenderer.invoke('tvmod:reload') as Promise<RegistryReloadResult>,
  };
}

function configBridge(): NonNullable<Host['config']> {
  return {
    load: (): ConfigLoadResult => {
      try {
        const result = ipcRenderer.sendSync('tvmod:config:load');
        if (!result || typeof result !== 'object') {
          return { exists: false };
        }
        return result as ConfigLoadResult;
      } catch {
        return { exists: false };
      }
    },
    save: (config) => {
      try {
        ipcRenderer.send('tvmod:config:save', config);
      } catch (error) {
        console.error('[tvmod] config save failed', error);
      }
    },
    migrate: (config) => {
      try {
        ipcRenderer.send('tvmod:config:migrate', config);
      } catch (error) {
        console.error('[tvmod] config migration failed', error);
      }
    },
    onChange: (handler) => {
      ipcRenderer.on('tvmod:config:changed', (_event, config) =>
        handler(config)
      );
    },
    request: () => {
      ipcRenderer.send('tvmod:config:request');
    },
    onRequest: (handler) => {
      ipcRenderer.on('tvmod:config:request', () => handler());
    },
  };
}

function settingsFocusBridge(): NonNullable<Host['settingsFocus']> {
  return {
    consume: () => {
      try {
        return ipcRenderer.sendSync('tvmod:settings-focus') === true;
      } catch {
        return false;
      }
    },
    onChange: (handler) => {
      ipcRenderer.on('tvmod:focus-settings-tab', () => handler());
    },
  };
}

function createHost(): Host {
  const bridged = hasConfigBridge();
  const host: Host = {
    executeJavaScript: (code) => webFrame.executeJavaScript(code),
    insertCSS: (css) => webFrame.insertCSS(css),
    removeInsertedCSS: (key) => webFrame.removeInsertedCSS(key),
    registry: registryClient(),
  };

  if (bridged) {
    host.config = configBridge();
    host.settingsFocus = settingsFocusBridge();
  }

  return host;
}

if (isNativeSettingsLocation(location.protocol, location.pathname)) {
  const host = createHost();
  if (host.config) startNativeSettings(VERSION, host);
} else if (isSupportedPage()) {
  const host = createHost();
  try {
    contextBridge.exposeInMainWorld('__TVMOD__', {
      version: VERSION,
      mode: 'desktop-preload',
    });
  } catch (error) {
    console.error('[tvmod] contextBridge failed', error);
  }

  start(VERSION, host);

  if (host.config) {
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.repeat) return;
        if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) {
          return;
        }
        if (event.code !== 'KeyM' || isEditableTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        ipcRenderer.send('tvmod:open-settings');
      },
      true
    );
  }
}
