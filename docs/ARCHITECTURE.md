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

The boot traps remove offer buttons/offers and set known promo feature flags to `0` when the **Adblock** plugin is enabled. Paywall, trial, and entitlement flags are deliberately excluded.

## Plugin config

Plugins are declared in `src/core/plugins.ts`:

- `adblock` (default on, reload required for boot filters)
- `hide-ai-copilot` (default on)
- `hide-community-hub` (default on)
- `hide-sidebar` (default off)

State is stored in `localStorage` under `tvmod.config.v2`:

```json
{
  "version": 2,
  "plugins": {
    "adblock": { "enabled": true },
    "hide-ai-copilot": { "enabled": true },
    "hide-community-hub": { "enabled": true },
    "hide-sidebar": { "enabled": false }
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

The core validates the embedded data again, adds external definitions to the panel, and uses `PluginHost` to start/stop enabled plugins. Each plugin gets a capability context (`dom`, `style`, `storage`), boolean settings, namespaced storage, and lifecycle cleanup. Settings changes restart the plugin. Exceptions are caught and shown as an `error` badge in the modal; the panel remains usable.

Plugin code is executed with `new Function(...)` in the preload context with `require` and `process` shadowed as `undefined`. It has no Node.js or Electron IPC access, but it can still access page APIs such as `fetch` and the DOM. Treat local plugins as trusted code.

Patch mode embeds the composed preload snapshot; after plugin changes run `tvmod repair --yes`.

## Plugin registry and hot reload

`tvmod plugin pack` creates an Ed25519-signed `.tvplug` envelope. A registry is a static JSON index signed by the same Ed25519 key, listing bundle URLs and SHA-256 hashes. `plugin registry add` pins the public key; `plugin install` verifies the index, bundle hash, bundle signature, and id/version before installing. There is no default registry and no automatic update.

In launcher mode, the main-process bootstrap starts a loopback HTTP server with a random token stored in `~/.local/state/tvmod/control.json` (mode 0600). `plugin add/remove/refresh/install` calls `POST /reload` to reload TradingView pages after recomposing the preload. Patch mode has no main-process control server and still requires `tvmod repair --yes` or a manual reload.

The main-process bootstrap also registers `tvmod:registry:list` and `tvmod:registry:install` IPC handlers. The preload exposes them to the isolated core only; the panel's Registry tab calls them to list configured registries and to run `plugin browse --json` / `plugin install`. The handlers validate plugin ids and registry names, use `execFile` without a shell, and return a structured result. They exist only in launcher mode, which is why patch installs still use the CLI.

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
