# Plugin registry

TVMod v0.14.0 adds signed plugin bundles, signed registry indexes, CLI and in-app registry management/installs, bulk updates, install provenance, and automatic page reload after plugin changes in launcher mode.

There is no default registry and no remote code is loaded automatically. You add a registry by pinning its public key.

## Threat model

- A registry is a static HTTPS (or localhost HTTP for development) index.
- The index is signed with an Ed25519 key.
- Every plugin bundle is signed with the same key and carries a SHA-256 in the index.
- The public key is pinned when you add the registry.
- Installing a plugin is still installing local code. Review plugins and treat registry keys as trusted publishers.

## Generate keys

```sh
tvmod plugin keygen ./keys
```

This writes:

- `keys/private-key.pem` (mode 0600; keep offline)
- `keys/public-key.pem` (publish with the registry)

## Pack a plugin

```sh
tvmod plugin pack examples/plugins/hello-world \
  --key ./keys/private-key.pem \
  --out ./registry/hello-world.tvplug
```

The output prints the bundle SHA-256. Use both the filename and hash in the registry index.

A `.tvplug` is a JSON envelope:

```json
{
  "schema": 1,
  "manifest": { "...": "..." },
  "source": "module.exports = { ... }",
  "signature": "base64-ed25519-signature"
}
```

The signature covers a canonical JSON form of `{ schema, manifest, source }`.

## Build the registry index

Create `registry/index.json` before signing:

```json
{
  "schema": 1,
  "name": "example",
  "plugins": [
    {
      "id": "hello-world",
      "name": "Hello World",
      "description": "Adds a small example badge.",
      "version": "1.0.0",
      "author": "TVMod",
      "bundle": "hello-world.tvplug",
      "sha256": "<sha256 printed by plugin pack>"
    }
  ]
}
```

`bundle` may be relative to the index URL or an absolute HTTPS URL. Sign it:

```sh
tvmod plugin registry sign ./registry/index.json \
  --key ./keys/private-key.pem
```

The command writes `signature` into the index. The signature covers the canonical `{ schema, name, plugins }` object.

Host the `registry/` directory over HTTPS. HTTP is accepted only for `localhost`/`127.0.0.1` development.

## Use a registry

```sh
tvmod plugin registry add example https://example.com/tvmod/index.json \
  --key ./keys/public-key.pem

# Or pipe the public key instead of storing it temporarily:
cat ./keys/public-key.pem | tvmod plugin registry add example \
  https://example.com/tvmod/index.json --key -

tvmod plugin registry list
tvmod plugin registry list --json
tvmod plugin browse
tvmod plugin browse hello
tvmod plugin install hello-world
```

`plugin install`:

1. fetches the signed index
2. verifies the Ed25519 signature with the pinned key
3. downloads the bundle
4. verifies its SHA-256
5. verifies the Ed25519 bundle signature
6. checks the manifest id and version against the index
7. installs the plugin
8. records the source registry, index URL, version, and install time
9. rebuilds the installed preload
10. asks the running launcher (if available) to reload TradingView pages

In launcher mode, the page reloads automatically through the token-protected loopback control endpoint. For a patched install, run `tvmod repair --yes` after installing plugins; the patch contains a snapshot of the preload.

## Use the plugin modal

The gear modal has a **Registry** tab in launcher mode. It reads the same configured registries and pinned keys as the CLI.

### Manage registries

Open **Manage registries**:

- **Add** — enter a name, the HTTPS index URL, and the public key. Paste the PEM contents or choose a `.pem` file. The index signature is verified before the registry is saved.
- **Remove** — click **Remove**, then **Confirm remove**. Installed plugins are kept.

The add form accepts only public keys. Private keys are rejected by both the panel and the CLI, and keys are passed to the CLI over stdin rather than written to disk or placed in process arguments.

### Install and update

1. Add at least one registry.
2. Switch to **Registry**, search, and click an action.

Button states:

- **Install** — the plugin is not installed.
- **Update** — another version is installed; the install runs with `--force`.
- **Installed** — the installed version matches the registry; the button is disabled.

When an installed external plugin has a different version in a configured registry, the tab shows an **Update all** button. It:

1. installs each update without reloading the page;
2. reloads TradingView once if all updates succeed;
3. keeps the page open and lists failures if any update fails;
4. offers **Reload page** to apply successful updates after a partial failure.

If the same plugin id is offered by multiple registries, bulk update prefers the registry recorded when the plugin was installed. It skips the id only if that source registry is no longer configured or does not offer the plugin.

The tab calls the CLI through a main-process IPC bridge. Plugin ids and registry names are validated before `execFile`/`spawn` runs, no shell is involved, and public keys are capped at 16 KiB. A failed install shows the CLI error in the tab (for example, a checksum or signature failure).

Patch mode has no main-process bootstrap, so the Registry tab cannot install or manage registries there. Use the CLI and then `tvmod repair --yes`.

Remove a registry:

```sh
tvmod plugin registry remove example --yes
```

Removing a registry does not uninstall plugins that came from it.

## Install provenance

Registry installs are recorded in `<platform data dir>/registry-installs.json`:

```json
{
  "schema": 1,
  "installs": {
    "hello-world": {
      "registry": "alpha",
      "indexUrl": "https://example.com/tvmod/index.json",
      "version": "1.1.0",
      "installedAt": "2026-11-23T21:30:54.157Z"
    }
  }
}
```

`tvmod plugin list` shows the source registry. Bulk updates and `plugin install <id>` use it to choose between registries that publish the same id. Installing a local plugin or removing a plugin clears its record. Removing a registry does not delete provenance for plugins installed from it.

Provenance is advisory local metadata. Every candidate registry and bundle is still signature- and hash-verified; a record never bypasses those checks.

## Key rotation

To rotate a registry key:

1. Publish a new signed index with the new key.
2. Update the pinned key locally:

```sh
tvmod plugin registry add example https://example.com/tvmod/index.json \
  --key ./new-public-key.pem --force
```

There is no automatic key rotation or revocation in v1. Users must explicitly update the pinned key.

## Development registry

A minimal local test can use:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then add:

```sh
tvmod plugin registry add local http://127.0.0.1:8765/index.json \
  --key ./keys/public-key.pem
```

## Limitations

- No central public registry or catalog; the in-app tab only lists registries you configured.
- No background or automatic updates; the tab checks when it loads or you press **Refresh**. Installs and updates require a click.
- Provenance is keyed by registry name; replacing a registry with the same name but a different publisher changes which source bulk update prefers. All candidates are still signature-verified.
- No key revocation/expiry.
- Single-file plugins only.
- Registry indexes and bundles are limited to 1 MiB.
- Plugins are local trusted code with the capability context described in [PLUGIN_SDK.md](PLUGIN_SDK.md); the registry does not sandbox page APIs.
