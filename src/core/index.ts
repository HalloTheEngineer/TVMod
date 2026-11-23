import { installBootHooks } from './boot.js';
import {
  CONFIG_KEY,
  isPluginEnabled,
  loadConfig,
  saveConfig,
  type TvmodConfig,
} from './config.js';
import { PAGE_CSS } from './css.js';
import { applyDom, startDomObserver } from './dom.js';
import { mountPanel, type PanelHandle } from './panel.js';

export interface Host {
  executeJavaScript(code: string): Promise<unknown>;
  insertCSS(css: string): string;
}

let started = false;

export function start(version: string, host: Host): void {
  if (started) return;
  started = true;

  let config: TvmodConfig = loadConfig();

  try {
    host.insertCSS(PAGE_CSS);
  } catch (error) {
    console.error('[tvmod] failed to insert page CSS', error);
  }

  const bootScript = `(${installBootHooks.toString()})(${JSON.stringify({
    adblock: isPluginEnabled(config, 'adblock'),
  })}, ${JSON.stringify({ version, at: Date.now() })});`;

  void Promise.resolve(host.executeJavaScript(bootScript)).catch((error) => {
    console.error('[tvmod] boot hook failed', error);
  });

  let panel: PanelHandle | null = null;

  const onReady = (): void => {
    applyDom(config);

    try {
      panel = mountPanel({
        version,
        getConfig: () => config,
        setConfig: (next) => {
          config = next;
          saveConfig(config);
          applyDom(config);
          panel?.ensureMounted();
        },
      });
    } catch (error) {
      console.error('[tvmod] failed to mount panel', error);
    }

    startDomObserver(
      () => config,
      () => panel?.ensureMounted()
    );

    window.addEventListener('storage', (event) => {
      if (event.key !== CONFIG_KEY) return;
      config = loadConfig();
      applyDom(config);
      panel?.refresh();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
}
