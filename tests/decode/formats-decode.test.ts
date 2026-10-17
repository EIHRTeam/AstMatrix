import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { generateScene } from '@astmatrix/barcode-core';
import { profiles } from '@astmatrix/profiles';
import { renderSvg } from '@astmatrix/renderers-svg';
import { decodeImage, rasterizeSvg } from './decoders';

const expected: Record<string, { format: string; text: string; zbar?: string }> = {
  'upca-default': { format: 'EAN13', text: '0012345000058', zbar: '0012345000058' },
  'upce-default': { format: 'UPCE', text: '0012345000058', zbar: '0012345000058' },
  'code39-default': { format: 'Code39', text: 'ABC-123', zbar: 'ABC-123' },
  'code39ext-default': { format: 'Code39Ext', text: 'Abc-123', zbar: 'A+B+C-123' },
  'code93-default': { format: 'Code93', text: 'ABC-123', zbar: 'ABC-123' },
  'interleaved2of5-default': { format: 'ITF', text: '123456', zbar: '123456' },
  isbn13: { format: 'EAN13', text: '9781565812314', zbar: '9781565812314' },
  'isbn13-addon5': { format: 'EAN13', text: '9781565812314', zbar: '9781565812314' },
  'ismn-default': { format: 'EAN13', text: '9790260532113', zbar: '9790260532113' },
  'issn-default': { format: 'EAN13', text: '9770311175001', zbar: '9770311175001' },
  'issn-addon2': { format: 'EAN13', text: '9770311175001', zbar: '9770311175001' },
  'azteccode-default': { format: 'Aztec', text: 'AstMatrix' },
  'pdf417-default': { format: 'PDF417', text: 'AstMatrix' },
  'micropdf417-default': { format: 'MicroPDF417', text: 'AstMatrix' },
  'microqrcode-default': { format: 'MicroQRCode', text: '12345' },
  'maxicode-default': { format: 'MaxiCode', text: 'ASTMATRIX-12345' },
  'mailmark-default': {
    format: 'DataMatrix',
    text: 'JGB 012100123412345678AB19XY1A 0             www.xyz.com',
  },
};
beforeAll(() =>
  vi.stubGlobal('fetch', () => {
    throw new Error('Format decode forbids network');
  }),
);
afterAll(() => vi.unstubAllGlobals());
for (const [profileId, sample] of Object.entries(expected))
  for (const dpi of [300, 600])
    it(`${profileId}: exact independent decode at ${dpi} DPI`, async () => {
      const p = profiles.find((candidate) => candidate.id === profileId)!;
      const raster = rasterizeSvg(
        renderSvg(generateScene({ symbologyId: p.symbologyId, profileId, fields: p.defaults })),
        dpi,
      );
      const result = await decodeImage(raster.image);
      expect(result.zxing.filter((s) => s.format === sample.format).map((s) => s.text)).toEqual([
        sample.text,
      ]);
      const checks = sample.zbar ? [[result.zbar.map((s) => s.text), [sample.zbar]]] : [];
      for (const [actual, required] of checks) expect(actual).toEqual(required);
    });

for (const id of ['azteccode', 'pdf417', 'micropdf417'])
  it(`${id}: UTF-8 Unicode, control-like carets and whitespace round-trip`, async () => {
    const p = profiles.find((candidate) => candidate.symbologyId === id)!;
    const text = ' 中文 / café / 😀 / ^FNC1 ';
    const result = await decodeImage(
      rasterizeSvg(
        renderSvg(
          generateScene({ symbologyId: id, profileId: p.id, fields: { ...p.defaults, text } }),
        ),
        600,
      ).image,
    );
    expect(result.zxing.map((s) => s.text)).toEqual([text]);
  });
