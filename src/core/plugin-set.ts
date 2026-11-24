import { readEmbeddedPlugins, toPanelPlugin } from './embedded-plugins.js';
import { PLUGINS } from './plugins.js';
import type { EmbeddedPlugin, PanelPlugin } from './plugin-types.js';

export interface PluginSet {
  embedded: EmbeddedPlugin[];
  plugins: PanelPlugin[];
}

export function loadPluginSet(): PluginSet {
  const embedded = readEmbeddedPlugins();
  const external = embedded.map((plugin) => toPanelPlugin(plugin.manifest));
  const plugins = [
    ...PLUGINS,
    ...external.filter(
      (plugin) => !PLUGINS.some((builtin) => builtin.id === plugin.id)
    ),
  ];
  return { embedded, plugins };
}
