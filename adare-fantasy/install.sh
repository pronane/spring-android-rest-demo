#!/usr/bin/env sh
#
# Twenty-Eight — installer for macOS and Linux.
#
#   ./install.sh                full local setup (Node, dependencies, Postgres, build)
#   ./install.sh --check        say what is already there, change nothing
#   ./install.sh --no-postgres  use the JSON file store instead of Postgres
#
# Nothing here needs sudo. If the machine has no Node 20+, a private copy is
# downloaded into ~/.twenty-eight/node (about 30 MB) and never touches anything
# else; delete that folder to undo it.
set -eu

cd "$(dirname "$0")"

MIN_MAJOR=20
NODE_DIR="${TWENTY_EIGHT_NODE_DIR:-$HOME/.twenty-eight/node}"

say() { printf '%s\n' "$*"; }
die() { printf '\n%s\n\n' "$*" >&2; exit 1; }

latest_node_version() {
  # index.json is newest-first; the first "version":"vX.Y.Z" is the current LTS-ish release.
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://nodejs.org/dist/index.json | grep -o '"version":"v[0-9.]*"' | head -1 | sed 's/.*"v/v/;s/"//'
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- https://nodejs.org/dist/index.json | grep -o '"version":"v[0-9.]*"' | head -1 | sed 's/.*"v/v/;s/"//'
  else
    printf ''
  fi
}

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$2" "$1"
  else
    die "Neither curl nor wget is available, so Node cannot be downloaded.\nInstall Node 20+ from https://nodejs.org and run this again."
  fi
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    openssl dgst -sha256 "$1" | sed 's/.*= //'
  fi
}

bootstrap_node() {
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) die "This installer supports macOS and Linux. On Windows, run install.ps1." ;;
  esac

  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    armv7l) arch=armv7l ;;
    *) die "Unsupported architecture: $(uname -m)" ;;
  esac

  version="$(latest_node_version)"
  [ -n "$version" ] || die "Could not reach nodejs.org to download Node.\nInstall Node 20+ from https://nodejs.org and run this again."

  base="node-${version}-${os}-${arch}"
  url="https://nodejs.org/dist/${version}/${base}.tar.xz"
  say "Downloading Node ${version} for ${os}-${arch} (private copy, no admin rights)…"
  mkdir -p "$NODE_DIR"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  download "$url" "$tmp/$base.tar.xz"
  download "https://nodejs.org/dist/${version}/SHASUMS256.txt" "$tmp/SHASUMS256.txt"

  expected="$(grep "${base}.tar.xz" "$tmp/SHASUMS256.txt" | cut -d' ' -f1)"
  actual="$(sha256_of "$tmp/$base.tar.xz")"
  [ -n "$expected" ] || die "Could not read the checksum for ${base}.tar.xz — refusing to install it."
  [ "$expected" = "$actual" ] || die "The downloaded Node archive did not match its published checksum.\nTry again, or install Node from https://nodejs.org."

  tar -xJf "$tmp/$base.tar.xz" -C "$NODE_DIR" 2>/dev/null || tar -xf "$tmp/$base.tar.xz" -C "$NODE_DIR"
  printf '%s\n' "$NODE_DIR/$base/bin" > "$NODE_DIR/bin-path"
  say "Node ${version} installed into $NODE_DIR/$base"
}

# 1. An existing Node?
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$major" -ge "$MIN_MAJOR" ] 2>/dev/null; then
    exec node scripts/install.mjs "$@"
  fi
  say "Found Node $(node -v), which is older than ${MIN_MAJOR}. Looking for a newer one…"
fi

# 2. A copy this script installed before?
if [ -f "$NODE_DIR/bin-path" ]; then
  candidate="$(cat "$NODE_DIR/bin-path")/node"
  if [ -x "$candidate" ]; then
    PATH="$(cat "$NODE_DIR/bin-path"):$PATH"
    exec node scripts/install.mjs "$@"
  fi
fi

# 3. Download one.
bootstrap_node
PATH="$(cat "$NODE_DIR/bin-path"):$PATH"
export PATH
say ""
exec node scripts/install.mjs "$@"
