import type { TvmodConfig } from './config.js';
import { getPluginSettings, isPluginEnabled } from './config.js';
import { getPlugin } from './plugins.js';

const HOST_ID = 'tvmod-quick-actions';
const PLUGIN_ID = 'quick-actions';

let host: HTMLDivElement | null = null;
let menu: HTMLElement | null = null;
let button: HTMLButtonElement | null = null;
let keydown: ((event: KeyboardEvent) => void) | null = null;
let hotkeysEnabled = true;

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
  );
}

function clickIfPresent(id: string): void {
  document.getElementById(id)?.click();
}

function perform(action: string): void {
  switch (action) {
    case 'notes':
      clickIfPresent('tvmod-notes-button');
      break;
    case 'size':
      clickIfPresent('tvmod-size-button');
      break;
    case 'fullscreen':
      document
        .querySelector<HTMLElement>('[data-name="header-toolbar-fullscreen"]')
        ?.click();
      break;
    case 'reload':
      location.reload();
      break;
  }
}

function clearMenu(): void {
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function refreshMenu(): void {
  if (!menu) return;
  for (const item of menu.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    const action = item.dataset.action;
    item.disabled =
      action === 'notes'
        ? !document.getElementById('tvmod-notes-button')
        : action === 'size'
          ? !document.getElementById('tvmod-size-button')
          : false;
  }
}

function build(): void {
  host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483646';
  host.style.pointerEvents = 'none';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .wrap {
        position: fixed; right: 14px; bottom: 118px;
        display: flex; flex-direction: column; align-items: flex-end; gap: 7px;
        pointer-events: auto;
        font: 11px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .button {
        padding: 6px 10px; border: 1px solid #3a3f46; border-radius: 9px;
        background: #14171b; color: #cfd5dc; font: inherit; font-weight: 650;
        cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      }
      .button:hover { background: #1d2229; }
      .menu {
        width: 190px; padding: 6px; border: 1px solid #3a3f46;
        border-radius: 10px; background: #14171b; color: #e9ecef;
        box-shadow: 0 16px 50px rgba(0,0,0,0.55);
      }
      .menu button {
        display: flex; width: 100%; align-items: center;
        justify-content: space-between; gap: 10px;
        padding: 6px 7px; border: 0; border-radius: 6px;
        background: transparent; color: #e9ecef; font: inherit;
        text-align: left; cursor: pointer;
      }
      .menu button:hover:not(:disabled) { background: #1d2229; }
      .menu button:disabled { color: #6f7883; cursor: default; }
      kbd {
        padding: 1px 4px; border: 1px solid #3a3f46; border-radius: 4px;
        background: #0f1216; color: #8f98a3;
        font: 9px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .hint {
        padding: 3px 7px 5px; color: #77808b; font-size: 9.5px;
      }
    </style>
    <div class="wrap">
      <div class="menu" role="menu" hidden>
        <button type="button" data-action="notes">Notes <kbd>Alt+N</kbd></button>
        <button type="button" data-action="size">Position size <kbd>Alt+C</kbd></button>
        <button type="button" data-action="fullscreen">Fullscreen <kbd>Alt+Shift+F</kbd></button>
        <button type="button" data-action="reload">Reload <kbd>Alt+Shift+R</kbd></button>
        <div class="hint">Notes and Position size require the bundled examples.</div>
      </div>
      <button class="button" type="button" aria-haspopup="menu" aria-expanded="false">Actions</button>
    </div>
  `;

  menu = shadow.querySelector<HTMLElement>('.menu');
  button = shadow.querySelector<HTMLButtonElement>('.button');

  button?.addEventListener('click', () => {
    if (!menu) return;
    const open = menu.hidden;
    if (open) refreshMenu();
    menu.hidden = !open;
    button?.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  menu?.addEventListener('click', (event) => {
    const item = (event.target as Element).closest<HTMLButtonElement>(
      '[data-action]'
    );
    if (!item || item.disabled) return;
    clearMenu();
    perform(item.dataset.action ?? '');
  });

  document.documentElement.append(host);

  keydown = (event: KeyboardEvent) => {
    if (!hotkeysEnabled || editableTarget(event.target)) return;
    if (!event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.shiftKey && event.code === 'KeyF') {
      event.preventDefault();
      event.stopPropagation();
      perform('fullscreen');
      return;
    }
    if (event.shiftKey && event.code === 'KeyR') {
      event.preventDefault();
      event.stopPropagation();
      perform('reload');
      return;
    }
    if (event.shiftKey) return;

    if (event.code === 'KeyN') {
      event.preventDefault();
      event.stopPropagation();
      perform('notes');
    } else if (event.code === 'KeyC') {
      event.preventDefault();
      event.stopPropagation();
      perform('size');
    }
  };

  window.addEventListener('keydown', keydown, true);
}

function destroy(): void {
  clearMenu();
  if (keydown) {
    window.removeEventListener('keydown', keydown, true);
    keydown = null;
  }
  host?.remove();
  host = null;
  menu = null;
  button = null;
}

export function applyQuickActions(config: TvmodConfig): void {
  const plugin = getPlugin(PLUGIN_ID);
  const enabled = plugin
    ? isPluginEnabled(config, PLUGIN_ID)
    : false;

  if (!enabled) {
    destroy();
    return;
  }

  const settings = plugin
    ? getPluginSettings(config, plugin)
    : {};
  const showButton = settings.showButton !== false;
  hotkeysEnabled = settings.enableHotkeys !== false;

  if (!host) build();

  const wrap = host?.shadowRoot?.querySelector<HTMLElement>('.wrap');
  if (wrap) wrap.hidden = !showButton;
  if (!showButton) clearMenu();
}
