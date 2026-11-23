import { installBootHooks } from './boot.js';
import { PAGE_CSS } from './css.js';
import { applyDom, startDomObserver } from './dom.js';
import { mountPanel, type PanelHandle } from './panel.js';
import { loadSettings, saveSettings } from './settings.js';
import type { Settings } from './types.js';

export interface Host {
  executeJavaScript(code: string): Promise<unknown>;
  insertCSS(css: string): string;
}

let started = false;

export function start(version: string, host: Host): void {
  if (started) return;
  started = true;

  let settings: Settings = loadSettings();

  try {
    host.insertCSS(PAGE_CSS);
  } catch (error) {
    console.error('[tvmod] failed to insert page CSS', error);
  }

  const bootScript = `(${installBootHooks.toString()})(${JSON.stringify({
    noPromos: settings.noPromos,
  })}, ${JSON.stringify({ version, at: Date.now() })});`;

  void Promise.resolve(host.executeJavaScript(bootScript)).catch((error) => {
    console.error('[tvmod] boot hook failed', error);
  });

  let panel: PanelHandle | null = null;

  const onReady = (): void => {
    applyDom(settings);

    try {
      panel = mountPanel({
        version,
        getSettings: () => settings,
        setSettings: (next) => {
          settings = next;
          saveSettings(settings);
          applyDom(settings);
          panel?.ensureMounted();
        },
      });
    } catch (error) {
      console.error('[tvmod] failed to mount panel', error);
    }

    startDomObserver(
      () => settings,
      () => panel?.ensureMounted()
    );
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
}
