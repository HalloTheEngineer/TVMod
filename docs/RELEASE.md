# Release process

TVMod releases are built from a `v*` tag by `.github/workflows/release.yml`.

## Artifacts

- `tvmod-<version>-linux-x64.tar.gz`
  - self-contained Bun binary
  - `preload.cjs`
  - docs, examples, Snap probe
- `SHA256SUMS`
- `<tarball>.sigstore.json`
- `SHA256SUMS.sigstore.json`
- GitHub build provenance attestation

## Signing

The release job uses **Sigstore keyless signing** with GitHub Actions OIDC:

```sh
cosign sign-blob --yes --bundle <artifact>.sigstore.json <artifact>
```

No private key is stored in the repository. The signing certificate binds the artifact to the GitHub workflow and tag that produced it. The job verifies both bundles before publishing.

## Verify a release

Install [cosign](https://docs.sigstore.dev/cosign/installation/), download the release assets into one directory, and run:

```sh
./tools/verify-release.sh 0.6.1
```

Or manually:

```sh
cosign verify-blob \
  --bundle tvmod-0.6.1-linux-x64.tar.gz.sigstore.json \
  --certificate-identity https://github.com/HalloTheEngineer/TVMod/.github/workflows/release.yml@refs/tags/v0.6.1 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  tvmod-0.6.1-linux-x64.tar.gz

cosign verify-blob \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity https://github.com/HalloTheEngineer/TVMod/.github/workflows/release.yml@refs/tags/v0.6.1 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  SHA256SUMS

sha256sum -c SHA256SUMS
```

GitHub provenance remains available separately:

```sh
gh attestation verify tvmod-0.6.1-linux-x64.tar.gz --repo HalloTheEngineer/TVMod
```

## Updating the version

1. `npm version <patch|minor> --no-git-tag-version`
2. confirm CI
3. `git tag -a v<version> -m "TVMod v<version>"`
4. `git push origin v<version>`

The release workflow rebuilds and signs the artifacts from the tag.
