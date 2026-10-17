import { expect, it } from 'vitest';
import { generateScene, ENGINE_VERSION } from '@astmatrix/barcode-core';
import { normalizeRequest, checkDigit, profiles } from '@astmatrix/profiles';
import { originalCatalog, symbologies, isCompatible } from '@astmatrix/symbology-catalog';
import { renderSvg } from '@astmatrix/renderers-svg';
import { validateScene } from '@astmatrix/vector-ir';
import { basicSamples } from '../fixtures/core-samples';
it('maps all 40 source rows, deduplicates carriers and keeps the Mobile Profile', () => {
  expect(originalCatalog).toHaveLength(40);
  expect(new Set(originalCatalog.map((e) => e.sourceId)).size).toBe(40);
  expect(new Set(symbologies.map((s) => s.id)).size).toBe(symbologies.length);
  expect(symbologies.filter((s) => s.id === 'gs1-128')).toHaveLength(1);
  expect(symbologies.some((s) => s.id === 'ean14')).toBe(true);
  expect(symbologies.some((s) => s.id === 'qr-mobile')).toBe(false);
  for (const e of originalCatalog)
    for (const id of e.symbologyIds) expect(symbologies.some((s) => s.id === id)).toBe(true);
  for (const entry of originalCatalog)
    for (const profileId of entry.profileIds)
      expect(entry.symbologyIds.some((id) => isCompatible(id, profileId))).toBe(true);
  expect(
    (['retail', 'industrial', 'publication', 'matrix'] as const).map(
      (category) => originalCatalog.filter((entry) => entry.category === category).length,
    ),
  ).toEqual([9, 12, 5, 14]);
  for (const p of profiles) expect(isCompatible(p.symbologyId, p.id)).toBe(true);
  for (const s of symbologies.filter((s) => s.status === 'listed'))
    expect(s.reason.length).toBeGreaterThan(10);
});
for (const input of basicSamples)
  it(`offline deterministic ${input.symbologyId}: actual IR/SVG`, () => {
    const a = generateScene(input),
      b = generateScene(input);
    expect(a).toEqual(b);
    expect(a.nodes.length).toBeGreaterThan(0);
    validateScene(a);
    expect(a.metadata.engineVersion).toBe(ENGINE_VERSION);
    expect(a.metadata.request?.fields.text).toBe(input.fields.text);
    expect(renderSvg(a)).toContain('mm"');
    expect(generateScene(a.metadata.request!)).toEqual(a);
  });
it('validates check digits and explicitly generates missing digits', () => {
  expect(checkDigit('690123456789')).toBe('2');
  expect(checkDigit('9638507')).toBe('4');
  expect(
    normalizeRequest({
      ...basicSamples[0]!,
      fields: { text: '690123456789', checkDigit: 'generate' },
    }).text,
  ).toBe('6901234567892');
  for (const text of ['6901234567893', '690123456789', 'abcdef', ''])
    expect(() => generateScene({ ...basicSamples[0]!, fields: { text } })).toThrow(Error);
  for (const text of ['96385075', '9638507'])
    expect(() => generateScene({ ...basicSamples[1]!, fields: { text } })).toThrow(Error);
  expect(() =>
    generateScene({
      ...basicSamples[0]!,
      fields: { text: '6901234567892', checkDigit: 'generate' },
    }),
  ).toThrow(Error);
});
it('rejects incompatible/unknown profiles, bad dimensions and unsupported characters', () => {
  expect(() => generateScene({ ...basicSamples[0]!, profileId: 'qr-default' })).toThrow(Error);
  expect(() =>
    generateScene({
      symbologyId: 'maxicode',
      profileId: 'unknown-profile',
      fields: { text: '123' },
    }),
  ).toThrow(Error);
  for (const moduleMm of [0, -1, NaN, Infinity, 11])
    expect(() =>
      generateScene({ ...basicSamples[0]!, fields: { text: '6901234567892', moduleMm } }),
    ).toThrow(Error);
  for (const text of ['', '中文', '\n', '\u0000'])
    expect(() => generateScene({ ...basicSamples[2]!, fields: { text } })).toThrow(Error);
  expect(() => generateScene({ ...basicSamples[3]!, fields: { text: '\uD800' } })).toThrow(Error);
  expect(() =>
    generateScene({ ...basicSamples[3]!, profileId: 'qr-mobile', fields: { text: 'no URL' } }),
  ).toThrow(Error);
});
it('propagates fixed QR/Data Matrix capacity errors rather than changing size silently', () => {
  expect(() =>
    generateScene({
      ...basicSamples[3]!,
      fields: { text: 'a'.repeat(1000), version: 1, ecc: 'H' },
    }),
  ).toThrow(Error);
  expect(() =>
    generateScene({ ...basicSamples[4]!, fields: { text: 'a'.repeat(100), size: 10 } }),
  ).toThrow(Error);
});
it('includes recovery of auto-generated check digit mode and all style/size options', () => {
  const scene = generateScene({
    ...basicSamples[0]!,
    fields: {
      text: '690123456789',
      checkDigit: 'generate',
      foreground: '123abc',
      background: 'FFFFFF',
      moduleMm: 0.4,
      heightMm: 30,
      hri: false,
      mergePaths: false,
    },
  });
  expect(generateScene(scene.metadata.request!)).toEqual(scene);
  expect(scene.symbolBounds.width).toBeCloseTo(95 * 0.4, 8);
  expect(scene.symbolBounds.height).toBeCloseTo(30, 1);
});

it('keeps literal ASCII carets/spaces and admits fixed square dimensions', () => {
  for (const text of [' ', '^FNC1', '~!@#$%&*()[]']) {
    const scene = generateScene({ ...basicSamples[2]!, fields: { text } });
    expect(scene.metadata.sourceValue).toBe(text);
  }
  const qr = generateScene({ ...basicSamples[3]!, fields: { text: 'A', version: 2, ecc: 'H' } });
  expect(qr.symbolBounds.width).toBeCloseTo(25 * 0.4, 8);
  expect(qr.symbolBounds.height).toBeCloseTo(25 * 0.4, 8);
  const dm = generateScene({ ...basicSamples[4]!, fields: { text: 'A', size: 14 } });
  expect(dm.symbolBounds.width).toBeCloseTo(14 * 0.4, 8);
});
