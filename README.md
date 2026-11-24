# tvmod

Local mods for **TradingView Desktop**. Linux is the tested baseline; macOS and legacy standalone Windows builds are experimental. Microsoft Store MSIX builds are detected but not supported.

TVMod is a small mod host for the official Electron app. Its default **launcher backend** attaches at launch and does **not** modify `/usr/lib/tradingview`. An optional **patch backend** can embed the same preload into a user-owned copy or, with explicit elevation, the system `app.asar` for a Vencord-style install. No TradingView code is distributed.

> Status: **v0.13.0, cross-platform launcher (Linux tested, macOS/Windows experimental) + patched-copy/in-place installer + signed plugin registry with in-app management and bulk updates + Plugin SDK v2 + a categorized cleanup pack + signed releases**. Verified against TradingView Desktop **3.5.0** (Electron 41.7.1) on Linux from the Arch/AUR package. Patch mode supports user-writable copies and root-owned installs with explicit `--system` elevation. Snap launch is supported experimentally; final confinement validation requires a snapd host. Microsoft Store MSIX builds are detected and rejected with an explanation.

## Features

- **Promo suppression** — filters `initData.offerButtonInfo`, `user.available_offers`, promo feature flags, upgrade pills, and referral/coupon/three-month toasts.
- **Clean UI** — hides the AI copilot and community hub buttons by default.
- **Hide sidebar** — optional; removes the right widget bar.
- **Config button** — a gear button inside the chart opens a Vencord-style plugin modal; `Ctrl+Shift+M` also works.
- **Individual plugins** — a categorized cleanup pack with sidebar, toolbar, trade-button, focus-mode, and motion controls.
- **Categorized plugin screen** — a larger plugin modal groups plugins into Ads, Interface, Accessibility, Tools, and Other.
- **Bundled example plugins** — install Clock, Per-Symbol Notes, and Position Size Calculator with `tvmod plugin add-example`.
- **Plugin SDK v2** — single-file plugins with typed settings, lifecycle hooks, registered cleanup, and a permissioned plugin event bus.
- **Signed plugin registry** — Ed25519-signed indexes/bundles, SHA-256 verification, pinned registry keys, and CLI browse/install.
- **Registry browser** — a Registry tab in the gear modal lists configured registries, filters plugins, installs or updates them, and manages registry keys from the panel.
- **Bulk updates** — the Registry tab detects available updates and can apply all of them with a single TradingView reload.
- **Install provenance** — registry installs record their source registry, so duplicate plugin ids resolve to the registry that installed the plugin.
- **Plugin hot reload** — launcher mode reloads TradingView pages automatically after plugin install/remove/refresh.
- **Launcher backend** — installs a preload for the duration of the running app; app updates don’t have to be repaired.
- **Patch backend** — optionally embeds the preload into a user-owned `app.asar`, with verified backups, `repair`, and `unpatch`.
- **One-command patched copy** — `tvmod install --copy --patch --yes` copies TradingView into a user-owned app-data folder and patches it without root.
- **In-place system patch** — `tvmod patch --system --yes` elevates only the `app.asar` replacement (sudo/pkexec, macOS administrator prompt, or Windows UAC); backups and state stay user-owned.
- **Restart prompt** — clicking the icon while TradingView is open offers to close and relaunch it (Zenity/KDialog, macOS dialog, Windows message box, or a terminal prompt).
- **Compatibility census** — a weekly Playwright census of the public chart page detects missing `data-name` selectors and boot/global APIs, with a committed baseline.
- **Signed releases** — release tarballs and checksums are signed with Sigstore keyless signing and carry GitHub provenance.
- **Snap-aware launcher** — detects `/snap/bin/tradingview`, uses `snap run`, and keeps the preload in `~/snap/tradingview/common/tvmod/`.
- **Vanilla entry** — in launcher mode, a separate “TradingView (Vanilla)” entry is created too.
- **Cross-platform builds** — Linux, macOS, and Windows standalone release artifacts are cross-built in CI, checksummed, and Sigstore-signed. See [docs/PLATFORMS.md](docs/PLATFORMS.md).

## Requirements

| Platform | Status | Notes |
| --- | --- | --- |
| Linux x64 | **Tested** | AUR/tarball; Snap experimental |
| Linux arm64 | Built, untested | Cross-built release |
| macOS arm64/x64 | **Experimental** | Unsigned binary; launcher and patch unverified on hardware |
| Windows x64 standalone | **Experimental** | Legacy unpacked build only |
| Windows x64 MSIX | **Unsupported** | Store package; inspector flags are filtered |

- **Release artifact:** no Node.js required; the launcher is a self-contained Bun binary.
- **Source build:** Node.js 22 or newer plus Bun 1.3.8 for the standalone binary.
- TradingView Desktop installed and launched at least once.

Tested with the `tradingview 3.5.0-1` AUR package on CachyOS/Arch. The app layout is detected at install time. See [docs/PLATFORMS.md](docs/PLATFORMS.md) for per-platform paths and limitations.

## Install from a release

Download the archive for your platform and `SHA256SUMS` from the GitHub Releases page.

**Linux:**

```sh
sha256sum -c SHA256SUMS
tar -xzf tvmod-<version>-linux-x64.tar.gz
cd tvmod-<version>-linux-x64
./tvmod install
```

**macOS (experimental):**

```sh
tar -xzf tvmod-<version>-darwin-arm64.tar.gz   # or darwin-x64
cd tvmod-<version>-darwin-arm64
xattr -dr com.apple.quarantine ./tvmod
./tvmod install
```

**Windows standalone (experimental):**

```bat
Expand-Archive tvmod-<version>-windows-x64.zip -DestinationPath .
cd tvmod-<version>-windows-x64
.\tvmod.exe install
```

Then close TradingView and start it from the TVMod launcher. The release binary does not need Node.js.

To verify the GitHub build provenance:

```sh
gh attestation verify tvmod-<version>-linux-x64.tar.gz --repo HalloTheEngineer/TVMod
```

To verify the Sigstore signatures, download all `.sigstore.json` assets and run:

```sh
cosign verify-blob \
  --bundle tvmod-<version>-linux-x64.tar.gz.sigstore.json \
  --certificate-identity https://github.com/HalloTheEngineer/TVMod/.github/workflows/release.yml@refs/tags/v0.13.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  tvmod-<version>-linux-x64.tar.gz
```

The repo helper `tools/verify-release.sh 0.13.0` verifies every archive signature and the combined checksum.

## Install from source

```sh
git clone https://github.com/HalloTheEngineer/TVMod.git
cd TVMod
npm install
npm run build
npm run build:binary   # host-platform standalone binary
./bin/tvmod install
```

Then:

1. Close any running TradingView instance.
2. Start TradingView from the TVMod launcher. On Linux that is the `TradingView` desktop entry; on macOS it is `~/Applications/TradingView (TVMod).command`; on Windows it is the `TradingView (TVMod)` Start Menu shortcut.
3. Click the TVMod gear button at the bottom-right of the chart, or press `Ctrl+Shift+M`.

The first launch attaches an inspector to the Electron main process, prepends the preload to the default session, verifies that it is active, and closes the inspector again.

To launch from a terminal:

```sh
tvmod launch              # errors if TradingView is already running
tvmod launch --restart    # closes TradingView first
```

The CLI wrapper is installed at `~/.local/bin/tvmod` on Linux/macOS and `%LOCALAPPDATA%\tvmod\bin\tvmod.cmd` on Windows. The preload lives in the platform data directory shown by `tvmod doctor`.

## Commands

```text
tvmod install [options]          install the launcher, preload, and shortcuts
tvmod launch [options]           attach TVMod to the app
tvmod doctor [--app <path>]      show paths, versions, state, and running PIDs
tvmod uninstall [--purge]        remove the launcher entries, wrapper, and state
tvmod patch --yes                embed the preload into a user-writable app.asar
tvmod repair --yes               re-apply the patch after an app update
tvmod unpatch --yes              restore the original app.asar
tvmod plugin add <dir> [--force] install or replace a local plugin
tvmod plugin examples            list bundled example plugins
tvmod plugin add-example <id>    install a bundled example
tvmod plugin list                list local plugins
tvmod plugin remove <id> --yes   remove a plugin
tvmod plugin refresh             recompose the installed preload
tvmod plugin path                print the plugin directory
tvmod plugin keygen [dir]        generate Ed25519 signing keys
tvmod plugin pack <dir> --key <private> pack a signed .tvplug bundle
tvmod plugin registry add <name> <url> --key <public-key.pem|->
tvmod plugin registry list [--json]
tvmod plugin registry remove <name> --yes
tvmod plugin registry sign <index.json> --key <private>
tvmod plugin browse [query] [--registry <name>] [--json]
tvmod plugin install <id> [--registry <name>] [--force] [--no-reload]
```

Install options:

```text
--app <path>     override the detected TradingView executable
--copy           copy TradingView to ~/.local/opt/tradingview first
--patch          patch the installed/copied app.asar (requires --yes)
--force          replace an existing user-owned copy
--yes            required confirmation for --patch
```

Root-owned in-place mode is available for users who want to patch the system install:

```sh
tvmod patch --system --yes
tvmod unpatch --system --yes
```

Only the final `app.asar` replacement is elevated with `sudo` or `pkexec`; the patch is built and backed up in user space. The app must be closed, or pass `--restart`.

Patch options:

```text
--app <path>     override the detected TradingView executable
--restart        close TradingView before modifying app.asar
--system         elevate only the app.asar replacement (sudo/pkexec)
--yes            required confirmation
```

Launch options include `--no-prompt` to fail instead of asking to close a running instance.

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

The safest path is a **user-writable** copy. The one-command path copies the app into `~/.local/opt/tradingview` and patches it without root:

```sh
tvmod install --copy --patch --yes
```

The manual equivalent remains:

```sh
cp -a /usr/lib/tradingview ~/.local/opt/tradingview
tvmod install --app ~/.local/opt/tradingview/tradingview
tvmod patch --yes
```

Then start TradingView normally. The embedded preload runs from the app itself. All launchers for that copy now use the patch; `tvmod unpatch --yes` restores the verified backup.

Notes:

- A 305 MB copy is required; updates to the copy are manual (`cp` the new app, then `tvmod repair --yes`).
- Root-owned system installs use `tvmod patch --system --yes`; only the final file replacement is elevated. State and backups remain user-owned.
- Snap installs are read-only and cannot be patched.
- Backups and hashes live in `~/.local/share/tvmod/backups` and `~/.config/tvmod/state.json`.
- The patch is applied by extracting the ASAR, appending an inline copy of the preload to the host preload, and repacking with unpacked native modules preserved. It does not depend on a separate `require()` of a file inside the sandboxed preload.

## Plugins

The gear button opens a larger, categorized plugin modal:

| Plugin | Category | Default | Notes |
|---|---|---|---|
| Adblock | Ads & promotions | on | Promo offers, upgrade pills, referral/coupon toasts, promo feature flags. Reload required for boot-time filters. |
| Hide AI Copilot | Interface | on | Removes the AI Copilot button/area. |
| Hide Community Hub | Interface | on | Removes the Community Hub button. |
| Hide Sidebar | Interface | off | Collapses the right watchlist/details sidebar. |
| Hide Right Toolbar | Interface | off | Removes the right button column. |
| Hide Watchlist | Interface | off | Hides the watchlist while keeping details. |
| Hide Details Panel | Interface | off | Hides details while keeping the watchlist. |
| Hide Bottom Controls | Interface | off | Hides the bottom timeframe/date-range bar. |
| Hide Toolbar Extras | Interface | off | Hides screeners, Pine, calendars, notifications, chats, help, and object tree. |
| Hide Trade Buttons | Interface | off | Hides buy/sell and broker buttons without touching entitlements. |
| Focus Mode | Interface | off | Collapses the sidebar and hides the right toolbar and bottom controls. |
| Reduce Motion | Accessibility | off | Disables UI transitions, animations, and smooth scrolling. |

The modal includes search, category sections, a reload banner when a boot-time plugin changes, and **Reset defaults**. The **Registry** tab browses your configured signed registries and exposes Install, Update, and Installed states; installs use the same verified CLI path and reload TradingView through the launcher control endpoint. Plugin state is stored under `tvmod.config.v2` in the page’s local storage and migrates the old `tvmod.settings.v1` layout automatically.

### Local plugins

External plugins live in `~/.local/share/tvmod/plugins/<id>/` with a `manifest.json` and a single JavaScript entry file. Install the bundled example:

```sh
tvmod plugin add examples/plugins/hello-world
```

Reload the TradingView page and enable **Hello World** in the gear modal. It demonstrates boolean, string, number, and select settings, in-place `onSettingsChange` updates, permissions, storage, and cleanup.

Bundled examples can be listed and installed directly:

```sh
tvmod plugin examples
tvmod plugin add-example clock
tvmod plugin add-example symbol-notes
tvmod plugin add-example position-size
```

SDK v2 also adds `ctx.onCleanup` and a permissioned plugin-to-plugin event bus (`ctx.events`). Existing v1 plugins and boolean settings remain compatible. See [docs/PLUGIN_SDK.md](docs/PLUGIN_SDK.md) for the manifest and API.

External plugins are embedded into the installed preload at install/add/refresh time. Launcher mode reloads TradingView pages automatically through a token-protected loopback control endpoint. For a patched install, run `tvmod repair --yes` after changing plugins.

### Signed registry

A registry is a static index plus signed `.tvplug` bundles. Keys are Ed25519; indexes and bundles are verified against a pinned public key, and each bundle’s SHA-256 is checked before installation.

```sh
tvmod plugin keygen ./keys
tvmod plugin pack examples/plugins/hello-world --key ./keys/private-key.pem --out ./registry/hello-world.tvplug
# create registry/index.json with the printed sha256
tvmod plugin registry sign ./registry/index.json --key ./keys/private-key.pem
tvmod plugin registry add example https://example.com/tvmod/index.json --key ./keys/public-key.pem
tvmod plugin browse
tvmod plugin install hello-world
```

The gear modal’s **Registry** tab uses the same registry configuration. Open **Manage registries** to add a registry with its HTTPS index URL and public key (paste it or choose a `.pem` file), or remove one. Search for a plugin and click **Install**; an older installed version shows **Update**, and a current version shows **Installed**. When updates exist, **Update all** installs them sequentially and reloads TradingView once. If multiple registries offer the same plugin id, bulk update uses the source registry recorded when the plugin was installed. It only skips the id when that source is unavailable or still ambiguous. The modal does not add a default registry or bypass key pinning.

See [docs/PLUGIN_REGISTRY.md](docs/PLUGIN_REGISTRY.md) for the formats, key rotation, hosting, and security model. There is no default registry.

## Snap

TVMod detects the official Snap launcher and places the preload under `~/snap/tradingview/common/tvmod/` so a confined app can read it. Snap installs use the launcher backend only; the Snap mount is read-only.

Snap support is **experimental** until validated on a confined snapd host. Run the probe and report the log:

```sh
./tools/snap/probe.sh
```

See [docs/SNAP.md](docs/SNAP.md) for the expected output and failure modes.

## Compatibility census

The census captures the public TradingView chart page (guest, no account) and compares it with `tools/census/baseline.json`:

- `data-name` selectors used by the DOM layer
- `initData` keys
- `TradingView`, `TVD`, and `TVSettings` keys
- feature-toggle key hash/count
- script count and chart readiness

Run it locally:

```sh
npx playwright install chromium
npm run census
```

If it reports drift, review the report and update the baseline only after verifying the changes:

```sh
npm run census -- --update
```

The weekly `.github/workflows/census.yml` workflow opens or updates a `[census] TradingView UI/config drift` issue on failure and closes it when the census is green again. It does not use an account, cookies, or private data.

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
- Patch mode modifies `app.asar` after confirmation, keeps a verified backup, and refuses non-writable, Snap, and MSIX installs.
- No telemetry, analytics, or remote code loading.
- Do not redistribute TradingView binaries, bundles, or assets. The patch backend never publishes a patched app.

See [SECURITY.md](SECURITY.md) and [docs/PATCHING.md](docs/PATCHING.md).

## Development

```sh
npm run build          # dist/cli.mjs + dist/preload.cjs
npm run build:binary   # host-platform standalone binary
npm run package:release # release/tvmod-<version>-<target>.*
TVMOD_TARGET=windows-x64 npm run build:binary
TVMOD_TARGET=windows-x64 npm run package:release
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
src/lib/plugin-signing.ts Ed25519 bundles/indexes
src/lib/registry.ts     registry config, fetch, and verification
src/lib/plugin-provenance.ts registry install source records
src/lib/control.ts      launcher hot-reload control client
src/commands/plugin-dist.ts pack/sign/registry/install commands
src/lib/copy-app.ts    user-owned copy installer
src/lib/asar-patch.ts  patch build, backup, elevated replacement
scripts/targets.mjs    cross-build target matrix
docs/PLATFORMS.md      support matrix and per-platform paths
src/lib/restart-prompt.ts running-instance prompt
tools/census/          Playwright compatibility baseline/reporting
tools/snap/            confined Snap probe script
tools/verify-release.sh Sigstore + checksum verification helper
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
- [x] Plugin SDK v2 with typed settings, lifecycle hooks, cleanup registration, and events
- [x] User-level desktop override
- [x] Optional patch backend for user-writable installs/copies with backup/repair/unpatch
- [x] One-command user-owned copy + patch installer
- [x] Restart prompt for a running TradingView instance
- [x] Root-owned in-place patching with explicit, minimal elevation
- [x] Snap-aware paths, `snap run` launch, and a confinement probe
- [ ] Snap validation on a confined snapd host (inspect binding and preload readability)
- [x] Sigstore keyless release signing and GitHub provenance
- [x] Ed25519-signed plugin registry, in-app registry browser, and hot page reload
- [x] Registry management and bulk updates in the plugin modal
- [x] Installed-plugin registry provenance for duplicate ids
- [x] Categorized UI cleanup pack with Focus Mode and Reduce Motion
- [x] Bundled Clock, Per-Symbol Notes, and Position Size Calculator examples
- [x] Scheduled web compatibility census with issue reporting
- [x] Cross-platform builds and best-effort macOS launcher
- [x] Windows standalone detection/launcher with MSIX detection and a clear unsupported error
- [ ] macOS launcher/patch validation on real hardware
- [ ] Windows MSIX support (blocked by package identity and filtered inspector flags)

## License

MIT. See [LICENSE](LICENSE). TradingView is a trademark of TradingView, Inc.; this project is not affiliated with or endorsed by TradingView.
