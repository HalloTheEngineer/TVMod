import {
  defaultConfig,
  normalizeConfig,
  type TvmodConfig,
} from './config.js';
import type { Host } from './host.js';
import { gearSvg, mountPanel, type PanelHandle } from './panel.js';
import { loadPluginSet } from './plugin-set.js';
import type { PanelPlugin } from './plugin-types.js';

const STYLE_ID = 'tvmod-native-settings-style';
const HOST_ID = 'tvmod-native-settings';
const TAB_ATTR = 'data-tvmod-tab';
const TAB_SELECTOR = `[${TAB_ATTR}="1"]`;
const WINDOW_STYLE = `
  #${HOST_ID} {
    grid-column: page;
    grid-row: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: none;
    overflow: hidden;
    background: var(--color-container-fill-tertiary-inverse, #14171b);
    color: var(--color-content-primary-neutral-bold, #e9ecef);
  }
  .dialog-settings[data-tvmod-active="1"] > #${HOST_ID} {
    display: block;
  }
  .dialog-settings[data-tvmod-active="1"] > .page-section {
    visibility: hidden;
    pointer-events: none;
  }
  [${TAB_ATTR}="1"] .tab-icon svg {
    width: 18px;
    height: 18px;
    display: block;
  }
  .dialog-settings[data-tvmod-active="1"] > .tabs-section .tab.selected:not([${TAB_ATTR}="1"]) {
    background-color: transparent !important;
    color: var(--color-content-primary-neutral-bold) !important;
  }
`;

export function isNativeSettingsLocation(
  protocol: string,
  pathname: string
): boolean {
  if (protocol !== 'file:') return false;
  const normalized = pathname.replace(/\\/g, '/');
  return /\/app\/dialog-window\/index\.html$/i.test(normalized);
}

let started = false;
let observer: MutationObserver | null = null;
let scheduled = false;
let activeRoot: HTMLElement | null = null;
let hostEl: HTMLElement | null = null;
let view: PanelHandle | null = null;
let active = false;
let focusPending = false;
let focusChecked = false;
let plugins: PanelPlugin[] = [];
let config: TvmodConfig = defaultConfig();
let panelVersion = '';
let registry: Host['registry'];
let bridge: Host['config'];
let focusBridge: Host['settingsFocus'];
const boundTabs = new WeakSet<HTMLElement>();

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    inspect();
  }, 60);
}

function ensureWindowStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = WINDOW_STYLE;
  (document.head ?? document.documentElement).append(style);
}

function makeTab(root: HTMLElement): HTMLButtonElement | null {
  const sample = root.querySelector<HTMLButtonElement>('.tabs-section .tab');
  if (!sample) return null;

  const tab = sample.cloneNode(true) as HTMLButtonElement;
  tab.classList.remove('selected');
  tab.tabIndex = -1;
  tab.setAttribute(TAB_ATTR, '1');
  tab.dataset.category = 'tvmod';
  tab.setAttribute('aria-label', 'TVMod settings');
  tab.removeAttribute('aria-current');

  const icon = tab.querySelector<HTMLElement>('.tab-icon');
  if (icon) icon.innerHTML = gearSvg();
  const label = tab.lastElementChild;
  if (label && label !== icon) label.textContent = 'TVMod';

  tab.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = tab.closest<HTMLElement>('.dialog-settings');
    if (target) activate(target, true);
  });

  root.querySelector('.tabs-section')?.append(tab);
  return tab;
}

function enforceSelection(root: HTMLElement): void {
  const tab = root.querySelector<HTMLButtonElement>(TAB_SELECTOR);
  if (!tab) return;

  root.dataset.tvmodActive = '1';
  tab.classList.add('selected');
  tab.tabIndex = 0;
  tab.setAttribute('aria-current', 'page');
}

function activate(root: HTMLElement, focus = false): void {
  active = true;
  enforceSelection(root);
  view?.refresh();
  if (focus) view?.focus();
}

function deactivate(root: HTMLElement): void {
  active = false;
  delete root.dataset.tvmodActive;
  const tab = root.querySelector<HTMLButtonElement>(TAB_SELECTOR);
  tab?.classList.remove('selected');
  tab?.removeAttribute('aria-current');
  tab?.setAttribute('tabindex', '-1');
}

function updateTheme(): void {
  const panel = hostEl?.querySelector<HTMLElement>('#tvmod-root');
  if (!panel) return;
  const root = document.documentElement;
  const theme =
    root.getAttribute('data-theme') === 'light' ||
    root.classList.contains('theme-light')
      ? 'light'
      : 'dark';
  if (panel.dataset.theme !== theme) panel.dataset.theme = theme;
}

function ensure(root: HTMLElement): void {
  ensureWindowStyle();

  if (!hostEl) {
    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
  }

  if (!view) {
    root.append(hostEl);
    view = mountPanel({
      version: panelVersion,
      plugins,
      embedded: true,
      container: hostEl,
      getConfig: () => config,
      setConfig: (next) => {
        config = next;
        bridge?.save(next);
      },
      defaultConfig: () => defaultConfig(plugins),
      registry,
      reloadPages: () => registry?.reload(),
    });
  } else if (hostEl.parentElement !== root) {
    root.append(hostEl);
  }

  updateTheme();

  if (!root.querySelector(TAB_SELECTOR)) {
    makeTab(root);
  }

  const tabsSection = root.querySelector<HTMLElement>('.tabs-section');
  if (tabsSection && !boundTabs.has(tabsSection)) {
    boundTabs.add(tabsSection);
    tabsSection.addEventListener(
      'click',
      (event) => {
        const tab = (event.target as Element | null)?.closest('.tab');
        if (tab && !tab.hasAttribute(TAB_ATTR)) deactivate(root);
      },
      true
    );
  }

  if (!focusChecked) {
    focusChecked = true;
    if (focusBridge?.consume()) focusPending = true;
  }

  if (focusPending) {
    focusPending = false;
    activate(root, true);
  } else if (active) {
    enforceSelection(root);
  }
}

function inspect(): void {
  const root = document.querySelector<HTMLElement>(
    '.dialog.settings .dialog-settings'
  );
  if (!root) return;
  activeRoot = root;
  ensure(root);
}

function startObserver(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  const target = document.documentElement;
  if (!target) {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    return;
  }
  observer = new MutationObserver(() => schedule());
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (!active || !activeRoot) return;
      if (
        !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(
          event.key
        )
      ) {
        return;
      }
      const path = event.composedPath();
      if (
        path.some(
          (node) =>
            node instanceof HTMLElement &&
            (node.id === HOST_ID || node.id === 'tvmod-root')
        )
      ) {
        return;
      }
      const targetElement = event.target as Element | null;
      if (targetElement?.closest?.(TAB_SELECTOR)) return;
      deactivate(activeRoot);
    },
    true
  );
  window.addEventListener('pagehide', () => observer?.disconnect(), {
    once: true,
  });
  schedule();
}

export function requestSettingsFocus(): void {
  focusPending = true;
  schedule();
}

export function startNativeSettings(version: string, host: Host): void {
  if (started) return;
  if (!host.config) return;
  started = true;

  const pluginSet = loadPluginSet();
  plugins = pluginSet.plugins;
  panelVersion = version;
  registry = host.registry;
  bridge = host.config;
  focusBridge = host.settingsFocus;

  const snapshot = bridge?.load();
  if (snapshot?.exists && snapshot.config && !snapshot.error) {
    config = normalizeConfig(snapshot.config, plugins);
  } else {
    config = defaultConfig(plugins);
    if (snapshot?.error) {
      console.error('[tvmod] config load failed:', snapshot.error);
    }
    bridge?.request?.();
  }

  bridge?.onChange((raw) => {
    config = normalizeConfig(raw, plugins);
    view?.refresh();
  });
  focusBridge?.onChange(() => requestSettingsFocus());

  startObserver();
}
