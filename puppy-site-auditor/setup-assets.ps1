$ErrorActionPreference = "Stop"
$repo = "https://github.com/NDT0808/fb-reels-dog-bot.git"
$tmp = Join-Path $env:TEMP ("puppy-auditor-" + [guid]::NewGuid().ToString())
Write-Host "Cloning AI assets..."
git clone --depth 1 $repo $tmp
New-Item -ItemType Directory -Force -Path "assets" | Out-Null
$files = @("dog-model.onnx", "ort.min.js", "ort-wasm.wasm", "ort-wasm-simd.wasm")
foreach ($f in $files) {
  $src = Join-Path $tmp $f
  if (!(Test-Path $src)) { throw "Missing upstream asset: $f" }
  Copy-Item $src (Join-Path "assets" $f) -Force
  Write-Host "OK  $f"
}
Remove-Item $tmp -Recurse -Force
Write-Host ""
Write-Host "Setup complete. Now open chrome://extensions and Load unpacked this folder."
Write-Host "Note: upstream repository does not currently expose a root LICENSE; review permission before redistribution."
