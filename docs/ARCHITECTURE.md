# Architecture

```
┌──────────────────────────────┐
│ tvmod CLI                    │
│  detect app / spawn / inspect│
└──────────────┬───────────────┘
               │ WebSocket (localhost)
┌──────────────▼───────────────┐
│ Electron main process        │
│  patch Session.setPreloads   │
│  prepend ~/.local/share/...  │
│  verify PID, close inspector │
└──────────────┬───────────────┘
               │ preload
┌──────────────▼───────────────┐
│ TradingView renderer         │
│  early boot traps            │
│  CSS + DOM observer          │
│  shadow-DOM plugin modal     │
└──────────────────────────────┘
```

## Launcher

The CLI spawns the detected TradingView executable with `--inspect=127.0.0.1:0`. It reads the inspector WebSocket URL from the launcher log, connects to the Electron main process, verifies `process.pid` matches the spawned PID, and evaluates a small bootstrap.

The bootstrap:

- patches `Session.prototype.setPreloads` so the app’s own preload setup also keeps TVMod’s preload;
- prepends the installed preload to the default session;
- returns immediately or after `app.ready` depending on startup timing.

The CLI then confirms the preload is present, verifies that a loaded TradingView page sees `window.__TVMOD_ACTIVE__`, and closes the inspector. The app continues running without the inspector.

If a chart page loaded before the preload was installed, the CLI reloads that page once (unless `--no-reload`). A fresh app launch normally attaches before the first page load.

## Preload and core

The preload embeds the entire core (esbuild bundle, `electron` external). It:

- skips non-top-level frames, local `file://` app pages, login/checkout/pricing routes, and `auth.*` hosts;
- runs `webFrame.executeJavaScript` before the page’s inline scripts to install accessors for `initData`, `user`, `shopConf`, and `featureToggleState`;
- inserts page CSS for promo/declutter selectors;
- after `DOMContentLoaded`, applies DOM tags, mounts the shadow-DOM plugin modal, and starts a throttled `MutationObserver`.

The boot traps remove offer buttons/offers, set known promo and ad-detection feature flags to `0`, disable AI Copilot flags, hide desktop “Analyze markets in TradingView Desktop” upgrade overlays, and apply Privacy Shield feature flags. The upgrade-overlay blocker watches added DOM nodes for the exact desktop-upgrade copy and tags the containing dialog/overlay with `data-tvmod-upgrade`; a DOM fallback also scans modal-like containers. When Privacy Shield is enabled, the boot script also wraps `fetch`, `XMLHttpRequest`, and `sendBeacon` to block a curated tracker/ad host list. Paywall, trial, and entitlement flags are deliberately excluded.

## Plugin config

Plugins are declared in `src/core/plugins.ts`:

- `adblock` (default on, reload required for boot filters)
- `privacy-shield` (default off, reload required)
- `hide-ai-copilot` (default on, feature-flag disable, reload required)
- `keyword-filter` (default off, typed keywords/scope)
- `focus-mode` (default off)
- `reduce-motion` (default off)
- `quick-actions` (default off, typed button/hotkey settings)

State is stored in `localStorage` under `tvmod.config.v2`:

```json
{
  "version": 2,
  "plugins": {
    "adblock": { "enabled": true },
    "privacy-shield": { "enabled": false },
    "hide-ai-copilot": { "enabled": true },
    "keyword-filter": { "enabled": false, "settings": { "keywords": "", "scope": "all" } },
    "focus-mode": { "enabled": false },
    "reduce-motion": { "enabled": false },
    "quick-actions": { "enabled": false, "settings": { "showButton": true, "enableHotkeys": true } }
  }
}
```

The preload reads this synchronously before installing the boot traps, so boot filtering reflects the user’s choices on the next page load. The plugin modal writes the same key and updates the current page’s CSS attributes immediately. The legacy `tvmod.settings.v1` flat layout is migrated on first load.

A gear button at the bottom-right of TradingView opens the modal. `Ctrl+Shift+M` toggles it; search filters the plugin list; a reload banner appears when Adblock changes; **Reset defaults** restores the plugin defaults.

### Local plugins

External plugins live under `~/.local/share/tvmod/plugins/<id>/` (`manifest.json` + a single JavaScript entry). `tvmod plugin add`, `remove`, or `refresh` validates them and embeds `{ manifest, source }` objects at the top of the installed preload:

```js
globalThis.__TVMOD_EXTERNAL_PLUGINS__ = [ ... ];
```

Built-in definitions declare a category (`ads`, `interface`, `accessibility`, `tools`, `other`). The panel groups plugins by category and filters empty sections during search. External manifests can set the same field.

The core validates the embedded data again, adds external definitions to the panel, and uses `PluginHost` to start/stop enabled plugins. Each plugin gets a capability context (`dom`, `style`, `storage`, optional `events`), typed settings, namespaced storage, `ctx.onCleanup`, and lifecycle cleanup.

SDK v2 settings are normalized against validated manifest definitions before they reach the plugin. The panel renders boolean toggles, text/number inputs, and select dropdowns. A plugin can export `onSettingsChange` to update in place; otherwise the host stops and restarts it. `ctx.onCleanup` callbacks, injected styles, DOM observers, and event subscriptions are disposed on stop. The event bus is renderer-local, permissioned, capped per plugin, and isolates handler failures. Exceptions are caught and shown as an `error` badge in the modal; the panel remains usable.

Plugin code is executed with `new Function(...)` in the preload context with `require` and `process` shadowed as `undefined`. It has no Node.js or Electron IPC access, but it can still access page APIs such as `fetch` and the DOM. Treat local plugins as trusted code.

Focus Mode collapses the sidebar using TradingView’s native right-toolbar toggle, hides the right toolbar and bottom controls, and expands the chart container. Visual-only sidebar, toolbar, watchlist, details, trade-button, and bottom-control plugins were removed because TradingView provides equivalent native controls; stale config states are dropped during normalization.

`keyword-filter` tags matching watchlist rows and news/headline cards with `data-tvmod-filtered` and clears tags when disabled. `quick-actions` mounts a small isolated action menu and keyboard handler, clicking existing Notes/Calculator controls rather than duplicating their UI. Privacy Shield DOM work hides cookie toast groups and rewrites tracking parameters on clicked links.

Bundled examples are installed by `plugin add-example`, which resolves the release `examples/plugins` directory or a source checkout before using the normal plugin install path.

Patch mode embeds the composed preload snapshot; after plugin changes run `tvmod repair --yes`.

## Plugin registry and hot reload

`tvmod plugin pack` creates an Ed25519-signed `.tvplug` envelope. A registry is a static JSON index signed by the same Ed25519 key, listing bundle URLs and SHA-256 hashes. `plugin registry add` pins the public key; `plugin install` verifies the index, bundle hash, bundle signature, and id/version before installing. There is no default registry and no automatic update.

In launcher mode, the main-process bootstrap starts a loopback HTTP server with a random token stored in `~/.local/state/tvmod/control.json` (mode 0600). `plugin add/remove/refresh/install` calls `POST /reload` to reload TradingView pages after recomposing the preload. Patch mode has no main-process control server and still requires `tvmod repair --yes` or a manual reload.

The main-process bootstrap also registers the registry IPC handlers: `tvmod:registry:list`, `sources`, `add`, `remove`, `pick-key`, `install`, and `tvmod:reload`. The preload exposes them to the isolated core only; the panel's Registry tab uses them for browsing, registry management, updates, and page reloads. Handlers validate plugin ids, registry names, URLs, and public-key shape, use `execFile` (or `spawn` with stdin for key import) without a shell, and return structured results. They exist only in launcher mode, which is why patch installs still use the CLI.

Bulk updates run `plugin install ... --no-reload` sequentially, then call the shared page-reload helper once. Partial failures leave the page open so the panel can show which plugins failed and offer a manual reload.

Successful registry installs write `<data dir>/registry-installs.json` with the source registry, index URL, version, and timestamp. `plugin browse --json` includes `installedVersion` and `sourceRegistry`; the panel and bulk-update planner use them to choose the source registry when multiple registries publish the same id. Local plugin add/remove clears the record. Provenance is advisory and never bypasses registry signature checks.

## Platform layers

`src/lib/paths.ts` resolves native config/data/state/log locations and launcher paths for Linux, macOS, and Windows. `src/lib/app-detect.ts` inspects Linux executables, macOS `.app` bundles, Windows standalone directories, and Windows MSIX package locations. `src/lib/proc.ts` lists and terminates processes with `pgrep`/`ps`, `/proc`, or `tasklist`/`taskkill`. `src/lib/desktop.ts` writes Linux `.desktop` entries, macOS `.command` launchers, or Windows Start Menu shortcuts. `src/lib/asar-patch.ts` contains platform-specific elevation for Linux, macOS, and Windows.

MSIX packages are represented as a separate flavor only so commands can fail with a clear explanation; there is no MSIX launch or patch backend. See [PLATFORMS.md](PLATFORMS.md).

## Desktop integration

`tvmod install` writes:

- `~/.local/share/tvmod/preload.js`
- `~/.local/bin/tvmod`
- `~/.local/share/applications/tradingview.desktop` (modded)
- `~/.local/share/applications/tradingview-vanilla.desktop` (unmodified)

The user-level `tradingview.desktop` shadows the system launcher for that user. The vanilla entry remains available. Existing user-level files are backed up once and restored on uninstall.

## Patch backend

The optional patch backend uses the same preload bundle, but embeds it into the app:

1. Extract `app.asar` with `@electron/asar`.
2. Append an IIFE-wrapped copy of the preload to `preload/target-tvd-host-preload.js`.
3. Repack with `unpack: '**/*.node'`, preserving the native modules in `app.asar.unpacked`.
4. Replace `app.asar` after a verified backup.

`tvmod repair` re-applies after an app update; `tvmod unpatch` restores only when the current hash matches the patched hash. `tvmod launch` detects an active patch and starts the app normally instead of injecting through the launcher a second time. See [PATCHING.md](PATCHING.md).

## Patched-copy installer

`tvmod install --copy --patch --yes` is the one-command path for a root-owned app:

1. Copy the detected app directory to `~/.local/opt/tradingview`.
2. Detect the copied executable and write state/launcher entries against it.
3. Patch the copied ASAR with the same verified backup/repair path.

No elevation is used. The copy uses the same TradingView profile, so a running original instance must be closed before launching the copy. Updates to the copy are manual.

## Root-owned in-place patch

`tvmod patch --system --yes` builds and verifies the patched ASAR and backup as the user, then runs a fixed `sudo`/`pkexec` command that installs the new ASAR to a root-owned target directory and renames it atomically. Only that file replacement is elevated. State and backups remain user-owned. The app must be stopped first (`--restart` is explicit).

## Running-instance prompt

Before launching, `tvmod launch` checks for any running TradingView process when no development `--user-data-dir` is supplied. If one exists:

- `--restart` closes it and continues.
- otherwise it asks through a TTY prompt, Zenity, or KDialog;
- `--no-prompt` fails instead of asking;
- if no prompt mechanism is available, it sends a desktop notification and exits.

The launcher waits for a graceful exit before spawning. Unsaved-changes dialogs in the app can make this fail with an actionable error.

## Electron compatibility note

Electron 41 still supports `session.getPreloads`/`setPreloads`, but logs them as deprecated in favor of `registerPreloadScript`. A future release should support the new API and keep the legacy path as a fallback.
