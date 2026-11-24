#!/bin/sh
set -eu

if [ $# -ne 1 ]; then
  echo "usage: $0 <version>   (for example: $0 0.14.0)" >&2
  exit 1
fi

version="$1"
repo="HalloTheEngineer/TVMod"
identity="https://github.com/${repo}/.github/workflows/release.yml@refs/tags/v${version}"
issuer="https://token.actions.githubusercontent.com"

if ! command -v cosign >/dev/null 2>&1; then
  echo "cosign is required: https://docs.sigstore.dev/cosign/installation/" >&2
  exit 1
fi

for artifact in *.tar.gz *.zip; do
  [ -e "$artifact" ] || continue
  cosign verify-blob \
    --bundle "${artifact}.sigstore.json" \
    --certificate-identity "${identity}" \
    --certificate-oidc-issuer "${issuer}" \
    "${artifact}"
done

cosign verify-blob \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity "${identity}" \
  --certificate-oidc-issuer "${issuer}" \
  SHA256SUMS

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c SHA256SUMS
else
  shasum -a 256 -c SHA256SUMS
fi
echo "release signatures and checksums verified"
