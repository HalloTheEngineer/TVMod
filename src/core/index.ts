import { installBootHooks } from './boot.js';
import {
  CONFIG_KEY,
  defaultConfig,
  isPluginEnabled,
  loadConfig,
  normalizeConfig,
  saveConfig,
  type TvmodConfig,
} from './config.js';
import { PAGE_CSS } from './css.js';
import { applyDom, startDomObserver } from './dom.js';
import { applyKeywordFilter } from './keyword-filter.js';
import type { Host } from './host.js';
import { mountPanel, type PanelHandle } from './panel.js';
import { PluginHost } from './plugin-host.js';
import { loadPluginSet } from './plugin-set.js';
import { applyQuickActions } from './quick-actions.js';
import { PRIVACY_HOSTS } from '../lib/privacy.js';

let started = false;

export function start(version: string, host: Host): void {
  if (started) return;
  started = true;

  const { embedded, plugins } = loadPluginSet();
  const bridge = host.config;
  const remote = bridge?.load();

  let config: TvmodConfig;
  if (remote?.exists && !remote.error && remote.config) {
    config = normalizeConfig(remote.config, plugins);
  } else {
    config = loadConfig(undefined, plugins);
    if (bridge && !remote?.error) bridge.migrate(config);
  }

  const pluginHost = new PluginHost(embedded, () => config, host, version);

  try {
    host.insertCSS(PAGE_CSS);
  } catch (error) {
    console.error('[tvmod] failed to insert page CSS', error);
  }

  const privacyEnabled = isPluginEnabled(config, 'privacy-shield');
  const bootScript = `(${installBootHooks.toString()})(${JSON.stringify({
    adblock: isPluginEnabled(config, 'adblock'),
    disableAi: isPluginEnabled(config, 'hide-ai-copilot'),
    privacy: privacyEnabled,
    privacyHosts: privacyEnabled ? PRIVACY_HOSTS : [],
  })}, ${JSON.stringify({ version, at: Date.now() })});`;

  void Promise.resolve(host.executeJavaScript(bootScript)).catch((error) => {
    console.error('[tvmod] boot hook failed', error);
  });

  let panel: PanelHandle | null = null;

  const syncPlugins = (): void => {
    void pluginHost.sync().then(() => panel?.refresh());
  };

  const applyFeatures = (): void => {
    applyDom(config);
    applyKeywordFilter(config);
    applyQuickActions(config);
  };

  let ready = false;

  if (bridge) {
    bridge.onChange((raw) => {
      const next = normalizeConfig(raw, plugins);
      if (JSON.stringify(next) === JSON.stringify(config)) return;
      config = next;
      saveConfig(config);
      if (!ready) return;
      applyFeatures();
      syncPlugins();
    });
    bridge.onRequest?.(() => bridge.save(config));
  }

  const onReady = (): void => {
    ready = true;
    applyFeatures();

    if (!bridge) {
      // Patch mode has no main-process config bridge; keep the in-chart
      // panel so settings remain reachable without the native Settings tab.
      try {
        panel = mountPanel({
          version,
          plugins,
          getConfig: () => config,
          setConfig: (next) => {
            config = next;
            saveConfig(config);
            applyFeatures();
            syncPlugins();
            panel?.ensureMounted();
          },
          defaultConfig: () => defaultConfig(plugins),
          getPluginError: (id) => pluginHost.errorFor(id),
          registry: host.registry,
        });
      } catch (error) {
        console.error('[tvmod] failed to mount fallback panel', error);
      }
    }

    startDomObserver(
      () => config,
      () => {
        applyKeywordFilter(config);
        panel?.ensureMounted();
      }
    );

    syncPlugins();

    window.addEventListener('storage', (event) => {
      if (event.key !== CONFIG_KEY) return;
      config = loadConfig(undefined, plugins);
      applyFeatures();
      syncPlugins();
      panel?.refresh();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
}
