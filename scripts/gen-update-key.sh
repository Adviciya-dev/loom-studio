#!/usr/bin/env bash
# Generates a Tauri updater signing keypair.
# Run once, then follow the instructions printed at the end.
set -euo pipefail

if ! command -v pnpm &>/dev/null; then
  echo "pnpm not found — install it first." && exit 1
fi

echo "Generating Tauri signing keypair…"
OUTPUT=$(pnpm tauri signer generate 2>&1)
echo "$OUTPUT"

PUBKEY=$(echo "$OUTPUT" | grep -A1 "public key" | tail -1 | tr -d '[:space:]')
PRIVKEY=$(echo "$OUTPUT" | grep -A1 "private key" | tail -1)

echo ""
echo "════════════════════════════════════════════════════════════"
echo " NEXT STEPS"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "1. Copy the PUBLIC KEY below into src-tauri/tauri.conf.json"
echo "   → plugins.updater.pubkey"
echo ""
echo "   $PUBKEY"
echo ""
echo "2. Add these two GitHub repository secrets"
echo "   (Settings → Secrets → Actions → New repository secret):"
echo ""
echo "   TAURI_SIGNING_PRIVATE_KEY      → (the private key printed above)"
echo "   TAURI_SIGNING_PRIVATE_KEY_PASSWORD → (leave blank if no password)"
echo ""
echo "3. Push a version tag to trigger a release:"
echo "   git tag v0.2.0 && git push origin v0.2.0"
echo ""
echo "   The CI will build, sign, and publish a GitHub release"
echo "   with a latest.json that the in-app updater fetches."
echo "════════════════════════════════════════════════════════════"
