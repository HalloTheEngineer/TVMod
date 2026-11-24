import {
  defaultConfig,
  isPluginEnabled,
  withPluginEnabled,
  withPluginSetting,
  type TvmodConfig,
} from './config.js';
import type {
  RegistryClient,
  RegistryPluginInfo,
  RegistrySource,
} from './host.js';
import { planRegistryUpdates } from './registry-updates.js';
import {
  PLUGIN_CATEGORY_LABELS,
  PLUGIN_CATEGORY_ORDER,
  type PanelPlugin,
  type PluginCategory,
  type PluginSettingValue,
} from './plugin-types.js';

const PANEL_ID = 'tvmod-root';

const PANEL_STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }

  .fab {
    pointer-events: auto;
    position: fixed;
    right: 14px;
    bottom: 70px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border: 1px solid #3a3f46;
    border-radius: 11px;
    background: #14171b;
    color: #f4f6f8;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }
  .fab:hover { background: #1d2229; }
  .fab svg { width: 18px; height: 18px; }
  .dot {
    position: absolute; top: 5px; right: 5px; width: 7px; height: 7px;
    border-radius: 50%; background: #ff8a3d; box-shadow: 0 0 0 2px #14171b;
  }

  .backdrop {
    pointer-events: auto; position: fixed; inset: 0; z-index: 10;
    background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(2px);
  }

  .modal {
    pointer-events: auto; position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%); z-index: 11;
    display: flex; flex-direction: column;
    width: min(860px, calc(100vw - 48px));
    max-height: min(900px, calc(100vh - 48px)); overflow: hidden;
    border: 1px solid #3a3f46; border-radius: 14px; background: #14171b;
    color: #e9ecef;
    font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
  }

  .header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px; padding: 15px 16px 10px;
  }
  .title { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: 0.2px; }
  .subtitle { margin-top: 2px; color: #8f98a3; font-size: 11px; }
  .close {
    flex: none; width: 26px; height: 26px; border: 1px solid #3a3f46;
    border-radius: 8px; background: #1d2229; color: #cfd5dc;
    font: 18px/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer;
  }
  .close:hover { background: #262c34; }

  .toolbar {
    display: flex; gap: 8px; align-items: center; padding: 0 16px 10px;
  }
  .search {
    flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid #3a3f46;
    border-radius: 8px; background: #0f1216; color: #e9ecef;
    font: inherit; outline: none;
  }
  .search:focus { border-color: #4c8dff; }
  .count { flex: none; color: #8f98a3; font-size: 11px; white-space: nowrap; }

  .plugins { min-height: 0; overflow: auto; padding: 0 12px 12px; }

  .plugin-category + .plugin-category { margin-top: 10px; }
  .category-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; margin: 0 4px 4px; padding: 5px 6px 5px;
    border-bottom: 1px solid #22272e;
  }
  .category-title {
    color: #77808b; font-size: 9.5px; font-weight: 700;
    letter-spacing: 0.7px; text-transform: uppercase;
  }
  .category-count {
    padding: 0 5px; border: 1px solid #2b3138; border-radius: 999px;
    color: #77808b; font-size: 9px;
  }

  .plugin {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 14px; padding: 11px 10px; border: 1px solid transparent; border-radius: 10px;
  }
  .plugin + .plugin { margin-top: 2px; }
  .plugin[data-enabled="true"] { border-color: #2b3138; background: #171b20; }
  .plugin[data-error="true"] { border-color: #5b2b2b; background: #201616; }

  .plugin-info { min-width: 0; flex: 1; }
  .plugin-name {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    font-size: 12.5px; font-weight: 650;
  }
  .plugin-desc { margin-top: 3px; color: #929ba6; font-size: 11px; }
  .plugin-meta { margin-top: 3px; color: #6f7883; font-size: 10px; }

  .badge {
    padding: 1px 5px; border: 1px solid #4b3a23; border-radius: 4px;
    background: #2a2117; color: #ffb36b; font-size: 9px; font-weight: 650;
    letter-spacing: 0.4px; text-transform: uppercase;
  }
  .badge.external { border-color: #28405a; background: #16222e; color: #8fc2ff; }
  .badge.error {
    border-color: #5b2b2b; background: #2a1616; color: #ff9b9b;
    text-transform: none; letter-spacing: 0;
  }

  .switch {
    flex: none; position: relative; display: inline-block; width: 36px; height: 20px;
    margin-top: 2px; cursor: pointer;
  }
  .switch input { position: absolute; width: 0; height: 0; opacity: 0; }
  .slider {
    position: absolute; inset: 0; border-radius: 999px; background: #30363e;
    transition: background 120ms ease;
  }
  .slider::before {
    content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px;
    border-radius: 50%; background: #cfd5dc; transition: transform 120ms ease;
  }
  .switch input:checked + .slider { background: #4c8dff; }
  .switch input:checked + .slider::before { transform: translateX(16px); background: #fff; }
  .switch input:focus-visible + .slider { outline: 2px solid #4c8dff; outline-offset: 2px; }

  .switch.small { width: 30px; height: 16px; margin-top: 0; }
  .switch.small .slider::before { top: 3px; left: 3px; width: 10px; height: 10px; }
  .switch.small input:checked + .slider::before { transform: translateX(14px); }

  .plugin-settings {
    margin-top: 7px; padding-top: 6px; border-top: 1px solid #262b32;
  }
  .plugin-setting {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 3px 0; cursor: pointer;
  }
  .plugin-setting span { color: #b7c0c9; font-size: 11px; }
  .plugin-setting-stack {
    display: grid; grid-template-columns: minmax(0, 1fr);
    align-items: stretch; gap: 4px; padding: 5px 0; cursor: default;
  }
  .plugin-setting-stack > span { color: #b7c0c9; font-size: 11px; }
  .setting-input, .setting-select {
    width: 100%; min-width: 0; padding: 5px 7px;
    border: 1px solid #3a3f46; border-radius: 6px;
    background: #0f1216; color: #e9ecef; font: inherit; font-size: 11px;
    outline: none;
  }
  .setting-input:focus, .setting-select:focus { border-color: #4c8dff; }

  .plugin-error { margin-top: 6px; color: #ff9b9b; font-size: 10.5px; }
  .empty { padding: 24px 12px; color: #8f98a3; text-align: center; }

  .tabs { display: flex; gap: 4px; padding: 0 16px 10px; }
  .tab {
    padding: 5px 10px; border: 1px solid transparent; border-radius: 7px;
    background: transparent; color: #8f98a3;
    font: inherit; font-weight: 650; cursor: pointer;
  }
  .tab:hover { background: #1a1f25; color: #cfd5dc; }
  .tab[data-active="true"] {
    border-color: #3a3f46; background: #1d2229; color: #e9ecef;
  }

  .registry { min-height: 0; overflow: auto; padding: 0 10px 10px; }
  .registry-bar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; padding: 2px 6px 8px;
  }
  .registry-status { color: #8f98a3; font-size: 11px; }
  .registry-status[data-error="true"] { color: #ff9b9b; }
  .registry-refresh {
    flex: none; padding: 3px 8px; border: 1px solid #3a3f46; border-radius: 6px;
    background: #1d2229; color: #cfd5dc; font: inherit; font-size: 10.5px;
    cursor: pointer;
  }
  .registry-refresh:hover { background: #262c34; }
  .registry-refresh:disabled { opacity: 0.55; cursor: default; }

  .registry-item {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 14px; padding: 10px; border: 1px solid #262b32; border-radius: 10px;
    background: #171b20;
  }
  .registry-item + .registry-item { margin-top: 4px; }
  .badge.version {
    border-color: #333a42; background: #1c2127; color: #9aa4ae;
    text-transform: none; letter-spacing: 0;
  }
  .install {
    flex: none; margin-top: 2px; padding: 5px 10px;
    border: 1px solid #2f4a6b; border-radius: 7px;
    background: #16222e; color: #8fc2ff;
    font: inherit; font-weight: 650; cursor: pointer;
  }
  .install:hover { background: #1b2c3d; }
  .install:disabled { opacity: 0.55; cursor: default; }

  .registry-status { flex: 1; min-width: 0; }
  .registry-tools {
    display: flex; align-items: center; justify-content: flex-end;
    flex-wrap: wrap; gap: 6px;
  }
  .registry-action {
    flex: none; padding: 3px 8px; border: 1px solid #3a3f46; border-radius: 6px;
    background: #1d2229; color: #cfd5dc; font: inherit; font-size: 10.5px;
    cursor: pointer;
  }
  .registry-action:hover { background: #262c34; }
  .registry-action:disabled { opacity: 0.55; cursor: default; }
  .registry-action.primary {
    border-color: #2f4a6b; background: #16222e; color: #8fc2ff;
  }
  .registry-action.primary:hover { background: #1b2c3d; }
  .registry-action.danger {
    border-color: #5b2b2b; background: #201616; color: #ff9b9b;
  }
  .registry-action.danger:hover { background: #2a1616; }

  .registry-manage {
    margin: 0 0 8px; border: 1px solid #262b32; border-radius: 10px;
    background: #171b20; overflow: hidden;
  }
  .registry-manage summary {
    padding: 9px 10px; color: #b7c0c9; font-weight: 650; cursor: pointer;
    list-style: none;
  }
  .registry-manage summary::-webkit-details-marker { display: none; }
  .registry-manage summary::before {
    content: "▸"; display: inline-block; width: 13px; color: #6f7883;
  }
  .registry-manage[open] summary::before { content: "▾"; }
  .registry-manage-body { padding: 0 10px 10px; }

  .registry-source {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 7px 0; border-top: 1px solid #262b32;
  }
  .registry-source-info { min-width: 0; }
  .registry-source-name { color: #e9ecef; font-size: 11.5px; font-weight: 650; }
  .registry-source-url {
    margin-top: 1px; color: #6f7883; font-size: 10px;
    word-break: break-all;
  }
  .registry-source-empty { padding: 8px 0 2px; color: #77808b; font-size: 10.5px; }

  .registry-form {
    display: grid; gap: 6px; margin-top: 8px; padding-top: 9px;
    border-top: 1px solid #262b32;
  }
  .registry-input, .registry-textarea {
    width: 100%; padding: 6px 8px; border: 1px solid #3a3f46;
    border-radius: 7px; background: #0f1216; color: #e9ecef;
    font: inherit; outline: none;
  }
  .registry-input:focus, .registry-textarea:focus { border-color: #4c8dff; }
  .registry-textarea {
    min-height: 62px; resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9.5px; line-height: 1.35;
  }
  .registry-form-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px;
  }
  .registry-key-name {
    min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap;
  }
  .registry-form-actions {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px;
  }
  .registry-form-status { min-width: 0; color: #8f98a3; font-size: 10.5px; }
  .registry-form-status[data-error="true"] { color: #ff9b9b; }
  .registry-warnings { display: grid; gap: 4px; margin: 0 0 8px; }
  .registry-warning {
    padding: 6px 8px; border: 1px solid #4b3a23; border-radius: 7px;
    background: #201a13; color: #ffcf9e; font-size: 10.5px;
  }
  .badge.update {
    border-color: #28405a; background: #16222e; color: #8fc2ff;
    text-transform: none; letter-spacing: 0;
  }

  .reload {
    margin: 0 16px 8px; padding: 9px 10px; border: 1px solid #4b3a23;
    border-radius: 8px; background: #201a13; color: #ffcf9e; font-size: 11px;
  }
  .reload button {
    margin-left: 6px; padding: 2px 7px; border: 1px solid #5a4529;
    border-radius: 5px; background: #2a2117; color: #ffcf9e;
    font: inherit; cursor: pointer;
  }

  .footer {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 10px 16px 13px; border-top: 1px solid #262b32;
  }
  .reset {
    padding: 5px 9px; border: 1px solid #3a3f46; border-radius: 7px;
    background: #1d2229; color: #cfd5dc; font: inherit; cursor: pointer;
  }
  .reset:hover { background: #262c34; }
  .hint { color: #77808b; font-size: 10px; }
`;

export interface PanelOptions {
  version: string;
  plugins: PanelPlugin[];
  getConfig: () => TvmodConfig;
  setConfig: (config: TvmodConfig) => void;
  defaultConfig: () => TvmodConfig;
  getPluginError?: (id: string) => string | null;
  registry?: RegistryClient;
}

export interface PanelHandle {
  ensureMounted: () => void;
  refresh: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function gearSvg(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.55-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.7 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.61.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.8c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.12-.55 1.63-.94l2.39.96c.19.12.47.02.61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/></svg>`;
}

interface SettingBinding {
  set(value: PluginSettingValue): void;
}

export function mountPanel(options: PanelOptions): PanelHandle | null {
  if (document.getElementById(PANEL_ID)) return null;

  const root = document.documentElement;
  if (!root) return null;

  let config = options.getConfig();
  const initialEnabled = new Map(
    options.plugins.map((plugin) => [
      plugin.id,
      isPluginEnabled(config, plugin.id),
    ])
  );

  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${PANEL_STYLE}</style>
    <button class="fab" type="button" aria-label="Open TVMod plugins" title="TVMod plugins (Ctrl+Shift+M)">
      ${gearSvg()}<span class="dot" hidden></span>
    </button>
    <div class="backdrop" hidden></div>
    <div class="modal" role="dialog" aria-modal="true" aria-label="TVMod plugins" hidden>
      <div class="header">
        <div>
          <h2 class="title">TVMod <span class="version"></span></h2>
          <div class="subtitle">Plugins and cleanup</div>
        </div>
        <button class="close" type="button" aria-label="Close">×</button>
      </div>
      <div class="toolbar">
        <input class="search" type="search" placeholder="Search plugins" aria-label="Search plugins">
        <span class="count"></span>
      </div>
      <div class="tabs">
        <button class="tab" type="button" data-tab="plugins" data-active="true">Plugins</button>
        <button class="tab" type="button" data-tab="registry">Registry</button>
      </div>
      <div class="plugins"></div>
      <div class="registry" hidden>
        <div class="registry-bar">
          <span class="registry-status"></span>
          <span class="registry-tools">
            <button class="registry-action primary registry-update-all" type="button" hidden>Update all</button>
            <button class="registry-action registry-reload" type="button" hidden>Reload page</button>
            <button class="registry-refresh" type="button">Refresh</button>
          </span>
        </div>
        <details class="registry-manage">
          <summary>Manage registries</summary>
          <div class="registry-manage-body">
            <div class="registry-sources"></div>
            <div class="registry-form">
              <input class="registry-input registry-name" type="text" maxlength="64" placeholder="Registry name" aria-label="Registry name">
              <input class="registry-input registry-url" type="url" maxlength="2048" placeholder="https://example.com/tvmod/index.json" aria-label="Registry index URL">
              <textarea class="registry-textarea registry-key" maxlength="16384" spellcheck="false" placeholder="-----BEGIN PUBLIC KEY-----" aria-label="Registry public key"></textarea>
              <div class="registry-form-row">
                <button class="registry-action registry-pick-key" type="button">Choose .pem</button>
                <span class="registry-key-name registry-form-status"></span>
              </div>
              <div class="registry-form-actions">
                <span class="registry-form-status registry-add-status"></span>
                <button class="registry-action primary registry-add" type="button">Add registry</button>
              </div>
            </div>
          </div>
        </details>
        <div class="registry-warnings"></div>
        <div class="registry-items"></div>
      </div>
      <div class="reload" hidden></div>
      <div class="footer">
        <button class="reset" type="button">Reset defaults</button>
        <span class="hint">Stored locally</span>
      </div>
    </div>
  `;

  const fab = shadow.querySelector<HTMLButtonElement>('.fab');
  const dot = shadow.querySelector<HTMLElement>('.dot');
  const backdrop = shadow.querySelector<HTMLElement>('.backdrop');
  const modal = shadow.querySelector<HTMLElement>('.modal');
  const closeButton = shadow.querySelector<HTMLButtonElement>('.close');
  const search = shadow.querySelector<HTMLInputElement>('.search');
  const count = shadow.querySelector<HTMLElement>('.count');
  const list = shadow.querySelector<HTMLElement>('.plugins');
  const reload = shadow.querySelector<HTMLElement>('.reload');
  const reset = shadow.querySelector<HTMLButtonElement>('.reset');
  const version = shadow.querySelector<HTMLElement>('.version');
  const tabs = Array.from(shadow.querySelectorAll<HTMLButtonElement>('.tab'));
  const registryView = shadow.querySelector<HTMLElement>('.registry');
  const registryItems = shadow.querySelector<HTMLElement>('.registry-items');
  const registryStatus = shadow.querySelector<HTMLElement>('.registry-status');
  const registryRefresh = shadow.querySelector<HTMLButtonElement>('.registry-refresh');
  const registryManage = shadow.querySelector<HTMLDetailsElement>('.registry-manage');
  const registrySources = shadow.querySelector<HTMLElement>('.registry-sources');
  const registryWarnings = shadow.querySelector<HTMLElement>('.registry-warnings');
  const registryUpdateAll = shadow.querySelector<HTMLButtonElement>('.registry-update-all');
  const registryReload = shadow.querySelector<HTMLButtonElement>('.registry-reload');
  const registryName = shadow.querySelector<HTMLInputElement>('.registry-name');
  const registryUrl = shadow.querySelector<HTMLInputElement>('.registry-url');
  const registryKey = shadow.querySelector<HTMLTextAreaElement>('.registry-key');
  const registryKeyName = shadow.querySelector<HTMLElement>('.registry-key-name');
  const registryPickKey = shadow.querySelector<HTMLButtonElement>('.registry-pick-key');
  const registryAdd = shadow.querySelector<HTMLButtonElement>('.registry-add');
  const registryAddStatus = shadow.querySelector<HTMLElement>('.registry-add-status');

  if (version) version.textContent = `v${options.version}`;
  if (!list) return null;

  const registryTab = tabs.find((tab) => tab.dataset.tab === 'registry');
  if (!options.registry && registryTab) registryTab.hidden = true;

  let activeTab: 'plugins' | 'registry' = 'plugins';
  let enabledCount = 0;
  const registryState: {
    loaded: boolean;
    loading: boolean;
    items: RegistryPluginInfo[];
    sources: RegistrySource[];
    warnings: string[];
    installing: Set<string>;
    updating: boolean;
    adding: boolean;
    removing: Set<string>;
    removeArmed: string | null;
    pendingReload: boolean;
    error: string | null;
    message: string | null;
  } = {
    loaded: false,
    loading: false,
    items: [],
    sources: [],
    warnings: [],
    installing: new Set(),
    updating: false,
    adding: false,
    removing: new Set(),
    removeArmed: null,
    pendingReload: false,
    error: null,
    message: null,
  };

  const cards = new Map<
    string,
    {
      card: HTMLElement;
      input: HTMLInputElement;
      settings: HTMLElement;
      settingInputs: Map<string, SettingBinding>;
      error: HTMLElement;
      badges: HTMLElement;
    }
  >();

  const buildCard = (plugin: PanelPlugin): HTMLElement => {
    const card = document.createElement('div');
    card.className = 'plugin';
    card.dataset.pluginId = plugin.id;
    card.dataset.search = [
      plugin.name,
      plugin.description,
      plugin.author ?? '',
      ...(plugin.settings ?? []).map((setting) => setting.name),
    ]
      .join(' ')
      .toLowerCase();

    const info = document.createElement('div');
    info.className = 'plugin-info';

    const name = document.createElement('div');
    name.className = 'plugin-name';
    name.append(document.createTextNode(plugin.name));

    const badges = document.createElement('span');
    badges.style.display = 'inline-flex';
    badges.style.gap = '4px';
    if (plugin.external) {
      const badge = document.createElement('span');
      badge.className = 'badge external';
      badge.textContent = 'external';
      badge.title = `${plugin.author ?? 'unknown author'} v${plugin.version ?? '0.0.0'}`;
      badges.append(badge);
    }
    if (plugin.requiresReload) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'reload';
      badges.append(badge);
    }
    name.append(badges);

    const desc = document.createElement('div');
    desc.className = 'plugin-desc';
    desc.textContent = plugin.description;

    const meta = document.createElement('div');
    meta.className = 'plugin-meta';
    if (plugin.external) {
      meta.textContent = `${plugin.author ?? 'unknown author'} · v${plugin.version ?? '0.0.0'}`;
    }

    const settings = document.createElement('div');
    settings.className = 'plugin-settings';
    const settingInputs = new Map<string, SettingBinding>();

    const commitSetting = (
      settingKey: string,
      value: PluginSettingValue
    ): void => {
      config = withPluginSetting(config, plugin.id, settingKey, value);
      options.setConfig(config);
      sync();
    };

    for (const setting of plugin.settings ?? []) {
      const row = document.createElement('div');
      row.className = 'plugin-setting';

      const text = document.createElement('span');
      text.textContent = setting.name;
      if (setting.description) text.title = setting.description;

      if (setting.type === 'boolean') {
        const toggle = document.createElement('label');
        toggle.className = 'switch small';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('aria-label', setting.name);

        const slider = document.createElement('span');
        slider.className = 'slider';

        toggle.append(input, slider);
        row.append(text, toggle);
        settings.append(row);

        input.addEventListener('change', (event) => {
          event.stopPropagation();
          commitSetting(setting.key, input.checked);
        });

        settingInputs.set(setting.key, {
          set: (value) => {
            input.checked = value === true;
          },
        });
        continue;
      }

      row.classList.add('plugin-setting-stack');

      if (setting.type === 'string') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'setting-input';
        input.maxLength = 200;
        input.placeholder = setting.placeholder ?? '';
        input.setAttribute('aria-label', setting.name);
        input.addEventListener('change', (event) => {
          event.stopPropagation();
          commitSetting(setting.key, input.value);
        });

        row.append(text, input);
        settingInputs.set(setting.key, {
          set: (value) => {
            input.value = typeof value === 'string' ? value : String(value);
          },
        });
      } else if (setting.type === 'number') {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'setting-input';
        input.setAttribute('aria-label', setting.name);
        if (setting.min !== undefined) input.min = String(setting.min);
        if (setting.max !== undefined) input.max = String(setting.max);
        input.step =
          setting.step !== undefined ? String(setting.step) : 'any';

        const binding: SettingBinding = {
          set: (value) => {
            input.value = typeof value === 'number' ? String(value) : '';
          },
        };

        input.addEventListener('change', (event) => {
          event.stopPropagation();
          const parsed = input.valueAsNumber;
          if (!Number.isFinite(parsed)) {
            const current =
              config.plugins[plugin.id]?.settings?.[setting.key] ??
              setting.default;
            binding.set(current as PluginSettingValue);
            return;
          }

          let value = parsed;
          if (setting.min !== undefined && value < setting.min) {
            value = setting.min;
          }
          if (setting.max !== undefined && value > setting.max) {
            value = setting.max;
          }
          commitSetting(setting.key, value);
        });

        row.append(text, input);
        settingInputs.set(setting.key, binding);
      } else {
        const select = document.createElement('select');
        select.className = 'setting-select';
        select.setAttribute('aria-label', setting.name);
        for (const option of setting.options) {
          const element = document.createElement('option');
          element.value = option.value;
          element.textContent = option.label;
          select.append(element);
        }
        select.addEventListener('change', (event) => {
          event.stopPropagation();
          commitSetting(setting.key, select.value);
        });

        row.append(text, select);
        settingInputs.set(setting.key, {
          set: (value) => {
            select.value = typeof value === 'string' ? value : String(value);
          },
        });
      }

      settings.append(row);
    }

    const error = document.createElement('div');
    error.className = 'plugin-error';
    error.hidden = true;

    info.append(name, desc);
    if (meta.textContent) info.append(meta);
    info.append(settings, error);

    const label = document.createElement('label');
    label.className = 'switch';
    label.title = `Toggle ${plugin.name}`;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('aria-label', plugin.name);

    const slider = document.createElement('span');
    slider.className = 'slider';
    label.append(input, slider);

    input.addEventListener('change', (event) => {
      event.stopPropagation();
      config = withPluginEnabled(config, plugin.id, input.checked);
      options.setConfig(config);
      sync();
    });

    card.append(info, label);
    cards.set(plugin.id, {
      card,
      input,
      settings,
      settingInputs,
      error,
      badges,
    });
    return card;
  };

  const categorySections = new Map<
    PluginCategory,
    { section: HTMLElement; count: HTMLElement }
  >();

  for (const category of PLUGIN_CATEGORY_ORDER) {
    const plugins = options.plugins.filter(
      (plugin) => plugin.category === category
    );
    if (plugins.length === 0) continue;

    const section = document.createElement('section');
    section.className = 'plugin-category';
    section.dataset.category = category;

    const head = document.createElement('div');
    head.className = 'category-head';

    const title = document.createElement('span');
    title.className = 'category-title';
    title.textContent = PLUGIN_CATEGORY_LABELS[category];

    const count = document.createElement('span');
    count.className = 'category-count';
    count.textContent = String(plugins.length);

    head.append(title, count);
    section.append(head);

    for (const plugin of plugins) {
      section.append(buildCard(plugin));
    }

    list.append(section);
    categorySections.set(category, { section, count });
  }

  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = 'No plugins match';
  empty.hidden = true;
  list.append(empty);

  const isBootDirty = (): boolean =>
    options.plugins.some(
      (plugin) =>
        plugin.requiresReload &&
        isPluginEnabled(config, plugin.id) !== initialEnabled.get(plugin.id)
    );

  const registryInstalled = (id: string) =>
    options.plugins.find((plugin) => plugin.external && plugin.id === id);

  const registryPlan = () =>
    planRegistryUpdates(registryState.items, options.plugins);

  const registryBusy = (): boolean =>
    registryState.loading ||
    registryState.updating ||
    registryState.adding ||
    registryState.installing.size > 0 ||
    registryState.removing.size > 0;

  const setRegistryAddStatus = (text: string, error = false): void => {
    if (!registryAddStatus) return;
    registryAddStatus.textContent = text;
    registryAddStatus.dataset.error = error ? 'true' : 'false';
  };

  const renderRegistrySources = (): void => {
    if (!registrySources) return;
    registrySources.textContent = '';

    if (registryState.sources.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'registry-source-empty';
      empty.textContent = 'No registries configured. Add one below.';
      registrySources.append(empty);
      return;
    }

    for (const source of registryState.sources) {
      const row = document.createElement('div');
      row.className = 'registry-source';

      const info = document.createElement('div');
      info.className = 'registry-source-info';

      const name = document.createElement('div');
      name.className = 'registry-source-name';
      name.textContent = source.name;

      const url = document.createElement('div');
      url.className = 'registry-source-url';
      url.textContent = source.url;

      info.append(name, url);

      const removing = registryState.removing.has(source.name);
      const armed = registryState.removeArmed === source.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'registry-action danger';
      remove.textContent = removing
        ? 'Removing…'
        : armed
          ? 'Confirm remove'
          : 'Remove';
      remove.disabled = removing || registryBusy();
      remove.addEventListener('click', () => {
        if (registryState.removeArmed === source.name) {
          void removeRegistrySource(source);
          return;
        }
        registryState.removeArmed = source.name;
        renderRegistry();
        window.setTimeout(() => {
          if (registryState.removeArmed === source.name) {
            registryState.removeArmed = null;
            renderRegistry();
          }
        }, 4000);
      });

      row.append(info, remove);
      registrySources.append(row);
    }
  };

  const renderRegistryWarnings = (): void => {
    if (!registryWarnings) return;
    registryWarnings.textContent = '';

    const plan = registryPlan();
    const messages = [...registryState.warnings];
    if (plan.ambiguous.length > 0) {
      messages.push(
        `Updates skipped for ${plan.ambiguous.join(', ')}: multiple registries offer the same plugin id.`
      );
    }

    for (const message of messages.slice(0, 5)) {
      const line = document.createElement('div');
      line.className = 'registry-warning';
      line.textContent = message;
      registryWarnings.append(line);
    }

    if (messages.length > 5) {
      const more = document.createElement('div');
      more.className = 'registry-warning';
      more.textContent = `${messages.length - 5} more registry warning(s)`;
      registryWarnings.append(more);
    }
  };

  const updateRegistryStatus = (): void => {
    if (!registryStatus || !registryRefresh) return;
    const plan = registryPlan();
    const busy = registryBusy();

    registryRefresh.disabled = busy;

    if (registryUpdateAll) {
      registryUpdateAll.hidden = plan.updates.length === 0;
      registryUpdateAll.textContent = `Update all (${plan.updates.length})`;
      registryUpdateAll.disabled = busy || plan.updates.length === 0;
    }
    if (registryReload) {
      registryReload.hidden = !registryState.pendingReload;
      registryReload.disabled = busy;
    }
    if (registryAdd) registryAdd.disabled = busy;
    if (registryPickKey) registryPickKey.disabled = busy;

    if (registryState.loading) {
      registryStatus.dataset.error = 'false';
      registryStatus.textContent = 'Loading registries…';
    } else if (registryState.updating) {
      registryStatus.dataset.error = 'false';
      registryStatus.textContent =
        registryState.message ?? 'Updating plugins…';
    } else if (registryState.error) {
      registryStatus.dataset.error = 'true';
      registryStatus.textContent = registryState.error;
    } else if (registryState.message) {
      registryStatus.dataset.error = 'false';
      registryStatus.textContent = registryState.message;
    } else if (registryState.sources.length === 0) {
      registryStatus.dataset.error = 'false';
      registryStatus.textContent = 'No registries configured';
    } else if (registryState.items.length === 0) {
      registryStatus.dataset.error = 'false';
      registryStatus.textContent = 'No plugins available';
    } else {
      registryStatus.dataset.error = 'false';
      const total = registryState.items.length;
      const updates = plan.updates.length;
      registryStatus.textContent = `${total} plugin${
        total === 1 ? '' : 's'
      } available${
        updates > 0
          ? ` · ${updates} update${updates === 1 ? '' : 's'}`
          : ''
      }`;
    }
  };

  const renderRegistry = (): void => {
    if (!registryItems) return;
    const plan = registryPlan();

    updateRegistryStatus();
    renderRegistrySources();
    renderRegistryWarnings();
    registryItems.textContent = '';

    const query = (search?.value ?? '').trim().toLowerCase();
    let visible = 0;

    for (const item of registryState.items) {
      const haystack = [
        item.name,
        item.id,
        item.description,
        item.author ?? '',
        item.registry,
      ]
        .join(' ')
        .toLowerCase();
      if (query && !haystack.includes(query)) continue;
      visible += 1;

      const card = document.createElement('div');
      card.className = 'registry-item';

      const info = document.createElement('div');
      info.className = 'plugin-info';

      const name = document.createElement('div');
      name.className = 'plugin-name';
      name.append(document.createTextNode(item.name));

      const badges = document.createElement('span');
      badges.style.display = 'inline-flex';
      badges.style.gap = '4px';
      badges.style.flexWrap = 'wrap';

      const versionBadge = document.createElement('span');
      versionBadge.className = 'badge version';
      versionBadge.textContent = `v${item.version}`;

      const registryBadge = document.createElement('span');
      registryBadge.className = 'badge external';
      registryBadge.textContent = item.registry;

      badges.append(versionBadge, registryBadge);

      const installed = registryInstalled(item.id);
      const upToDate = installed?.version === item.version;

      if (installed && !upToDate) {
        const updateBadge = document.createElement('span');
        updateBadge.className = 'badge update';
        updateBadge.textContent = 'update';
        updateBadge.title = `Installed v${installed.version ?? '0.0.0'}`;
        badges.append(updateBadge);
      }

      name.append(badges);

      const desc = document.createElement('div');
      desc.className = 'plugin-desc';
      desc.textContent = item.description || 'No description.';

      info.append(name, desc);

      const metaParts: string[] = [];
      if (item.author) metaParts.push(item.author);
      if (installed && !upToDate) {
        metaParts.push(`installed v${installed.version ?? '0.0.0'}`);
      }
      if (installed && item.sourceRegistry) {
        metaParts.push(`via ${item.sourceRegistry}`);
      }
      if (metaParts.length > 0) {
        const meta = document.createElement('div');
        meta.className = 'plugin-meta';
        meta.textContent = metaParts.join(' · ');
        info.append(meta);
      }

      const key = `${item.registry}:${item.id}`;
      const installing = registryState.installing.has(key);
      const ambiguous = plan.ambiguous.includes(item.id);

      const install = document.createElement('button');
      install.type = 'button';
      install.className = 'install';
      install.textContent = installing
        ? 'Installing…'
        : upToDate
          ? 'Installed'
          : installed
            ? 'Update'
            : 'Install';
      install.disabled =
        installing || registryBusy() || upToDate;
      if (upToDate) {
        install.title = `Already installed: v${item.version}`;
      } else if (installed) {
        install.title = `Replace v${installed.version ?? '0.0.0'} with v${item.version}`;
      }
      if (ambiguous) {
        install.title = `${install.title ?? ''} Multiple registries offer this id; update individually.`.trim();
      }
      install.addEventListener('click', () => {
        void installRegistryPlugin(item, Boolean(installed && !upToDate));
      });

      card.append(info, install);
      registryItems.append(card);
    }

    if (visible === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent =
        registryState.sources.length === 0
          ? 'No registries configured'
          : registryState.items.length === 0
            ? 'No plugins in the configured registries'
            : 'No registry plugins match';
      registryItems.append(empty);
    }
  };

  const loadRegistry = async (force = false): Promise<void> => {
    if (!options.registry || registryState.loading || registryState.updating) {
      return;
    }
    if (registryState.loaded && !force) {
      renderRegistry();
      return;
    }

    registryState.loading = true;
    registryState.error = null;
    registryState.message = null;
    renderRegistry();

    try {
      const sourcesResult = await options.registry.sources();
      if (!sourcesResult.ok) {
        throw new Error(sourcesResult.error ?? 'failed to load registries');
      }

      registryState.sources = sourcesResult.sources ?? [];
      if (registryState.sources.length === 0) {
        registryState.items = [];
        registryState.warnings = [];
        registryState.loaded = true;
        if (registryManage) registryManage.open = true;
        return;
      }

      const result = await options.registry.list();
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to load registries');
      }
      registryState.items = result.plugins ?? [];
      registryState.warnings = result.warnings ?? [];
      registryState.loaded = true;
    } catch (error) {
      registryState.error =
        error instanceof Error ? error.message : String(error);
    } finally {
      registryState.loading = false;
      renderRegistry();
    }
  };

  const installRegistryPlugin = async (
    item: RegistryPluginInfo,
    force = false
  ): Promise<void> => {
    if (
      !options.registry ||
      registryState.updating ||
      registryState.installing.size > 0
    ) {
      return;
    }
    const key = `${item.registry}:${item.id}`;

    registryState.installing.add(key);
    registryState.error = null;
    registryState.message = `Installing ${item.name}…`;
    renderRegistry();

    try {
      const result = await options.registry.install(
        item.id,
        item.registry,
        force
      );
      if (!result.ok) {
        throw new Error(
          (result.error || result.stderr || 'install failed').trim()
        );
      }
      registryState.message = `${item.name} v${item.version} installed. TradingView is reloading…`;
    } catch (error) {
      registryState.error =
        error instanceof Error ? error.message : String(error);
      registryState.message = null;
    } finally {
      registryState.installing.delete(key);
      renderRegistry();
    }
  };

  const pickRegistryKey = async (): Promise<void> => {
    if (!options.registry || registryBusy()) return;
    setRegistryAddStatus('Opening file picker…');
    try {
      const result = await options.registry.pickKey();
      if (result.canceled) {
        setRegistryAddStatus('');
        return;
      }
      if (!result.ok || !result.publicKey) {
        throw new Error(result.error ?? 'failed to read public key');
      }
      if (registryKey) registryKey.value = result.publicKey;
      if (registryKeyName) registryKeyName.textContent = result.name ?? '';
      setRegistryAddStatus('Public key loaded.');
    } catch (error) {
      setRegistryAddStatus(
        error instanceof Error ? error.message : String(error),
        true
      );
    }
  };

  const addRegistrySource = async (): Promise<void> => {
    if (!options.registry || registryBusy()) return;

    const name = registryName?.value.trim() ?? '';
    const url = registryUrl?.value.trim() ?? '';
    const publicKey = registryKey?.value.trim() ?? '';

    if (!name || !url || !publicKey) {
      setRegistryAddStatus('Name, URL, and public key are required.', true);
      return;
    }

    registryState.adding = true;
    registryState.error = null;
    setRegistryAddStatus('Verifying signed index…');
    renderRegistry();

    try {
      const result = await options.registry.add(name, url, publicKey);
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to add registry');
      }

      registryState.message = `Registry ${name} added.`;
      if (registryName) registryName.value = '';
      if (registryUrl) registryUrl.value = '';
      if (registryKey) registryKey.value = '';
      if (registryKeyName) registryKeyName.textContent = '';
      setRegistryAddStatus('');
      registryState.adding = false;
      registryState.loaded = false;
      await loadRegistry(true);
    } catch (error) {
      setRegistryAddStatus(
        error instanceof Error ? error.message : String(error),
        true
      );
    } finally {
      registryState.adding = false;
      renderRegistry();
    }
  };

  const removeRegistrySource = async (
    source: RegistrySource
  ): Promise<void> => {
    if (!options.registry || registryBusy()) return;

    registryState.removeArmed = null;
    registryState.removing.add(source.name);
    registryState.error = null;
    renderRegistry();

    try {
      const result = await options.registry.remove(source.name);
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to remove registry');
      }
      registryState.message = `Registry ${source.name} removed. Installed plugins were kept.`;
      registryState.loaded = false;
      await loadRegistry(true);
    } catch (error) {
      registryState.error =
        error instanceof Error ? error.message : String(error);
    } finally {
      registryState.removing.delete(source.name);
      renderRegistry();
    }
  };

  const reloadRegistryPage = async (): Promise<void> => {
    if (!options.registry || registryState.updating) return;
    registryState.message = 'Reloading TradingView…';
    renderRegistry();
    try {
      const result = await options.registry.reload();
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to reload TradingView');
      }
      registryState.pendingReload = false;
    } catch (error) {
      registryState.error =
        error instanceof Error ? error.message : String(error);
    } finally {
      renderRegistry();
    }
  };

  const updateAllRegistryPlugins = async (): Promise<void> => {
    if (!options.registry || registryBusy()) return;

    const plan = registryPlan();
    if (plan.updates.length === 0) return;

    registryState.updating = true;
    registryState.error = null;
    registryState.pendingReload = false;
    registryState.message = `Updating ${plan.updates.length} plugin${
      plan.updates.length === 1 ? '' : 's'
    }…`;
    renderRegistry();

    let succeeded = 0;
    const failures: string[] = [];

    try {
      for (const update of plan.updates) {
        registryState.message = `Updating ${update.name}…`;
        renderRegistry();

        const result = await options.registry.install(
          update.id,
          update.registry,
          true,
          true
        );

        if (result.ok) {
          succeeded += 1;
        } else {
          failures.push(
            `${update.name}: ${
              (result.error || result.stderr || 'install failed').trim()
            }`
          );
        }
      }

      if (failures.length > 0) {
        registryState.warnings = [...registryState.warnings, ...failures];
        registryState.error = `${succeeded} updated, ${failures.length} failed.`;
        registryState.pendingReload = succeeded > 0;
        registryState.message = null;
      } else {
        registryState.message = `${succeeded} updated. Reloading TradingView…`;
        registryState.pendingReload = true;
        const reload = await options.registry.reload();
        if (!reload.ok) {
          throw new Error(reload.error ?? 'failed to reload TradingView');
        }
        registryState.pendingReload = false;
      }
    } catch (error) {
      registryState.error =
        error instanceof Error ? error.message : String(error);
      registryState.pendingReload = succeeded > 0;
      registryState.message = null;
    } finally {
      registryState.updating = false;
      renderRegistry();
    }
  };

  registryRefresh?.addEventListener('click', () => {
    void loadRegistry(true);
  });
  registryUpdateAll?.addEventListener('click', () => {
    void updateAllRegistryPlugins();
  });
  registryReload?.addEventListener('click', () => {
    void reloadRegistryPage();
  });
  registryPickKey?.addEventListener('click', () => {
    void pickRegistryKey();
  });
  registryAdd?.addEventListener('click', () => {
    void addRegistrySource();
  });

  const setTab = (tab: 'plugins' | 'registry'): void => {
    if (tab === 'registry' && !options.registry) return;
    activeTab = tab;

    for (const button of tabs) {
      button.dataset.active = button.dataset.tab === tab ? 'true' : 'false';
    }
    list.hidden = tab !== 'plugins';
    if (registryView) registryView.hidden = tab !== 'registry';
    if (search) {
      search.placeholder =
        tab === 'registry' ? 'Search registry' : 'Search plugins';
      search.value = '';
    }
    if (count) count.hidden = tab === 'registry';

    if (tab === 'registry') {
      void loadRegistry();
      renderRegistry();
    } else {
      sync();
    }
  };

  for (const button of tabs) {
    button.addEventListener('click', () => {
      setTab(button.dataset.tab === 'registry' ? 'registry' : 'plugins');
    });
  }

  registryRefresh?.addEventListener('click', () => {
    void loadRegistry(true);
  });

  const applyFilter = (): void => {
    if (activeTab === 'registry') {
      renderRegistry();
      return;
    }

    const query = (search?.value ?? '').trim().toLowerCase();
    let visible = 0;
    const categoryVisible = new Map<PluginCategory, number>();

    for (const plugin of options.plugins) {
      const entry = cards.get(plugin.id);
      if (!entry) continue;
      const matches = !query || entry.card.dataset.search?.includes(query);
      entry.card.hidden = !matches;
      if (matches) {
        visible += 1;
        categoryVisible.set(
          plugin.category,
          (categoryVisible.get(plugin.category) ?? 0) + 1
        );
      }
    }

    for (const [category, section] of categorySections) {
      section.section.hidden = (categoryVisible.get(category) ?? 0) === 0;
    }

    empty.hidden = visible > 0;
    if (count) {
      count.textContent = `${enabledCount} / ${options.plugins.length} enabled`;
    }
  };

  const sync = (): void => {
    let enabled = 0;

    for (const plugin of options.plugins) {
      const entry = cards.get(plugin.id);
      if (!entry) continue;

      const on = isPluginEnabled(config, plugin.id);
      entry.input.checked = on;
      entry.card.dataset.enabled = on ? 'true' : 'false';
      if (on) enabled += 1;

      const state = config.plugins[plugin.id];
      for (const setting of plugin.settings ?? []) {
        const binding = entry.settingInputs.get(setting.key);
        if (binding) {
          binding.set(
            state?.settings?.[setting.key] ?? setting.default
          );
        }
      }
      entry.settings.hidden = !on || !(plugin.settings?.length ?? 0);

      const errorText = options.getPluginError?.(plugin.id) ?? null;
      entry.error.hidden = !errorText;
      entry.error.textContent = errorText ?? '';
      entry.card.dataset.error = errorText ? 'true' : 'false';
      entry.badges.querySelector('.badge.error')?.remove();
      if (errorText) {
        const badge = document.createElement('span');
        badge.className = 'badge error';
        badge.textContent = 'error';
        badge.title = errorText;
        entry.badges.append(badge);
      }
    }

    enabledCount = enabled;
    if (count && activeTab === 'plugins') {
      count.textContent = `${enabled} / ${options.plugins.length} enabled`;
    }

    const dirty = isBootDirty();
    if (dot) dot.hidden = !dirty;
    if (reload) {
      reload.hidden = !dirty;
      reload.textContent = 'Adblock changed. Reload the page to apply boot-time filters.';
      const reloadButton = document.createElement('button');
      reloadButton.type = 'button';
      reloadButton.textContent = 'Reload page';
      reloadButton.addEventListener('click', () => location.reload());
      reload.append(reloadButton);
    }

    applyFilter();
  };

  const setOpen = (open: boolean): void => {
    if (!modal || !backdrop) return;
    modal.hidden = !open;
    backdrop.hidden = !open;
    if (open) {
      if (activeTab === 'registry') {
        void loadRegistry();
        renderRegistry();
      } else {
        sync();
      }
      search?.focus();
    }
  };

  fab?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  });

  closeButton?.addEventListener('click', () => setOpen(false));
  backdrop?.addEventListener('click', () => setOpen(false));
  search?.addEventListener('input', applyFilter);

  reset?.addEventListener('click', () => {
    config = options.defaultConfig();
    options.setConfig(config);
    sync();
  });

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && modal && !modal.hidden) {
        setOpen(false);
        return;
      }

      if (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        event.code === 'KeyM'
      ) {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        if (modal) setOpen(modal.hidden !== false);
      }
    },
    true
  );

  const ensureMounted = (): void => {
    if (!host.isConnected) {
      document.documentElement.appendChild(host);
    }
  };

  const refresh = (): void => {
    config = options.getConfig();
    sync();
  };

  ensureMounted();
  sync();

  return { ensureMounted, refresh };
}
