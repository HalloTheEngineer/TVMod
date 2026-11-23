import {
  defaultConfig,
  isPluginEnabled,
  withPluginEnabled,
  withPluginSetting,
  type TvmodConfig,
} from './config.js';
import type { RegistryClient, RegistryPluginInfo } from './host.js';
import type { PanelPlugin } from './plugin-types.js';

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
    width: min(480px, calc(100vw - 32px));
    max-height: min(680px, 82vh); overflow: hidden;
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

  .plugins { min-height: 0; overflow: auto; padding: 0 10px 10px; }

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
          <button class="registry-refresh" type="button">Refresh</button>
        </div>
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
    installing: Set<string>;
    error: string | null;
    message: string | null;
  } = {
    loaded: false,
    loading: false,
    items: [],
    installing: new Set(),
    error: null,
    message: null,
  };

  const cards = new Map<
    string,
    {
      card: HTMLElement;
      input: HTMLInputElement;
      settings: HTMLElement;
      settingInputs: Map<string, HTMLInputElement>;
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
    const settingInputs = new Map<string, HTMLInputElement>();

    for (const setting of plugin.settings ?? []) {
      const row = document.createElement('label');
      row.className = 'plugin-setting';

      const text = document.createElement('span');
      text.textContent = setting.name;
      if (setting.description) text.title = setting.description;

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
        config = withPluginSetting(config, plugin.id, setting.key, input.checked);
        options.setConfig(config);
        sync();
      });

      settingInputs.set(setting.key, input);
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

  for (const plugin of options.plugins) {
    list.append(buildCard(plugin));
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

  const updateRegistryStatus = (): void => {
    if (!registryStatus || !registryRefresh) return;
    registryRefresh.disabled = registryState.loading;

    if (registryState.loading) {
      registryStatus.dataset.error = 'false';
      registryStatus.textContent = 'Loading registries…';
    } else if (registryState.error) {
      registryStatus.dataset.error = 'true';
      registryStatus.textContent = registryState.error;
    } else if (registryState.message) {
      registryStatus.dataset.error = 'false';
      registryStatus.textContent = registryState.message;
    } else if (registryState.items.length === 0) {
      registryStatus.dataset.error = 'false';
      registryStatus.textContent = 'No plugins available';
    } else {
      registryStatus.dataset.error = 'false';
      const total = registryState.items.length;
      registryStatus.textContent = `${total} plugin${total === 1 ? '' : 's'} available`;
    }
  };

  const renderRegistry = (): void => {
    if (!registryItems) return;
    registryItems.textContent = '';
    updateRegistryStatus();

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
      name.append(badges);

      const desc = document.createElement('div');
      desc.className = 'plugin-desc';
      desc.textContent = item.description || 'No description.';

      info.append(name, desc);
      if (item.author) {
        const meta = document.createElement('div');
        meta.className = 'plugin-meta';
        meta.textContent = item.author;
        info.append(meta);
      }

      const key = `${item.registry}:${item.id}`;
      const installing = registryState.installing.has(key);
      const installed = options.plugins.find(
        (plugin) => plugin.external && plugin.id === item.id
      );
      const upToDate = installed?.version === item.version;

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
      install.disabled = installing || registryState.loading || upToDate;
      if (upToDate) {
        install.title = `Already installed: v${item.version}`;
      } else if (installed) {
        install.title = `Replace v${installed.version} with v${item.version}`;
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
        registryState.items.length === 0 && !registryState.loading
          ? 'No plugins in the configured registries'
          : 'No registry plugins match';
      registryItems.append(empty);
    }
  };

  const loadRegistry = async (force = false): Promise<void> => {
    if (!options.registry || registryState.loading) return;
    if (registryState.loaded && !force) {
      renderRegistry();
      return;
    }

    registryState.loading = true;
    registryState.error = null;
    registryState.message = null;
    renderRegistry();

    try {
      const result = await options.registry.list();
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to load registries');
      }
      registryState.items = result.plugins ?? [];
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
    if (!options.registry) return;
    const key = `${item.registry}:${item.id}`;
    if (registryState.installing.has(key)) return;

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

    for (const plugin of options.plugins) {
      const entry = cards.get(plugin.id);
      if (!entry) continue;
      const matches = !query || entry.card.dataset.search?.includes(query);
      entry.card.hidden = !matches;
      if (matches) visible += 1;
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
        const input = entry.settingInputs.get(setting.key);
        if (input) {
          input.checked = state?.settings?.[setting.key] ?? setting.default;
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
