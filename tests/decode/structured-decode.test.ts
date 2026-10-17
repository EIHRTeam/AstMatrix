import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { readBarcodes } from 'zxing-wasm/reader';
import { generateScene } from '@astmatrix/barcode-core';
import { profiles } from '@astmatrix/profiles';
import { renderSvg } from '@astmatrix/renderers-svg';
import { rasterizeSvg } from './decoders';

beforeAll(() =>
  vi.stubGlobal('fetch', () => {
    throw new Error('Structured decode forbids network');
  }),
);
afterAll(() => vi.unstubAllGlobals());

for (const profileId of [
  'ean14-default',
  'gs1-128-default',
  'ntin',
  'ppn',
  'isbn13-addon5',
  'issn-addon2',
  'telepen-default',
])
  it(`${profileId}: structured full payload readback`, async () => {
    const p = profiles.find((candidate) => candidate.id === profileId)!;
    const scene = generateScene({ symbologyId: p.symbologyId, profileId, fields: p.defaults });
    const raster = rasterizeSvg(renderSvg(scene), 600);
    const decoded = await readBarcodes(raster.image, {
      textMode: 'Plain',
      eanAddOnSymbol: profileId.includes('addon') ? 'Require' : 'Ignore',
    });
    const expected: Record<string, string> = {
      'ean14-default': '0109528765432108',
      'gs1-128-default': '01095212345432133103000123',
      ntin: '01041500375286431729123110LOT123\x1d21ABC123',
      ppn: '[)>\x1e06\x1d9N110375286414\x1d1TLOT123\x1dD291231\x1dSABC123\x1e\x04',
      'isbn13-addon5': '978156581231490000',
      'issn-addon2': '977031117500117',
      'telepen-default': 'ABC-123',
    };
    const expectedAddon =
      profileId === 'isbn13-addon5' ? '90000' : profileId === 'issn-addon2' ? '17' : null;
    expect(expectedAddon === null ? null : JSON.parse(decoded[0]!.extra).EanAddOn).toBe(
      expectedAddon,
    );
    expect(decoded.map((s) => s.text)).toEqual([expected[profileId]]);
    expect(Array.from(decoded[0]!.bytes)).toEqual(
      Array.from(new TextEncoder().encode(expected[profileId])),
    );
    expect(decoded[0]!.hasECI).toBe(false);
  });

for (const mode of [2, 3, 4, 5])
  it(`MaxiCode mode ${mode}: independent full carrier/message readback`, async () => {
    const p = profiles.find((candidate) => candidate.symbologyId === 'maxicode')!;
    const postalCode = mode === 3 ? 'AB12CD' : '152382802';
    const scene = generateScene({
      symbologyId: 'maxicode',
      profileId: p.id,
      fields: { ...p.defaults, text: 'ASTMATRIX', mode, postalCode },
    });
    const raster = rasterizeSvg(renderSvg(scene), 600);
    const decoded = await readBarcodes(raster.image, { formats: ['MaxiCode'], textMode: 'Plain' });
    const expectedText = mode <= 3 ? `${postalCode}\x1d840\x1d001\x1dASTMATRIX` : 'ASTMATRIX';
    expect(decoded.map((s) => s.text)).toEqual([expectedText]);
    expect(generateScene(scene.metadata.request!)).toEqual(scene);
  });
