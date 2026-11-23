# tvmod

Local mods for **TradingView Desktop** on Linux.

TVMod is a small mod host for the official Electron app. Its default **launcher backend** attaches at launch and does **not** modify `/usr/lib/tradingview`. An optional **patch backend** can embed the same preload into a user-owned `app.asar` for a Vencord-style install. No TradingView code is distributed.

> Status: **v0.3.0, launcher + optional patch backend + local plugin SDK**. Verified against TradingView Desktop **3.5.0** (Electron 41.7.1) from the Arch/AUR package. The launcher is the tested default. Patch mode currently supports user-writable installs/copies; root-owned `/usr/lib` patching and Snap validation are future work.

## Features

- **Promo suppression** — filters `initData.offerButtonInfo`, `user.available_offers`, promo feature flags, upgrade pills, and referral/coupon/three-month toasts.
- **Clean UI** — hides the AI copilot and community hub buttons by default.
- **Hide sidebar** — optional; removes the right widget bar.
- **Config button** — a gear button inside the chart opens a Vencord-style plugin modal; `Ctrl+Shift+M` also works.
- **Individual plugins** — toggle Adblock, Hide AI Copilot, Hide Community Hub, and Hide Sidebar independently.
- **Local plugin SDK** — install single-file plugins with a manifest, permissions, boolean settings, and lifecycle cleanup.
- **Launcher backend** — installs a preload for the duration of the running app; app updates don’t have to be repaired.
- **Patch backend** — optionally embeds the preload into a user-owned `app.asar`, with verified backups, `repair`, and `unpatch`.
- **Vanilla entry** — in launcher mode, a separate “TradingView (Vanilla)” desktop entry is created too.

## Requirements

- Linux x64
- **Release artifact:** no Node.js required; the launcher is a self-contained Bun binary.
- **Source build:** Node.js 22 or newer plus Bun 1.3.8 for the standalone binary.
- TradingView Desktop installed and launched at least once

Tested with the `tradingview 3.5.0-1` AUR package on CachyOS/Arch. The app layout is detected at install time (`/usr/lib/tradingview`, `/opt/TradingView`, or a custom `--app` path).

## Install from a release

Download `tvmod-<version>-linux-x64.tar.gz` and `SHA256SUMS` from the GitHub Releases page, then run:

```sh
sha256sum -c SHA256SUMS
tar -xzf tvmod-0.3.0-linux-x64.tar.gz
cd tvmod-0.2.0-linux-x64
./tvmod install
```

Then close TradingView and start it from your normal icon. The release binary does not need Node.js.

To verify the GitHub build provenance:

```sh
gh attestation verify tvmod-0.3.0-linux-x64.tar.gz --repo HalloTheEngineer/TVMod
```

## Install from source

```sh
git clone https://github.com/HalloTheEngineer/TVMod.git
cd TVMod
npm install
npm run build
npm run build:binary   # optional standalone Linux binary
./bin/tvmod install
```

Then:

1. Close any running TradingView instance.
2. Start TradingView from your normal icon (the user-level desktop entry is named `tradingview.desktop`).
3. Click the TVMod gear button at the bottom-right of the chart, or press `Ctrl+Shift+M`.

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
tvmod patch --yes                embed the preload into a user-writable app.asar
tvmod repair --yes               re-apply the patch after an app update
tvmod unpatch --yes              restore the original app.asar
tvmod plugin add <dir> [--force] install or replace a local plugin
tvmod plugin list                list local plugins
tvmod plugin remove <id> --yes   remove a plugin
tvmod plugin refresh             recompose the installed preload
tvmod plugin path                print the plugin directory
```

Patch options:

```text
--app <path>     override the detected TradingView executable
--restart        close TradingView before modifying app.asar
--yes            required confirmation
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

## Patch mode

The launcher is the default and works with the root-owned AUR install. Patch mode is for users who want the official launcher to start a modified `app.asar` with no inspector.

Patch mode currently requires a **user-writable** install. The simplest way to get one:

```sh
cp -a /usr/lib/tradingview ~/.local/opt/tradingview
tvmod install --app ~/.local/opt/tradingview/tradingview
tvmod patch --yes
```

Then start TradingView normally. The embedded preload runs from the app itself. All launchers for that copy now use the patch; `tvmod unpatch --yes` restores the verified backup.

Notes:

- A 305 MB copy is required; updates to the copy are manual (`cp` the new app, then `tvmod repair --yes`).
- Root-owned system installs are deliberately refused in v0.3.0 rather than silently elevating.
- Snap installs are read-only and cannot be patched.
- Backups and hashes live in `~/.local/share/tvmod/backups` and `~/.config/tvmod/state.json`.
- The patch is applied by extracting the ASAR, appending an inline copy of the preload to the host preload, and repacking with unpacked native modules preserved. It does not depend on a separate `require()` of a file inside the sandboxed preload.

## Plugins

The gear button opens a modal with individual plugin toggles:

| Plugin | Default | Notes |
|---|---|---|
| Adblock | on | Promo offers, upgrade pills, referral/coupon toasts, promo feature flags. Reload required for boot-time filters. |
| Hide AI Copilot | on | Removes the AI Copilot button/area. |
| Hide Community Hub | on | Removes the Community Hub button. |
| Hide Sidebar | off | Hides the right watchlist/details sidebar. |

The modal includes search, a reload banner when a boot-time plugin changes, and **Reset defaults**. Plugin state is stored under `tvmod.config.v2` in the page’s local storage and migrates the old `tvmod.settings.v1` layout automatically.

### Local plugins

External plugins live in `~/.local/share/tvmod/plugins/<id>/` with a `manifest.json` and a single JavaScript entry file. Install the bundled example:

```sh
tvmod plugin add examples/plugins/hello-world
```

Reload the TradingView page and enable **Hello World** in the gear modal. It demonstrates a badge, a boolean setting, permissions, storage, and cleanup. See [docs/PLUGIN_SDK.md](docs/PLUGIN_SDK.md) for the manifest and API.

External plugins are embedded into the installed preload at install/add/refresh time. For a patched install, run `tvmod repair --yes` after changing plugins.

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

The preload runs in Electron’s renderer preload context. Built-in cleanup never receives Node.js access. External plugins receive only the capability context described in [docs/PLUGIN_SDK.md](docs/PLUGIN_SDK.md); the privileged code is the small launcher/bootstrap and preload host.

In patch mode, the same preload bundle is appended to `preload/target-tvd-host-preload.js` inside the ASAR, wrapped in an IIFE. The host preload is sandboxed, so embedding the code is more reliable than trying to `require()` a second file from inside it.

## Safety and scope

- TVMod is **unofficial** and not affiliated with TradingView.
- No paywall, trial, entitlement, or account data is touched. Paywall/trial feature flags are intentionally left alone.
- Promo suppression may conflict with TradingView’s terms of service. Use at your own discretion.
- The launcher briefly opens a loopback inspector. It binds to `127.0.0.1` on a random port, verifies the spawned PID, and closes the inspector after bootstrap.
- Patch mode modifies `app.asar` after confirmation, keeps a verified backup, and refuses non-writable or Snap installs.
- No telemetry, analytics, or remote code loading.
- Do not redistribute TradingView binaries, bundles, or assets. The patch backend never publishes a patched app.

See [SECURITY.md](SECURITY.md) and [docs/PATCHING.md](docs/PATCHING.md).

## Development

```sh
npm run build          # dist/cli.mjs + dist/preload.cjs
npm run build:binary   # dist/tvmod standalone Linux binary
npm run package:release # release/tvmod-<version>-linux-x64.tar.gz
npm run typecheck
npm test
```

Layout:

```
src/cli.ts             command dispatcher
src/commands/          install, launch, doctor, uninstall, patch/repair/unpatch
src/lib/               app detection, inspector client, desktop integration, state, ASAR patching
src/preload.ts         Electron preload entry
src/core/              boot filters, CSS, DOM cleanup, plugin registry/config, plugin host, panel
src/lib/plugin-files.ts plugin validation, embedding, and CLI plugin install
examples/plugins/      example external plugin
test/                  unit tests for logic, boot filters, plugins, and ASAR patching
docs/                  architecture, plugin SDK, and patch design
```

## Roadmap

- [x] Linux launcher / injector backend
- [x] Early boot filters and DOM cleanup
- [x] Mod panel and persisted settings
- [x] Vencord-style plugin list with individual toggles and search
- [x] Local plugin SDK v1 with manifest, permissions, settings, and lifecycle
- [x] User-level desktop override
- [x] Optional patch backend for user-writable installs/copies with backup/repair/unpatch
- [ ] Root-owned in-place patching with explicit elevation
- [ ] Snap validation (inspect binding and preload readability under confinement)
- [ ] Signed release artifacts and scheduled web census
- [ ] Windows/macOS launcher
- [ ] Remote/signed plugin registry and hot reload

## License

MIT. See [LICENSE](LICENSE). TradingView is a trademark of TradingView, Inc.; this project is not affiliated with or endorsed by TradingView.
