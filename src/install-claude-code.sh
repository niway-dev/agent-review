#!/usr/bin/env bash
# Install a pinned Claude Code binary and verify its SHA-256 before it is made executable.
#
# Inputs (environment):
#   CLAUDE_CODE_VERSION  exact version, for example 2.1.304 (required)
#   CLAUDE_CODE_SHA256   optional expected SHA-256 of the binary for this runner's platform;
#                        when set it is used instead of the publisher's manifest
#   CLAUDE_INSTALL_DIR   directory for the binary (default: $HOME/.local/bin)
#
# The publisher's official installer (https://claude.ai/install.sh) downloads
#   https://downloads.claude.ai/claude-code-releases/<version>/<platform>/claude
# and checks it against the SHA-256 in
#   https://downloads.claude.ai/claude-code-releases/<version>/manifest.json
# (`.platforms["<platform>"].checksum`). This script does the same for a pinned version.
#
# Limit: the manifest and the binary come from the same origin. Checking one against the other
# proves the download is intact and is what the publisher released; it does not protect against
# a compromised publisher. To pin the hash independently, pass CLAUDE_CODE_SHA256 from a source
# you control (the `claude_code_sha256` workflow input).
set -euo pipefail

version="${CLAUDE_CODE_VERSION:-}"
expected="${CLAUDE_CODE_SHA256:-}"
install_dir="${CLAUDE_INSTALL_DIR:-$HOME/.local/bin}"
base="https://downloads.claude.ai/claude-code-releases"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]]; then
  echo "CLAUDE_CODE_VERSION must be an exact version such as 2.1.304 (got '$version')." >&2
  exit 1
fi
if [ -n "$expected" ] && [[ ! "$expected" =~ ^[a-f0-9]{64}$ ]]; then
  echo "CLAUDE_CODE_SHA256 must be 64 lowercase hex characters." >&2
  exit 1
fi

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "Unsupported operating system: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac
platform="$os-$arch"
if [ "$os" = linux ] && { [ -f /lib/libc.musl-x86_64.so.1 ] || [ -f /lib/libc.musl-aarch64.so.1 ]; }; then
  platform="$platform-musl"
fi

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ -n "$expected" ]; then
  echo "Using the pinned SHA-256 supplied by the caller."
else
  command -v jq >/dev/null 2>&1 || { echo "jq is required to read the manifest." >&2; exit 1; }
  curl -fsSL --retry 3 -o "$work/manifest.json" "$base/$version/manifest.json"
  expected="$(jq -r --arg p "$platform" '.platforms[$p].checksum // empty' "$work/manifest.json")"
  if [[ ! "$expected" =~ ^[a-f0-9]{64}$ ]]; then
    echo "No SHA-256 for platform $platform in the manifest of $version." >&2
    exit 1
  fi
fi

curl -fsSL --retry 3 -o "$work/claude" "$base/$version/$platform/claude"
actual="$(sha256_of "$work/claude")"
if [ "$actual" != "$expected" ]; then
  echo "SHA-256 mismatch for Claude Code $version ($platform)." >&2
  echo "  expected: $expected" >&2
  echo "  actual:   $actual" >&2
  exit 1
fi

mkdir -p "$install_dir"
install -m 0755 "$work/claude" "$install_dir/claude"
echo "Installed Claude Code $version ($platform), SHA-256 $actual, into $install_dir/claude"
