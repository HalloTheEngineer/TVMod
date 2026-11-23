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

The v0.1.0 core is bundled into the preload. It does not load remote code or a third-party mod registry. Mods run in the renderer’s page/preload context and do not receive Node.js access from TVMod.

A future mod API must:

- use a capability allowlist;
- keep third-party mods out of the main process;
- pin and sign release artifacts;
- verify update manifests before applying them.

## Scope

TVMod intentionally does not touch paywall, trial, entitlement, account, or credential flows. Do not use it to bypass subscriptions or access controls.

## Releases

Release artifacts should be checksummed and signed. The v0.1.0 CI workflow publishes unsigned artifacts; treat them as development builds.
