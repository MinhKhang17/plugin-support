#!/usr/bin/env bash
set -euo pipefail
REPO="https://github.com/NDT0808/fb-reels-dog-bot.git"
TMP="$(mktemp -d)"
git clone --depth 1 "$REPO" "$TMP/source"
mkdir -p assets
for f in dog-model.onnx ort.min.js ort-wasm.wasm ort-wasm-simd.wasm; do
  cp "$TMP/source/$f" "assets/$f"
done
rm -rf "$TMP"
echo "Assets copied into ./assets. Review upstream licensing/permission before redistribution."
