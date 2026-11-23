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
│  shadow-DOM panel            │
└──────────────────────────────┘
```

## Launcher

The CLI spawns the detected TradingView executable with `--inspect=127.0.0.1:0`. It reads the inspector WebSocket URL from the launcher log, connects to the Electron main process, and evaluates a small bootstrap.

The bootstrap:

- patches `Session.prototype.setPreloads` so the app’s own preload setup also keeps TVMod’s preload;
- prepends the installed preload to the default session;
- returns immediately or after `app.ready` depending on startup timing.

The CLI then confirms the preload is present, verifies that a loaded TradingView page sees `window.__TVMOD_ACTIVE__`, and closes the inspector. The app continues running without the inspector.

If a chart page loaded before the preload was installed, the CLI reloads that page once (unless `--no-reload`). A fresh app launch normally attaches before the first page load.

## Preload and core

The preload embeds the entire core (esbuild bundle, `electron` external). It:

- runs `webFrame.executeJavaScript` before the page’s inline scripts to install accessors for `initData`, `user`, `shopConf`, and `featureToggleState`;
- inserts page CSS for promo/declutter selectors;
- after `DOMContentLoaded`, applies DOM tags, mounts the shadow-DOM panel, and starts a `MutationObserver`.

The boot traps remove offer buttons/offers and set known promo feature flags to `0`. Paywall, trial, and entitlement flags are deliberately excluded.

## Settings

Settings live in `localStorage` under `tvmod.settings.v1`. The preload reads them synchronously before installing the boot traps, so boot filtering reflects the user’s choices on the next page load. The panel writes the same key and updates the current page’s CSS attributes immediately.

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

## Electron compatibility note

Electron 41 still supports `session.getPreloads`/`setPreloads`, but logs them as deprecated in favor of `registerPreloadScript`. A future release should support the new API and keep the legacy path as a fallback.
