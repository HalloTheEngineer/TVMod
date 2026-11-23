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

The v0.6.0 core is bundled into the preload. It does not load remote code or a remote plugin registry. Local plugins are validated and embedded into the installed preload at `tvmod plugin add`/`refresh` time.

Plugin code runs in the renderer preload context through a capability context. It does not receive Node.js, Electron IPC, or TVMod's main-process APIs. The test probe confirms `require`, `process`, `globalThis.require`, and `globalThis.process` are unavailable inside a plugin. Plugins can still use page APIs such as `fetch`, `WebSocket`, and direct DOM access, so treat third-party plugins as trusted local code and review them before installing.

Capabilities are declared in the manifest:

- `dom` — query/observe the page DOM
- `style` — inject/remove frame CSS
- `storage` — namespaced JSON local storage

No remote registry, auto-update, or dynamic download exists in v1. A future registry must add signing, review, and update verification.

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

Release artifacts should be checksummed and signed. The v0.6.0 CI workflow publishes unsigned artifacts; treat them as development builds.
