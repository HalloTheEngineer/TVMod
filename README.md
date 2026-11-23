# tvmod

Local mods for **TradingView Desktop** on Linux.

TVMod is a small mod host that attaches to the official Electron app at launch. It does **not** modify `/usr/lib/tradingview` and does not distribute any TradingView code. A user-level desktop entry makes the normal TradingView icon start through TVMod.

> Status: **v0.1.0, launcher backend**. Verified against TradingView Desktop **3.5.0** (Electron 41.7.1) from the Arch/AUR package. The in-place ASAR patch backend (Vencord-style) is designed but not implemented yet. Snap support is experimental.

## Features

- **Promo suppression** — filters `initData.offerButtonInfo`, `user.available_offers`, promo feature flags, upgrade pills, and referral/coupon/three-month toasts.
- **Clean UI** — hides the AI copilot and community hub buttons by default.
- **Hide sidebar** — optional; removes the right widget bar.
- **Mod panel** — `Ctrl+Shift+M` or the floating `TV` button.
- **No app file changes** — the launcher installs a preload for the duration of the running app; app updates don’t have to be repaired.
- **Vanilla entry** — a separate “TradingView (Vanilla)” desktop entry is created too.

## Requirements

- Linux x64
- Node.js 22 or newer (the v0.1.0 CLI is a Node bundle)
- TradingView Desktop installed and launched at least once

Tested with the `tradingview 3.5.0-1` AUR package on CachyOS/Arch. The app layout is detected at install time (`/usr/lib/tradingview`, `/opt/TradingView`, or a custom `--app` path).

## Install from source

```sh
git clone <your-fork-url> tvmod
cd tvmod
npm install
npm run build
./bin/tvmod install
```

Then:

1. Close any running TradingView instance.
2. Start TradingView from your normal icon (the user-level desktop entry is named `tradingview.desktop`).
3. Press `Ctrl+Shift+M` to open the TVMod panel.

The first launch attaches an inspector to the Electron main process, prepends the preload to the default session, verifies that it is active, and closes the inspector again.

To launch from a terminal:

```sh
tvmod launch              # errors if TradingView is already running
tvmod launch --restart    # closes TradingView first
```

The CLI and desktop wrapper are installed at `~/.local/bin/tvmod` and `~/.local/share/tvmod/preload.js`.

## Commands

```text
tvmod install [--app <path>]     install the launcher, preload, and desktop entries
tvmod launch [options]           attach TVMod to the app
tvmod doctor [--app <path>]      show paths, versions, state, and running PIDs
tvmod uninstall [--purge]        remove the desktop entries, wrapper, and state
tvmod patch | repair | unpatch   planned ASAR patch backend (not implemented)
```

Launch options:

```text
--app <path>            override the detected TradingView executable
--restart               close a running instance first
--user-data-dir <path>  use a separate profile (development)
--no-reload             do not reload a page that loaded before injection
--keep-inspector        leave the main-process inspector open (development)
--print-pid             print the spawned PID
--timeout <seconds>     inspector/preload timeout
--verbose               debug output
```

## How it works

```
tvmod launch
  ├─ detect TradingView and resources/app.asar
  ├─ spawn: tradingview --inspect=127.0.0.1:0
  ├─ attach to the Electron main process
  ├─ patch Session.prototype.setPreloads
  ├─ prepend ~/.local/share/tvmod/preload.js
  ├─ verify window.__TVMOD_ACTIVE__ in the chart page
  └─ close the inspector and exit

preload.js
  ├─ webFrame.executeJavaScript: early boot traps for initData/user/flags
  ├─ webFrame.insertCSS: page-level CSS cleanup
  ├─ DOM observer: tag and hide promo/declutter nodes
  └─ shadow-DOM panel: settings and toggle controls
```

The preload runs in Electron’s renderer preload context. Mods never receive Node.js access; the only privileged code is the small launcher bootstrap.

## Safety and scope

- TVMod is **unofficial** and not affiliated with TradingView.
- No paywall, trial, entitlement, or account data is touched. Paywall/trial feature flags are intentionally left alone.
- Promo suppression may conflict with TradingView’s terms of service. Use at your own discretion.
- The launcher briefly opens a loopback inspector. It binds to `127.0.0.1` on a random port, verifies the spawned PID, and closes the inspector after bootstrap.
- No telemetry, analytics, or remote code loading.
- Do not redistribute TradingView binaries, bundles, or assets. The patch backend never publishes a patched app.

See [SECURITY.md](SECURITY.md) and [docs/PATCHING.md](docs/PATCHING.md).

## Development

```sh
npm run build       # dist/cli.cjs + dist/preload.cjs
npm run typecheck
npm test
```

Layout:

```
src/cli.ts             command dispatcher
src/commands/          install, launch, doctor, uninstall, patch placeholders
src/lib/               app detection, inspector client, desktop integration, state
src/preload.ts         Electron preload entry
src/core/              boot filters, CSS, DOM cleanup, panel, settings
test/                  unit tests for pure logic and boot filters
docs/                  architecture and patch design
```

## Roadmap

- [x] Linux launcher / injector backend
- [x] Early boot filters and DOM cleanup
- [x] Mod panel and persisted settings
- [x] User-level desktop override
- [ ] Vencord-style optional ASAR patch backend with backup/repair/unpatch
- [ ] Snap validation (inspect binding and preload readability under confinement)
- [ ] Signed release artifacts and scheduled web census
- [ ] Windows/macOS launcher
- [ ] Third-party mod manifest API

## License

MIT. See [LICENSE](LICENSE). TradingView is a trademark of TradingView, Inc.; this project is not affiliated with or endorsed by TradingView.
