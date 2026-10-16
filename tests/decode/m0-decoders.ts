/** Independent decoder tooling only; never bundled into any host app. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import {
  readBarcodes,
  prepareZXingModule,
  ZXING_WASM_VERSION,
  ZXING_CPP_COMMIT,
} from 'zxing-wasm/reader';
import { scanImageData, setModuleArgs } from '@undecaf/zbar-wasm';

const require = createRequire(import.meta.url);
const zxingBinary = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
const zbarBinaryPath = require.resolve('@undecaf/zbar-wasm/dist/zbar.wasm');
// Supply exact bytes; never allow ZXing's default CDN loader to run.
prepareZXingModule({ overrides: { wasmBinary: Uint8Array.from(zxingBinary).buffer } });
setModuleArgs({ locateFile: () => zbarBinaryPath });
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const version = (name: string): string =>
  JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')).version;
export const decoderTooling = {
  zxing: {
    package: 'zxing-wasm',
    version: ZXING_WASM_VERSION,
    cppCommit: ZXING_CPP_COMMIT,
    wasmSha256: hash(zxingBinary),
  },
  zbar: {
    package: '@undecaf/zbar-wasm',
    version: version('@undecaf/zbar-wasm'),
    wasmSha256: hash(readFileSync(zbarBinaryPath)),
  },
  rasterizer: {
    package: '@resvg/resvg-js',
    version: version('@resvg/resvg-js'),
    background: '#ffffff',
    systemFonts: false,
  },
};
export function rasterizeSvg(svg: string, dpi: number) {
  if (!Number.isFinite(dpi) || dpi <= 0 || dpi > 1200) throw new Error('Invalid rasterization DPI');
  const rendered = new Resvg(svg, {
    dpi,
    background: '#ffffff',
    font: { loadSystemFonts: false },
  }).render();
  const image: ImageData = {
    data: new Uint8ClampedArray(rendered.pixels),
    width: rendered.width,
    height: rendered.height,
    colorSpace: 'srgb',
  };
  return {
    image,
    png: rendered.asPng(),
    pngSha256: hash(rendered.asPng()),
    svgSha256: hash(svg),
    dpi,
  };
}
export async function decodeImage(image: ImageData) {
  const [zx, zb] = await Promise.all([readBarcodes(image), scanImageData(image)]);
  return {
    zxing: zx.map((symbol) => ({ format: symbol.format, text: symbol.text })),
    zbar: zb.map((symbol) => ({ format: symbol.typeName, text: symbol.decode() })),
  };
}
export function requireDecodedText(
  result: Awaited<ReturnType<typeof decodeImage>>,
  expected: string,
  symbology?: 'ean13' | 'qrcode',
) {
  for (const [decoder, symbols] of Object.entries(result)) {
    if (symbols.length !== 1 || symbols[0]?.text !== expected)
      throw new Error(`${decoder}: expected one exact match, got ${JSON.stringify(symbols)}`);
    if (symbology) {
      const format = symbols[0]!.format
        .toUpperCase()
        .replace(/^ZBAR_/, '')
        .replace(/[-_]/g, '');
      if (format !== symbology.toUpperCase())
        throw new Error(`${decoder}: unexpected format ${symbols[0]!.format}`);
    }
  }
}
