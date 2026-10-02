# Puppy Site Auditor MVP

Chrome Manifest V3 extension for reviewing a URL list and exporting `website_url,check` CSV.

## IMPORTANT - run setup before loading in Chrome

This source package intentionally does not redistribute the upstream model/runtime assets because the referenced repository does not currently expose a root LICENSE.

### Windows (recommended)
1. Extract the ZIP.
2. Double-click `setup-assets.bat` in the extracted `puppy-site-auditor` folder.
3. Wait until all four files show `OK`:
   - `assets/dog-model.onnx`
   - `assets/ort.min.js`
   - `assets/ort-wasm.wasm`
   - `assets/ort-wasm-simd.wasm`
4. Open `chrome://extensions` -> Developer mode -> Load unpacked.
5. Select the **puppy-site-auditor folder itself**, not the ZIP and not its parent folder.

### macOS/Linux
Run `./setup-assets.sh`, then Load unpacked as above.

## Workflow
Paste one URL per line -> Start. The extension opens each URL visibly, performs text evidence scanning, falls back to the ONNX dog classifier when needed, shows the current result in the side panel, and preserves completed results if you pause or stop. Export produces exactly two columns: `website_url,check`.

## Upstream reference
AI assets are fetched at setup time from `NDT0808/fb-reels-dog-bot`. Review upstream permission/licensing before redistributing those assets.
