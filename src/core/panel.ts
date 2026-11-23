import type { Settings, SettingsKey } from './types.js';

const PANEL_ID = 'tvmod-root';

const PANEL_STYLE = `
  :host {
    all: initial;
  }

  .wrap {
    position: fixed;
    right: 14px;
    bottom: 14px;
    z-index: 2147483647;
    font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #e9ecef;
    pointer-events: none;
  }

  .fab {
    pointer-events: auto;
    display: block;
    margin-left: auto;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    border: 1px solid #3a3f46;
    background: #14171b;
    color: #f4f6f8;
    font: 700 12px/1 ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.4px;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }

  .fab:hover {
    background: #1d2229;
  }

  .panel {
    pointer-events: auto;
    width: 252px;
    margin-bottom: 10px;
    padding: 12px;
    border: 1px solid #3a3f46;
    border-radius: 12px;
    background: #14171b;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }

  .panel[hidden] {
    display: none;
  }

  .title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 8px;
    font-weight: 700;
    font-size: 13px;
  }

  .ver {
    color: #8f98a3;
    font-weight: 500;
    font-size: 11px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 0;
    cursor: pointer;
  }

  .row input {
    accent-color: #4c8dff;
  }

  .hint {
    margin: 8px 0 9px;
    padding-top: 8px;
    border-top: 1px solid #282d34;
    color: #8f98a3;
    font-size: 11px;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  button.action {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #3a3f46;
    border-radius: 7px;
    background: #1d2229;
    color: #e9ecef;
    font: inherit;
    cursor: pointer;
  }

  button.action:hover {
    background: #262c34;
  }
`;

export interface PanelOptions {
  version: string;
  getSettings: () => Settings;
  setSettings: (settings: Settings) => void;
}

export interface PanelHandle {
  ensureMounted: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function mountPanel(options: PanelOptions): PanelHandle | null {
  if (document.getElementById(PANEL_ID)) return null;

  const root = document.documentElement;
  if (!root) return null;

  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${PANEL_STYLE}</style>
    <div class="wrap">
      <div class="panel" hidden>
        <div class="title"><span>TVMod</span><span class="ver"></span></div>
        <label class="row"><span>Promo suppression</span><input type="checkbox" data-key="noPromos"></label>
        <label class="row"><span>Clean UI</span><input type="checkbox" data-key="cleanUi"></label>
        <label class="row"><span>Hide sidebar</span><input type="checkbox" data-key="hideSidebar"></label>
        <div class="hint">Boot filters apply after a page reload.</div>
        <div class="actions">
          <button class="action" data-action="reload">Reload page</button>
          <button class="action" data-action="hide">Hide</button>
        </div>
      </div>
      <button class="fab" type="button" title="TVMod (Ctrl+Shift+M)">TV</button>
    </div>
  `;

  const versionEl = shadow.querySelector<HTMLElement>('.ver');
  if (versionEl) versionEl.textContent = `v${options.version}`;

  const panel = shadow.querySelector<HTMLElement>('.panel');
  const fab = shadow.querySelector<HTMLButtonElement>('.fab');
  const toggles = Array.from(
    shadow.querySelectorAll<HTMLInputElement>('input[data-key]')
  );

  const syncControls = (): void => {
    const settings = options.getSettings();
    for (const input of toggles) {
      const key = input.dataset.key as SettingsKey | undefined;
      if (key) input.checked = settings[key];
    }
  };

  const setOpen = (open: boolean): void => {
    if (!panel) return;
    panel.hidden = !open;
    if (open) syncControls();
  };

  fab?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!panel || panel.hidden !== false);
  });

  for (const input of toggles) {
    input.addEventListener('change', (event) => {
      event.stopPropagation();
      const key = input.dataset.key as SettingsKey | undefined;
      if (!key) return;
      const next = { ...options.getSettings(), [key]: input.checked };
      options.setSettings(next);
      syncControls();
    });
  }

  shadow
    .querySelector<HTMLButtonElement>('[data-action="reload"]')
    ?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      location.reload();
    });

  shadow
    .querySelector<HTMLButtonElement>('[data-action="hide"]')
    ?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    });

  window.addEventListener(
    'keydown',
    (event) => {
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
        setOpen(!panel || panel.hidden !== false);
      }
    },
    true
  );

  const ensureMounted = (): void => {
    if (!host.isConnected) {
      document.documentElement.appendChild(host);
    }
  };

  ensureMounted();
  syncControls();

  return { ensureMounted };
}
