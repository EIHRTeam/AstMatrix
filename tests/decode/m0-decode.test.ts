import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { encodeSpike } from '../../packages/barcode-core/src/spike';
import { encodeHriSpike } from '../../packages/barcode-core/src/spike-hri';
import { renderSvg } from '@astmatrix/renderers-svg';
import { decodeImage, decoderTooling, rasterizeSvg, requireDecodedText } from './m0-decoders';
const samples = [
  { bcid: 'ean13', text: '6901234567892' },
  { bcid: 'qrcode', text: 'https://example.com/barcode' },
  { bcid: 'qrcode', text: 'A'.repeat(1000) },
] as const;
describe('M0 shared SVG through ZXing-C++ and ZBar (not host exports or full conformance)', () => {
  beforeAll(() =>
    vi.stubGlobal('fetch', () => {
      throw new Error('Network forbidden in decode tests');
    }),
  );
  afterAll(() => vi.unstubAllGlobals());
  for (const [index, sample] of samples.entries()) {
    for (const dpi of [300, 600]) {
      it(`${sample.bcid} sample ${index} at ${dpi} DPI`, async () => {
        const scene = encodeSpike(sample);
        const { image } = rasterizeSvg(renderSvg(scene), dpi);
        const result = await decodeImage(image);
        requireDecodedText(result, sample.text, sample.bcid);
        expect(result.zxing[0]!.text).toBe(sample.text);
        expect(result.zbar[0]!.text).toBe(sample.text);
        expect(image.width).toBeCloseTo((scene.widthMm / 25.4) * dpi, 0);
      });
    }
  }
  it('records low-resolution EAN separately from the required two-decoder gate', async () => {
    const { image } = rasterizeSvg(renderSvg(encodeSpike(samples[0]!)), 150);
    const result = await decodeImage(image);
    expect(result.zbar[0]!.text).toBe(samples[0]!.text);
    // Empty ZXing results are allowed only for this exploratory low-DPI sample.
    expect(result.zxing.every((symbol) => symbol.text === samples[0]!.text)).toBe(true);
  });
  for (const dpi of [300, 600]) {
    it(`EAN-13 with outlined HRI at ${dpi} DPI`, async () => {
      const scene = encodeHriSpike({ text: samples[0].text });
      const { image } = rasterizeSvg(renderSvg(scene), dpi);
      const result = await decodeImage(image);
      requireDecodedText(result, samples[0].text, 'ean13');
      expect(result.zxing[0]!.text).toBe(samples[0].text);
      expect(result.zbar[0]!.text).toBe(samples[0].text);
    });
  }
  it('rejects blank images and proves empty decode results cannot count as a pass', async () => {
    const { image } = rasterizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
      96,
    );
    const result = await decodeImage(image);
    expect(result.zxing).toHaveLength(0);
    expect(result.zbar).toHaveLength(0);
    expect(() => requireDecodedText(result, samples[0]!.text)).toThrow(/expected one exact match/);
    expect(decoderTooling.zxing.wasmSha256).not.toBe(decoderTooling.zbar.wasmSha256);
  });
});
