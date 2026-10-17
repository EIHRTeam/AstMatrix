# decode

Two independent decoders are used where available: **ZXing-C++** (`zxing-wasm`) and **ZBar**
(`@undecaf/zbar-wasm`). `@resvg/resvg-js` rasterizes the shared SVG on white at its physical
size with system fonts disabled. Decoder WASM resources are local; network fetches are
forbidden during tests and report runs.

```sh
pnpm test:decode
pnpm benchmark:core
pnpm decode:core
```

The nonempty decode project runs in `pnpm test` / `pnpm check` and CI. Core samples are
EAN-13 `6901234567892`, QR URL, and a 1000-character QR, at 300 and 600 DPI. Both decoders must
return exactly one symbol with the full original text. A blank-image negative case cannot count
as decode success. The extended suite covers additional formats and structured payloads.

150 DPI is an exploratory probe: the locked EAN sample was read by ZBar but not ZXing, while
both QR samples were read by both. EAN modules at 150 DPI are under two pixels wide. This is a
low-resolution limitation, not a successful two-decoder case or a print guarantee.

These cases verify **shared SVG**, not host exports, physical scanner performance, GS1
compliance, all symbologies, or final installation packages. Data Matrix currently has only
ZXing in this tooling; a second independent decoder or device remains pending. ZBar's LGPL
dependency is test tooling only and is not imported into host bundles.
