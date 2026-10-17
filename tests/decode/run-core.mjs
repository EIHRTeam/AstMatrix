import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { decoderTooling, rasterizeSvg, decodeImage } from './decoders.ts';
const destination = process.env.ASTMATRIX_REPORT_DIR ?? 'tmp/core-report';
await mkdir(destination, { recursive: true });
globalThis.fetch = () => {
  throw new Error('Core decode forbids network fetch');
};
const records = [];
for (let index = 0; index < 8; index++) {
  const scene = JSON.parse(await readFile('tmp/core-benchmark/samples/' + index + '.json', 'utf8'));
  const svg = await readFile('tmp/core-benchmark/samples/' + index + '.svg', 'utf8');
  for (const dpi of [300, 600]) {
    const raster = rasterizeSvg(svg, dpi),
      decoded = await decodeImage(raster.image);
    const format = {
      ean13: 'EAN13',
      ean8: 'EAN8',
      code128: 'Code128',
      qrcode: 'QRCode',
      datamatrix: 'DataMatrix',
    }[scene.metadata.symbologyId];
    const matchingFormat = decoded.zxing.filter((s) => s.format === format);
    const zxing =
      matchingFormat.length === 1 && matchingFormat[0].text === scene.metadata.sourceValue;
    const zbar = decoded.zbar.length === 1 && decoded.zbar[0].text === scene.metadata.sourceValue;
    if (!zxing || (scene.metadata.symbologyId !== 'datamatrix' && !zbar))
      throw new Error('Decode mismatch ' + index + '/' + dpi);
    records.push({
      index,
      symbologyId: scene.metadata.symbologyId,
      text: scene.metadata.sourceValue,
      dpi,
      svgSha256: raster.svgSha256,
      pngSha256: raster.pngSha256,
      dimensions: { width: raster.image.width, height: raster.image.height },
      decoded,
      expectedFormat: format,
      unexpectedDetections: decoded.zxing.filter((s) => s.format !== format),
      zxing: 'pass',
      zbar:
        scene.metadata.symbologyId === 'datamatrix'
          ? 'not-applicable: ZBar does not implement Data Matrix'
          : 'pass',
      secondIndependentDecoder:
        scene.metadata.symbologyId === 'datamatrix'
          ? 'pending; no independent Data Matrix decoder in the current tooling'
          : 'pass',
    });
  }
}
await writeFile(
  destination + '/decode.json',
  JSON.stringify(
    {
      suite: 'shared-core-decode',
      generatedAt: new Date().toISOString(),
      tooling: decoderTooling,
      network: 'fetch forbidden; local WASM only',
      scope:
        'Production shared SVG at 300/600 DPI; Data Matrix only ZXing; no host exports/industry claim',
      records,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Core decode: ' +
    records.length +
    ' required sample/DPI pairs; Data Matrix second decoder explicitly pending.',
);
