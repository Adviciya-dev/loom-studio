#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR="$(cd "$(dirname "$0")/../src-tauri/binaries/loom-engine" && pwd)"
OUT_DIR="$(cd "$(dirname "$0")/../src-tauri/binaries" && pwd)"

echo "Building loom-engine for all platforms..."

cd "$ENGINE_DIR"

GOOS=darwin  GOARCH=arm64  CGO_ENABLED=0 go build -o "$OUT_DIR/loom-engine-aarch64-apple-darwin"       .
GOOS=darwin  GOARCH=amd64  CGO_ENABLED=0 go build -o "$OUT_DIR/loom-engine-x86_64-apple-darwin"         .
GOOS=linux   GOARCH=amd64  CGO_ENABLED=0 go build -o "$OUT_DIR/loom-engine-x86_64-unknown-linux-gnu"    .
GOOS=windows GOARCH=amd64  CGO_ENABLED=0 go build -o "$OUT_DIR/loom-engine-x86_64-pc-windows-msvc.exe"  .

echo "Done. Binaries written to src-tauri/binaries/"
