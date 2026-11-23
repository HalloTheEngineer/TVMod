#!/bin/sh
set -eu

if [ $# -ne 1 ]; then
  echo "usage: $0 <version>   (for example: $0 0.6.1)" >&2
  exit 1
fi

version="$1"
repo="HalloTheEngineer/TVMod"
tarball="tvmod-${version}-linux-x64.tar.gz"
identity="https://github.com/${repo}/.github/workflows/release.yml@refs/tags/v${version}"
issuer="https://token.actions.githubusercontent.com"

if ! command -v cosign >/dev/null 2>&1; then
  echo "cosign is required: https://docs.sigstore.dev/cosign/installation/" >&2
  exit 1
fi

cosign verify-blob \
  --bundle "${tarball}.sigstore.json" \
  --certificate-identity "${identity}" \
  --certificate-oidc-issuer "${issuer}" \
  "${tarball}"

cosign verify-blob \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity "${identity}" \
  --certificate-oidc-issuer "${issuer}" \
  SHA256SUMS

sha256sum -c SHA256SUMS
echo "release signatures and checksum verified"
