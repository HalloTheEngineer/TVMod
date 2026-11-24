# Release process

TVMod releases are built from a `v*` tag by `.github/workflows/release.yml`.

## Artifacts

The release job cross-compiles every target on Linux:

| Target | Archive | Binary |
| --- | --- | --- |
| `linux-x64` | `tvmod-<version>-linux-x64.tar.gz` | `tvmod` |
| `linux-arm64` | `tvmod-<version>-linux-arm64.tar.gz` | `tvmod` |
| `darwin-x64` | `tvmod-<version>-darwin-x64.tar.gz` | `tvmod` |
| `darwin-arm64` | `tvmod-<version>-darwin-arm64.tar.gz` | `tvmod` |
| `windows-x64` | `tvmod-<version>-windows-x64.zip` | `tvmod.exe`, `tvmod.cmd` |

Each archive contains the self-contained Bun binary, `preload.cjs`, docs, and examples.

Every release also publishes:

- combined `SHA256SUMS`
- `<archive>.sigstore.json` for every archive
- `SHA256SUMS.sigstore.json`
- GitHub build provenance attestations

## Signing

The publish job uses **Sigstore keyless signing** with GitHub Actions OIDC:

```sh
cosign sign-blob --yes --bundle <artifact>.sigstore.json <artifact>
```

No private key is stored in the repository. The signing certificate binds each artifact to the GitHub workflow and tag that produced it. The job verifies all bundles before publishing.

The macOS and Windows executables are unsigned by Apple/Microsoft. Signing here covers the release archive, not platform code-signing or notarization. See [PLATFORMS.md](PLATFORMS.md).

## Verify a release

Install [cosign](https://docs.sigstore.dev/cosign/installation/), download all release assets into one directory, and run from the repository:

```sh
./tools/verify-release.sh 0.13.0
```

The helper verifies every `*.tar.gz` and `*.zip` signature, the `SHA256SUMS` signature, and the checksums.

Or manually for one artifact:

```sh
cosign verify-blob \
  --bundle tvmod-0.13.0-linux-x64.tar.gz.sigstore.json \
  --certificate-identity https://github.com/HalloTheEngineer/TVMod/.github/workflows/release.yml@refs/tags/v0.13.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  tvmod-0.13.0-linux-x64.tar.gz

cosign verify-blob \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity https://github.com/HalloTheEngineer/TVMod/.github/workflows/release.yml@refs/tags/v0.13.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  SHA256SUMS

sha256sum -c SHA256SUMS
```

GitHub provenance remains available separately:

```sh
gh attestation verify tvmod-0.13.0-linux-x64.tar.gz --repo HalloTheEngineer/TVMod
```

## Local cross-builds

`scripts/targets.mjs` defines the target matrix. `TVMOD_TARGET` selects a target; the default is the host platform.

```sh
TVMOD_TARGET=windows-x64 npm run build:binary
TVMOD_TARGET=windows-x64 npm run package:release

TVMOD_TARGET=darwin-arm64 npm run build:binary
TVMOD_TARGET=darwin-arm64 npm run package:release
```

Self-tests run only when the target matches the host platform.

## Updating the version

1. `npm version <patch|minor> --no-git-tag-version`
2. confirm CI
3. `git tag -a v<version> -m "TVMod v<version>"`
4. `git push origin v<version>`

The release workflow rebuilds and signs the artifacts from the tag.
