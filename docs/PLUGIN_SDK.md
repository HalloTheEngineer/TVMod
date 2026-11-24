# TVMod Plugin SDK v2

Status: **local plugins**, launcher and patch backends. Plugins are embedded into the installed preload when you install or refresh them.

SDK v2 adds typed settings, plugin-to-plugin events, `onSettingsChange`, and `ctx.onCleanup`. Existing v1 plugins and boolean settings remain compatible.

## Install a plugin

```sh
tvmod plugin add examples/plugins/hello-world
```

Reload the TradingView page, open the TVMod gear modal, and enable **Hello World**. The example badge and its settings appear.

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

`tvmod plugin list` shows installed plugins, source provenance, and validation errors. `tvmod plugin path` prints the directory. `tvmod plugin remove <id> --yes` removes one. `tvmod plugin refresh` recomposes the installed preload after manual edits.

## Manifest

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "description": "Example plugin",
  "version": "2.0.0",
  "author": "TVMod",
  "main": "index.js",
  "defaultEnabled": false,
  "permissions": ["dom", "style", "storage"],
  "settings": [
    {
      "key": "showBadge",
      "name": "Show badge",
      "type": "boolean",
      "default": true
    },
    {
      "key": "badgeText",
      "name": "Badge text",
      "type": "string",
      "default": "TVMod",
      "placeholder": "Badge text"
    },
    {
      "key": "fontSize",
      "name": "Font size",
      "type": "number",
      "default": 11,
      "min": 9,
      "max": 20,
      "step": 1
    },
    {
      "key": "position",
      "name": "Position",
      "type": "select",
      "default": "left",
      "options": [
        { "value": "left", "label": "Lower left" },
        { "value": "right", "label": "Lower right" }
      ]
    }
  ]
}
```

Rules:

- `id` is lowercase `[a-z0-9._-]`, unique, and cannot collide with a built-in plugin.
- `main` is a single `.js` filename inside the plugin directory. Plugins are single-file; local asset loading is not exposed.
- `defaultEnabled` defaults to `false` for external plugins.
- `permissions` may contain `dom`, `style`, `storage`, and `events`.
- Manifest size is limited to 64 KiB; source is limited to 512 KiB.
- Up to 32 settings are allowed.

## Settings

Each setting has `key`, `name`, optional `description`, `type`, and a matching `default`.

| Type | Default | Extra fields | Panel control |
| --- | --- | --- | --- |
| `boolean` | boolean | — | toggle |
| `string` | string, up to 200 chars | `placeholder` | text input |
| `number` | finite number | `min`, `max`, `step` | number input |
| `select` | one of the option values | `options: [{ value, label }]` | dropdown |

`type` may be omitted for legacy v1 boolean settings:

```json
{ "key": "showBadge", "name": "Show badge", "default": true }
```

is treated as a boolean setting.

Validation rules:

- Keys match `[a-zA-Z][a-zA-Z0-9_-]{0,48}` and must be unique.
- Number defaults must be finite and inside `min`/`max`; `step` must be positive.
- Select options must be unique; the default must match one option.
- Invalid or out-of-range stored values fall back to defaults or are clamped.

Saved values live in the existing `tvmod.config.v2` page local storage. v1 boolean values remain valid.

## Module format

```js
module.exports = {
  start(ctx) {
    // Apply the mod. Return a cleanup function, return { stop() {} },
    // or define a stop(ctx) export.
    ctx.onCleanup(() => {
      // Additional cleanup, run on disable/reload.
    });
  },

  onSettingsChange({ settings, previous, changed }) {
    // Optional. Use this to update in place instead of restarting the plugin.
  },

  stop(ctx) {
    // Optional.
  },
};
```

`start` may return a Promise. If the plugin does not export `onSettingsChange`, the host stops and restarts it whenever a setting changes, so `ctx.settings` is always current on start.

If `onSettingsChange` exists, the host calls it instead of restarting. The hook receives:

- `settings` — the new settings
- `previous` — the previous settings
- `changed` — the changed setting keys

`ctx.settings` inside the original `start` context is a snapshot and does not update. Use the hook arguments for new values.

Cleanup ordering:

- A cleanup returned from `start` runs first.
- `ctx.onCleanup` callbacks run in reverse registration order.
- Event subscriptions and auto-registered style/DOM observers are removed automatically.

A broken plugin or lifecycle hook is caught and marked as `error` in the modal; it cannot crash the panel or other plugins. A failing `onSettingsChange` stops the plugin.

## Context

```ts
interface PluginContext {
  id: string;
  manifest: ExternalPluginManifest;
  settings: Readonly<Record<string, boolean | string | number>>;
  app: { version: string; host: 'desktop'; platform: string };
  log: (...args: unknown[]) => void;

  onCleanup(cleanup: () => void | Promise<void>): void;

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

  events?: {
    on(name: string, handler: (payload: unknown, from: string) => unknown): () => void;
    once(name: string, handler: (payload: unknown, from: string) => unknown): () => void;
    emit(name: string, payload?: unknown): void;
  };
}
```

Only requested capabilities are attached. Calling a missing capability fails like normal JavaScript (`undefined`).

- `dom` — query and observe the page DOM. Observers are removed on plugin stop.
- `style` — inject CSS through Electron's frame CSS API; injected styles are removed on plugin stop. The returned function can remove one early.
- `storage` — JSON namespaced local storage for this plugin.
- `events` — in-renderer event bus shared by plugins that request the permission.

## Events

```js
module.exports = {
  start(ctx) {
    return ctx.events.on('my-plugin:refresh', (payload, from) => {
      ctx.log('received', payload, 'from', from);
    });
  },
};
```

Rules:

- Requires the `events` permission.
- Names match `[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}`.
- Handlers receive `(payload, fromPluginId)`.
- Handlers may return a Promise; rejections are logged and isolated.
- Subscriptions are removed automatically when the emitting or listening plugin stops.
- Each plugin may hold up to 200 subscriptions.
- Events never cross renderer, IPC, or network boundaries. Payloads are passed by reference, so do not send secrets to untrusted plugins.

There is no built-in global event naming registry. Prefix names with your plugin id.

## Security and trust

Plugins are local JavaScript. They run in the renderer preload context with the capability context above. They do **not** receive Node.js, Electron IPC, or network APIs from TVMod, but they can still use page APIs such as `fetch` and `WebSocket` and can access the DOM directly. Treat third-party plugins as trusted code and review them before installing.

The API intentionally does not expose TradingView's internal JavaScript globals. Direct `window.TradingView` access would require a future permissioned capability.

Events are isolated to the current renderer. A plugin with `events` can observe events emitted by other plugins in the same page, so avoid sending credentials or private data through the bus.

## Compatibility

- SDK v1 plugins load unchanged.
- Bare boolean settings are inferred as `type: "boolean"`.
- Existing `tvmod.config.v2` values are normalized against the current manifest.
- Settings from plugins that are no longer installed are ignored.

## Limitations

- Single-file plugins; no local asset or module loading.
- No string multiline/textarea control, colors, or multi-select settings.
- No hot module replacement; `plugin add/remove/refresh` recomposes the preload and requires a page reload.
- Plugin changes require `tvmod repair --yes` for patched installs.
- No plugin commands or panel action buttons.
- No inter-plugin dependency management.
- No `page`/TradingView-globals permission.
- No remote registry code executes automatically; registry installs are explicit.
