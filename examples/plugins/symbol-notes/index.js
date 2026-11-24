const GENERIC_TITLES = new Set([
  'LIVE',
  'TRADINGVIEW',
  'STOCK',
  'STOCKS',
  'CHARTS',
  'CHART',
  'MARKETS',
  'CRYPTO',
  'FOREX',
  'BITCOIN',
]);

function currentSymbol() {
  const first = (document.title || '').trim().split(/\s+/)[0] ?? '';
  const cleaned = first
    .replace(/[^A-Za-z0-9:._/-]/g, '')
    .toUpperCase()
    .replace(/:$/, '');
  return cleaned && !GENERIC_TITLES.has(cleaned) ? cleaned : 'CHART';
}

function positionStyle(position) {
  return {
    left: position === 'bottom-left' ? '14px' : 'auto',
    right: position === 'bottom-right' ? '14px' : 'auto',
    bottom: '78px',
  };
}

let currentSettings = null;
let placeInterface = null;

module.exports = {
  start(ctx) {
    let symbol = currentSymbol();
    let saveTimer = null;
    let panelOpen = false;
    currentSettings = ctx.settings;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'tvmod-notes-button';
    button.textContent = 'Notes';
    document.body.appendChild(button);

    const panel = document.createElement('div');
    panel.id = 'tvmod-notes-panel';
    panel.hidden = true;

    const head = document.createElement('div');
    head.className = 'tvmod-notes-head';
    const label = document.createElement('span');
    label.textContent = `Notes · ${symbol}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close notes');
    head.append(label, close);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Notes for this symbol…';
    textarea.setAttribute('aria-label', 'Symbol notes');

    const status = document.createElement('div');
    status.className = 'tvmod-notes-status';
    status.textContent = 'Saved locally';

    panel.append(head, textarea, status);
    document.body.appendChild(panel);

    const removeStyle = ctx.style.add(`
      #tvmod-notes-button {
        position: fixed;
        z-index: 2147483000;
        padding: 6px 10px;
        border: 1px solid #3a3f46;
        border-radius: 7px;
        background: #14171b;
        color: #d6dde5;
        font: 11px/1.2 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
      }
      #tvmod-notes-button:hover { background: #1d2229; }
      #tvmod-notes-panel {
        position: fixed;
        z-index: 2147483001;
        width: min(320px, calc(100vw - 28px));
        padding: 10px;
        border: 1px solid #3a3f46;
        border-radius: 10px;
        background: #14171b;
        color: #d6dde5;
        font: 11px/1.4 ui-sans-serif, system-ui, sans-serif;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      }
      .tvmod-notes-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; margin-bottom: 7px; font-weight: 650;
      }
      .tvmod-notes-head button {
        width: 20px; height: 20px; padding: 0; border: 1px solid #3a3f46;
        border-radius: 5px; background: #1d2229; color: #cfd5dc;
        font: 14px/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer;
      }
      #tvmod-notes-panel textarea {
        width: 100%; min-height: 120px; resize: vertical;
        padding: 7px 8px; border: 1px solid #3a3f46; border-radius: 7px;
        background: #0f1216; color: #e9ecef;
        font: 11px/1.45 ui-sans-serif, system-ui, sans-serif;
        outline: none;
      }
      #tvmod-notes-panel textarea:focus { border-color: #4c8dff; }
      .tvmod-notes-status { margin-top: 5px; color: #77808b; font-size: 9.5px; }
    `);

    const place = () => {
      for (const [key, value] of Object.entries(
        positionStyle(currentSettings?.position ?? 'bottom-right')
      )) {
        button.style[key] = value;
        panel.style[key] = value;
      }
      panel.style.bottom = '120px';
    };
    placeInterface = place;

    const save = () => {
      ctx.storage.set(`note.${symbol}`, textarea.value);
    };

    const load = () => {
      label.textContent = `Notes · ${symbol}`;
      textarea.value = ctx.storage.get(`note.${symbol}`, '');
      status.textContent = 'Saved locally';
    };

    const syncSymbol = () => {
      const next = currentSymbol();
      if (next === symbol) return;
      save();
      symbol = next;
      load();
    };

    const toggle = () => {
      panelOpen = !panelOpen;
      panel.hidden = !panelOpen;
      if (panelOpen) {
        place();
        textarea.focus();
      }
    };

    button.addEventListener('click', toggle);
    close.addEventListener('click', () => {
      panelOpen = false;
      panel.hidden = true;
    });
    textarea.addEventListener('input', () => {
      status.textContent = 'Saving…';
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        save();
        status.textContent = 'Saved locally';
      }, 250);
    });

    place();
    load();

    const title = document.querySelector('title');
    const observer = title
      ? new MutationObserver(syncSymbol)
      : null;
    observer?.observe(title, { childList: true, subtree: true, characterData: true });
    const poll = setInterval(syncSymbol, 1500);

    ctx.onCleanup(() => {
      save();
      if (saveTimer) clearTimeout(saveTimer);
      observer?.disconnect();
      clearInterval(poll);
      button.remove();
      panel.remove();
      removeStyle();
      currentSettings = null;
      placeInterface = null;
    });
  },

  onSettingsChange({ settings: next }) {
    currentSettings = next;
    placeInterface?.();
  },
};
