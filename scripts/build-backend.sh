#!/usr/bin/env bash
# Build the Go Echo backend binary for Tauri sidecar.
# Usage:
#   bash scripts/build-backend.sh                  # Cross-compile for all platforms
#   bash scripts/build-backend.sh --current-only   # Compile for the current platform only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GO_DIR="$SCRIPT_DIR/../src-go"
BINARIES_DIR="$SCRIPT_DIR/../src-tauri/binaries"

mkdir -p "$BINARIES_DIR"
cd "$GO_DIR"

CURRENT_ONLY="${1:-}"

build() {
  local goos=$1
  local goarch=$2
  local triple=$3
  local ext=""
  [[ "$goos" == "windows" ]] && ext=".exe"

  local output="$BINARIES_DIR/server-${triple}${ext}"
  echo "→ Building $goos/$goarch  →  $(basename "$output")"

  GOOS="$goos" GOARCH="$goarch" CGO_ENABLED=0 go build \
    -ldflags="-s -w" \
    -o "$output" \
    ./cmd/server

  echo "  ✓ $(basename "$output")"
}

detect_current_triple() {
  # Use rustc if available (most accurate for Tauri targets)
  if command -v rustc &>/dev/null; then
    rustc --print host-tuple 2>/dev/null || rustc -Vv 2>/dev/null | grep '^host:' | awk '{print $2}'
  else
    # Fallback: derive from uname
    local os arch
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)
    case "$os-$arch" in
      linux-x86_64)  echo "x86_64-unknown-linux-gnu" ;;
      darwin-x86_64) echo "x86_64-apple-darwin" ;;
      darwin-arm64)  echo "aarch64-apple-darwin" ;;
      *)             echo "x86_64-pc-windows-msvc" ;;
    esac
  fi
}

if [[ "$CURRENT_ONLY" == "--current-only" ]]; then
  TRIPLE="$(detect_current_triple)"
  case "$TRIPLE" in
    x86_64-pc-windows*  | *windows*amd64*) build windows amd64 "x86_64-pc-windows-msvc" ;;
    x86_64-unknown-linux*) build linux   amd64 "x86_64-unknown-linux-gnu" ;;
    x86_64-apple-darwin)   build darwin  amd64 "x86_64-apple-darwin" ;;
    aarch64-apple-darwin)  build darwin  arm64 "aarch64-apple-darwin" ;;
    *)
      echo "Unknown triple: $TRIPLE — defaulting to windows/amd64"
      build windows amd64 "x86_64-pc-windows-msvc"
      ;;
  esac
else
  echo "Cross-compiling for all supported platforms..."
  build linux   amd64 "x86_64-unknown-linux-gnu"
  build windows amd64 "x86_64-pc-windows-msvc"
  build darwin  amd64 "x86_64-apple-darwin"
  build darwin  arm64 "aarch64-apple-darwin"
fi

echo ""
echo "✅ Backend build complete. Binaries in: $BINARIES_DIR"
