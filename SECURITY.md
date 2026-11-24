# Security

## Reporting

Open a private security advisory or email the maintainer rather than filing a public issue for vulnerabilities.

## Threat model

TVMod injects a preload into TradingView Desktop by briefly using Electron’s Node inspector.

- The inspector binds to `127.0.0.1` on a random port.
- The launcher verifies the inspected process is the PID it spawned.
- The inspector is closed after bootstrap in normal launches.
- `--keep-inspector` is a development flag; it leaves the local debugger open until the app exits.

Anyone who can attach to the inspector during the bootstrap window can execute code in the TradingView main process with the user’s privileges. Use TVMod on a trusted single-user machine.

## Mods and remote code

The v0.13.0 core is bundled into the preload. It does not load remote code automatically. Local plugins are validated and embedded into the installed preload at `tvmod plugin add`/`refresh`/`install` time; explicitly added signed registries are only fetched and installed on user command.

Plugin code runs in the renderer preload context through a capability context. It does not receive Node.js, Electron IPC, or TVMod's main-process APIs. The test probe confirms `require`, `process`, `globalThis.require`, and `globalThis.process` are unavailable inside a plugin. Plugins can still use page APIs such as `fetch`, `WebSocket`, and direct DOM access, so treat third-party plugins as trusted local code and review them before installing.

Capabilities are declared in the manifest:

- `dom` — query/observe the page DOM
- `style` — inject/remove frame CSS
- `storage` — namespaced JSON local storage
- `events` — renderer-local plugin-to-plugin events

SDK v2 adds typed boolean/string/number/select settings, `onSettingsChange`, `ctx.onCleanup`, and the event bus. Setting values are validated and clamped against the signed manifest before they reach plugins. Event handlers are isolated, subscriptions are capped at 200 per plugin and removed when the plugin stops, and events never cross renderer, IPC, or network boundaries. Plugins with `events` can observe other plugins in the same page, so do not send secrets through the bus.

A signed plugin registry is available in v0.13.0. Registry indexes and bundles are Ed25519-signed, bundles are SHA-256 checked, and the registry public key is pinned when the registry is added. There is no default registry, auto-update, or revocation. Registry installation still runs local plugin code; review publishers and plugins.

The in-app Registry tab uses an IPC bridge to the CLI. Plugin ids, registry names, URLs, and public-key shape are validated before `execFile`/`spawn` runs, no shell is used, and installs still go through signature, checksum, id, and version verification. Public keys are capped at 16 KiB and passed over stdin; private keys are rejected. The bridge exists only in launcher mode.

Registry management is available from the panel: adding verifies the signed index with the pasted/selected public key before saving, and removing requires two clicks. Bulk updates use the same verified install path.

Registry installs record local provenance (`registry-installs.json`) to resolve plugin ids published by multiple registries. This metadata is advisory only: every update candidate still goes through index, bundle, signature, checksum, id, and version verification. Bulk update skips ids whose source registry is unavailable or still ambiguous.

## Platform trust boundaries

Linux is the tested platform. macOS and legacy Windows standalone releases are experimental and unsigned. Release archives are Sigstore-signed and carry GitHub provenance, but the OS may still warn when running the extracted binary (Gatekeeper or SmartScreen).

Microsoft Store MSIX builds are detected but rejected. They use package identity, filter inspector flags, and live in a read-only protected directory, so TVMod neither launches nor patches them.

Windows elevated patching creates a temporary PowerShell script and runs it with `Start-Process -Verb RunAs`. macOS uses `osascript ... with administrator privileges`. Both operate only on the `app.asar` replacement and keep backups in user-owned data directories.

## Hot reload control endpoint

The launcher starts an HTTP server bound to `127.0.0.1` on a random port. Its token is stored in `~/.local/state/tvmod/control.json` with mode 0600. The server only exposes `GET /status` and authenticated `POST /reload`. It closes and removes the control file on app quit. Patch mode does not start this server.

## Patch mode

Patch mode modifies `app.asar` after explicit `--yes` confirmation:

- it refuses Snap installs;
- it creates and verifies a backup before replacing the ASAR;
- `unpatch` only restores a backup when the current ASAR still matches the recorded patched hash;
- the patched ASAR contains only TVMod code, no TradingView redistribution.

For a root-owned install, `--system` elevates only the final `app.asar` installation with `sudo` or `pkexec`. The patch is built, backed up, and recorded in user space; the elevated command is a fixed `install` + `mv` shell sequence with paths passed as argv, not a string built from user input. Review the printed target before approving the password/GUI prompt.

Run patch mode against a trusted user-owned copy. A malicious local process able to replace `app.asar` can run code with the user’s privileges, just like any other application update.

## Scope

TVMod intentionally does not touch paywall, trial, entitlement, account, or credential flows. Do not use it to bypass subscriptions or access controls.

## Releases

Release artifacts are checksummed, Sigstore-signed, and attested by GitHub Actions. Verify signatures with `tools/verify-release.sh`.
