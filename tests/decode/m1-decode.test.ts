import { expect, it } from 'vitest';
import { generateScene } from '@astmatrix/barcode-core';
import { renderSvg } from '@astmatrix/renderers-svg';
import { decodeImage, rasterizeSvg } from './m0-decoders';
import { basicSamples } from '../fixtures/m1';
const samples = [
  ...basicSamples,
  ...['qrcode', 'datamatrix'].map((symbologyId) => ({
    symbologyId,
    profileId: symbologyId === 'qrcode' ? 'qr-default' : 'dm-default',
    fields: { text: '中文 / café / 😀 / ^ECI000003' },
  })),
];
for (const input of samples)
  it(`production ${input.symbologyId}: exact independent decode ${String(input.fields.text).slice(0, 12)}`, async () => {
    const result = await decodeImage(rasterizeSvg(renderSvg(generateScene(input)), 300).image);
    expect(result.zxing.map((s) => s.text)).toEqual([input.fields.text]);
    // ZBar has no Data Matrix decoder. This is an explicit M7 second-decoder gap.
    expect(result.zbar.map((s) => s.text)).toEqual(
      input.symbologyId === 'datamatrix' ? [] : [input.fields.text],
    );
  });
