import {
  defaultConfig,
  isPluginEnabled,
  withPluginEnabled,
  type TvmodConfig,
} from './config.js';
import { PLUGINS, type PluginDefinition } from './plugins.js';

const PANEL_ID = 'tvmod-root';

const PANEL_STYLE = `
  :host {
    all: initial;
  }

  * {
    box-sizing: border-box;
  }

  [hidden] {
    display: none !important;
  }

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

  .fab:hover {
    background: #1d2229;
  }

  .fab svg {
    width: 18px;
    height: 18px;
  }

  .dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff8a3d;
    box-shadow: 0 0 0 2px #14171b;
  }

  .backdrop {
    pointer-events: auto;
    position: fixed;
    inset: 0;
    z-index: 10;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
  }

  .modal {
    pointer-events: auto;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 11;
    display: flex;
    flex-direction: column;
    width: min(460px, calc(100vw - 32px));
    max-height: min(640px, 82vh);
    overflow: hidden;
    border: 1px solid #3a3f46;
    border-radius: 14px;
    background: #14171b;
    color: #e9ecef;
    font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 15px 16px 10px;
  }

  .title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .subtitle {
    margin-top: 2px;
    color: #8f98a3;
    font-size: 11px;
  }

  .close {
    flex: none;
    width: 26px;
    height: 26px;
    border: 1px solid #3a3f46;
    border-radius: 8px;
    background: #1d2229;
    color: #cfd5dc;
    font: 18px/1 ui-sans-serif, system-ui, sans-serif;
    cursor: pointer;
  }

  .close:hover {
    background: #262c34;
  }

  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 0 16px 10px;
  }

  .search {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid #3a3f46;
    border-radius: 8px;
    background: #0f1216;
    color: #e9ecef;
    font: inherit;
    outline: none;
  }

  .search:focus {
    border-color: #4c8dff;
  }

  .count {
    flex: none;
    color: #8f98a3;
    font-size: 11px;
    white-space: nowrap;
  }

  .plugins {
    min-height: 0;
    overflow: auto;
    padding: 0 10px 10px;
  }

  .plugin {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding: 11px 10px;
    border: 1px solid transparent;
    border-radius: 10px;
  }

  .plugin + .plugin {
    margin-top: 2px;
  }

  .plugin[data-enabled="true"] {
    border-color: #2b3138;
    background: #171b20;
  }

  .plugin-info {
    min-width: 0;
  }

  .plugin-name {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    font-weight: 650;
  }

  .plugin-desc {
    margin-top: 3px;
    color: #929ba6;
    font-size: 11px;
  }

  .badge {
    padding: 1px 5px;
    border: 1px solid #4b3a23;
    border-radius: 4px;
    background: #2a2117;
    color: #ffb36b;
    font-size: 9px;
    font-weight: 650;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .switch {
    flex: none;
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    margin-top: 2px;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
  }

  .slider {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: #30363e;
    transition: background 120ms ease;
  }

  .slider::before {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #cfd5dc;
    transition: transform 120ms ease;
  }

  .switch input:checked + .slider {
    background: #4c8dff;
  }

  .switch input:checked + .slider::before {
    transform: translateX(16px);
    background: #fff;
  }

  .switch input:focus-visible + .slider {
    outline: 2px solid #4c8dff;
    outline-offset: 2px;
  }

  .empty {
    padding: 24px 12px;
    color: #8f98a3;
    text-align: center;
  }

  .reload {
    margin: 0 16px 8px;
    padding: 9px 10px;
    border: 1px solid #4b3a23;
    border-radius: 8px;
    background: #201a13;
    color: #ffcf9e;
    font-size: 11px;
  }

  .reload button {
    margin-left: 6px;
    padding: 2px 7px;
    border: 1px solid #5a4529;
    border-radius: 5px;
    background: #2a2117;
    color: #ffcf9e;
    font: inherit;
    cursor: pointer;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 16px 13px;
    border-top: 1px solid #262b32;
  }

  .reset {
    padding: 5px 9px;
    border: 1px solid #3a3f46;
    border-radius: 7px;
    background: #1d2229;
    color: #cfd5dc;
    font: inherit;
    cursor: pointer;
  }

  .reset:hover {
    background: #262c34;
  }

  .hint {
    color: #77808b;
    font-size: 10px;
  }
`;

export interface PanelOptions {
  version: string;
  getConfig: () => TvmodConfig;
  setConfig: (config: TvmodConfig) => void;
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
    PLUGINS.map((plugin) => [plugin.id, isPluginEnabled(config, plugin.id)])
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
      ${gearSvg()}
      <span class="dot" hidden></span>
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
      <div class="plugins"></div>
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

  if (version) version.textContent = `v${options.version}`;
  if (!list) return null;

  const cards = new Map<string, { card: HTMLElement; input: HTMLInputElement }>();

  const buildCard = (plugin: PluginDefinition): HTMLElement => {
    const card = document.createElement('div');
    card.className = 'plugin';
    card.dataset.pluginId = plugin.id;
    card.dataset.search = `${plugin.name} ${plugin.description}`.toLowerCase();

    const info = document.createElement('div');
    info.className = 'plugin-info';

    const name = document.createElement('div');
    name.className = 'plugin-name';
    name.append(document.createTextNode(plugin.name));
    if (plugin.requiresReload) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'reload';
      name.append(badge);
    }

    const desc = document.createElement('div');
    desc.className = 'plugin-desc';
    desc.textContent = plugin.description;

    info.append(name, desc);

    const label = document.createElement('label');
    label.className = 'switch';
    label.title = `Toggle ${plugin.name}`;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('aria-label', plugin.name);

    const slider = document.createElement('span');
    slider.className = 'slider';

    label.append(input, slider);
    card.append(info, label);

    input.addEventListener('change', (event) => {
      event.stopPropagation();
      config = withPluginEnabled(config, plugin.id, input.checked);
      options.setConfig(config);
      sync();
    });

    cards.set(plugin.id, { card, input });
    return card;
  };

  for (const plugin of PLUGINS) {
    list.append(buildCard(plugin));
  }

  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = 'No plugins match';
  empty.hidden = true;
  list.append(empty);

  const isBootDirty = (): boolean =>
    PLUGINS.some(
      (plugin) =>
        plugin.requiresReload &&
        isPluginEnabled(config, plugin.id) !== initialEnabled.get(plugin.id)
    );

  const applyFilter = (): void => {
    const query = (search?.value ?? '').trim().toLowerCase();
    let visible = 0;

    for (const plugin of PLUGINS) {
      const entry = cards.get(plugin.id);
      if (!entry) continue;
      const matches = !query || entry.card.dataset.search?.includes(query);
      entry.card.hidden = !matches;
      if (matches) visible += 1;
    }

    empty.hidden = visible > 0;
  };

  const sync = (): void => {
    let enabled = 0;

    for (const plugin of PLUGINS) {
      const entry = cards.get(plugin.id);
      if (!entry) continue;
      const on = isPluginEnabled(config, plugin.id);
      entry.input.checked = on;
      entry.card.dataset.enabled = on ? 'true' : 'false';
      if (on) enabled += 1;
    }

    if (count) count.textContent = `${enabled} / ${PLUGINS.length} enabled`;

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
      sync();
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
    config = defaultConfig();
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
