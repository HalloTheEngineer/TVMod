import { installBootHooks } from './boot.js';
import {
  CONFIG_KEY,
  defaultConfig,
  isPluginEnabled,
  loadConfig,
  saveConfig,
  type TvmodConfig,
} from './config.js';
import { PAGE_CSS } from './css.js';
import { applyDom, startDomObserver } from './dom.js';
import { readEmbeddedPlugins, toPanelPlugin } from './embedded-plugins.js';
import type { Host } from './host.js';
import { mountPanel, type PanelHandle } from './panel.js';
import { PluginHost } from './plugin-host.js';
import { PLUGINS } from './plugins.js';

let started = false;

export function start(version: string, host: Host): void {
  if (started) return;
  started = true;

  const embeddedPlugins = readEmbeddedPlugins();
  const externalPlugins = embeddedPlugins.map((plugin) =>
    toPanelPlugin(plugin.manifest)
  );
  const plugins = [
    ...PLUGINS,
    ...externalPlugins.filter(
      (external) => !PLUGINS.some((builtin) => builtin.id === external.id)
    ),
  ];

  let config: TvmodConfig = loadConfig(undefined, plugins);
  const pluginHost = new PluginHost(
    embeddedPlugins,
    () => config,
    host,
    version
  );

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
  const registry = host.registry;

  const syncPlugins = (): void => {
    void pluginHost.sync().then(() => panel?.refresh());
  };

  const onReady = (): void => {
    applyDom(config);

    try {
      panel = mountPanel({
        version,
        plugins,
        getConfig: () => config,
        setConfig: (next) => {
          config = next;
          saveConfig(config);
          applyDom(config);
          syncPlugins();
          panel?.ensureMounted();
        },
        defaultConfig: () => defaultConfig(plugins),
        getPluginError: (id) => pluginHost.errorFor(id),
        registry,
      });
    } catch (error) {
      console.error('[tvmod] failed to mount panel', error);
    }

    startDomObserver(
      () => config,
      () => panel?.ensureMounted()
    );

    syncPlugins();

    window.addEventListener('storage', (event) => {
      if (event.key !== CONFIG_KEY) return;
      config = loadConfig(undefined, plugins);
      applyDom(config);
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
