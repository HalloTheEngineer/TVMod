# Plugin registry

TVMod v0.8.0 adds signed plugin bundles, signed registry indexes, CLI and in-app registry installs, and automatic page reload after plugin changes in launcher mode.

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

tvmod plugin registry list
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
8. rebuilds the installed preload
9. asks the running launcher (if available) to reload TradingView pages

In launcher mode, the page reloads automatically through the token-protected loopback control endpoint. For a patched install, run `tvmod repair --yes` after installing plugins; the patch contains a snapshot of the preload.

## Install from the plugin modal

The gear modal has a **Registry** tab in launcher mode. It reads the same configured registries and pinned keys as the CLI.

1. Add at least one registry with `tvmod plugin registry add`.
2. Open the TVMod gear modal and switch to **Registry**.
3. Search and click **Install**.

Button states:

- **Install** — the plugin is not installed.
- **Update** — another version is installed; the install runs with `--force`.
- **Installed** — the installed version matches the registry; the button is disabled.

The tab calls the CLI through a main-process IPC bridge. Plugin ids and registry names are validated before `execFile` runs, so no shell is involved. A failed install shows the CLI error in the tab (for example, a checksum or signature failure).

Patch mode has no main-process bootstrap, so the Registry tab cannot install there. Use the CLI and then `tvmod repair --yes`.

Remove a registry:

```sh
tvmod plugin registry remove example --yes
```

Removing a registry does not uninstall plugins that came from it.

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
- No automatic updates; installs and updates are explicit. The Registry tab only installs when you click it.
- No key revocation/expiry.
- Single-file plugins only.
- Registry indexes and bundles are limited to 1 MiB.
- Plugins are local trusted code with the capability context described in [PLUGIN_SDK.md](PLUGIN_SDK.md); the registry does not sandbox page APIs.
