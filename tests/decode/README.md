# Decode — layer 3

M0 now uses two independently implemented decoders: **ZXing-C++** (`zxing-wasm@3.1.5`)
and **ZBar** (`@undecaf/zbar-wasm@0.11.0`). `@resvg/resvg-js@2.6.2` rasterizes the shared
SVG on white at its physical size, with system fonts disabled. Decoder WASM resources are local;
network fetches are forbidden during tests and the evidence run.

```sh
pnpm test:decode
pnpm spike:m0
pnpm spike:m0:decode
```

The nonempty Vitest decode project runs in `pnpm test` / `pnpm check` and CI.
The required M0 samples are EAN-13 `6901234567892`, QR URL, and a 1000-character QR,
at **300 and 600 DPI**. Both decoders must return exactly one symbol with the full original text.
A blank-image negative case cannot count as decode success.

150 DPI is an exploratory probe: the locked EAN sample was read by ZBar but not ZXing,
while both QR samples were read by both. EAN modules at 150 DPI are under two pixels wide.
This is retained as a low-resolution limitation, not a successful two-decoder case or a print guarantee.
The decoded PNGs, hashes, dependency/engine versions and results are in
`tests/compatibility/spikes/dist/decode/` (ignored generated artifacts).

These cases verify **shared SVG**, not host exports, physical scanner performance, GS1 compliance,
all symbologies or final installation packages. M7 must extend the corpus and include actual host exports.
ZBar's LGPL dependency is test tooling only and is not imported into host bundles.

M0已追加独立的EAN-13/OCR-B轮廓HRI样本；300/600DPI也必须由两套解码器完整回读，150DPI仅为探针。共享图像通过不替代宿主HRI验收。

## M1 生产入口

`pnpm test:decode` 增加五基础码及 QR/Data Matrix 的 Unicode/ECI/caret 回读。
`pnpm benchmark:m1 && pnpm decode:m1` 生成生产样本并进行 300/600 DPI 离线解码，默认报告位于 tmp/m1-evidence。
Data Matrix 只有 ZXing，ZBar 不支持该码制；第二独立解码器/设备由 M7-02 承接。
稠密 QR 自动识别偶尔会额外误报其他格式，报告保留全部结果并按预期码制核对完整文本。
