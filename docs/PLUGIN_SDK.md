# TVMod Plugin SDK v1

Status: **local plugins**, launcher and patch backends. Plugins are embedded into the installed preload when you install or refresh them. There is no remote plugin registry yet.

## Install a plugin

```sh
tvmod plugin add examples/plugins/hello-world
```

Reload the TradingView page, open the TVMod gear modal, and enable **Hello World**. The example badge and its setting appear.

For a patched install, run:

```sh
tvmod repair --yes
```

after changing plugins, because the patched `app.asar` contains a snapshot of the preload.

## Directory layout

```text
~/.local/share/tvmod/plugins/
  hello-world/
    manifest.json
    index.js
```

`tvmod plugin list` shows installed plugins and validation errors. `tvmod plugin path` prints the directory. `tvmod plugin remove <id> --yes` removes one. `tvmod plugin refresh` recomposes the installed preload after manual edits.

## Manifest

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "description": "Example plugin",
  "version": "1.0.0",
  "author": "TVMod",
  "main": "index.js",
  "defaultEnabled": false,
  "permissions": ["dom", "style", "storage"],
  "settings": [
    {
      "key": "showBadge",
      "name": "Show example badge",
      "description": "Display a badge in the chart.",
      "default": true
    }
  ]
}
```

Rules:

- `id` is lowercase `[a-z0-9._-]`, unique, and cannot collide with a built-in plugin.
- `main` is a single `.js` filename inside the plugin directory. Plugins are single-file for v1; local asset loading is not exposed.
- `defaultEnabled` defaults to `false` for external plugins.
- `permissions` may contain `dom`, `style`, and `storage`.
- Settings are boolean only in v1.
- Manifest size is limited to 64 KiB; source is limited to 512 KiB.

## Module format

```js
module.exports = {
  start(ctx) {
    // Apply the mod. Return a cleanup function, return { stop() {} },
    // or define a stop(ctx) export.
    return () => {
      // Undo styles, observers, and DOM nodes.
    };
  },
};
```

`start` may return a Promise. The host restarts a plugin when one of its settings changes, so read `ctx.settings` in `start`.

A broken plugin is caught and marked as `error` in the modal; it cannot crash the panel or other plugins.

## Context

```ts
interface PluginContext {
  id: string;
  manifest: ExternalPluginManifest;
  settings: Readonly<Record<string, boolean>>;
  app: { version: string; host: 'desktop'; platform: string };
  log: (...args: unknown[]) => void;

  dom?: {
    query(selector: string): Element | null;
    queryAll(selector: string): Element[];
    waitFor(selector: string, timeoutMs?: number): Promise<Element>;
    observe(callback: () => void): () => void;
  };

  style?: {
    add(css: string): () => void;
    hide(selector: string): () => void;
  };

  storage?: {
    get<T>(key: string, fallback?: T): T | undefined;
    set(key: string, value: unknown): void;
    remove(key: string): void;
  };
}
```

Only requested capabilities are attached. Calling a missing capability fails like normal JavaScript (`undefined`).

- `dom` — query and observe the page DOM.
- `style` — inject CSS through Electron's frame CSS API; the returned function removes it.
- `storage` — JSON namespaced local storage for this plugin.

## Security and trust

Plugins are local JavaScript. They run in the renderer preload context with the capability context above. They do **not** receive Node.js, Electron IPC, or network APIs from TVMod, but they can still use page APIs such as `fetch` and `WebSocket` and can access the DOM directly. Treat third-party plugins as trusted code and review them before installing.

The current API intentionally does not expose TradingView's internal JavaScript globals. DOM/CSS mods, settings, storage, and lifecycle hooks are supported. Direct `window.TradingView` access may be considered for a future permissioned `page` capability.

## Limitations

- Single-file plugins; no local asset or module loading.
- Boolean settings only.
- No hot module replacement; `plugin add/remove/refresh` recomposes the preload and requires a page reload.
- Plugin changes require `tvmod repair --yes` for patched installs.
- No remote registry or automatic updates.
