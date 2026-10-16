import { expect, it } from 'vitest';
import { generateScene, providerOptions } from '@astmatrix/barcode-core';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { getProfile, normalizeRequest } from '@astmatrix/profiles';
import {
  additionalCatalog,
  catalog,
  originalCatalog,
  getSymbology,
} from '@astmatrix/symbology-catalog';
import { renderSvg } from '@astmatrix/renderers-svg';
import { scaleScene } from '@astmatrix/vector-ir';
const request = (fields: Record<string, unknown> = {}) => ({
  symbologyId: 'code49',
  profileId: 'code49-default',
  fields: { ...getProfile('code49-default').defaults, ...fields },
});

it('adds Code 49 without changing the original 40 requirement rows', () => {
  expect(originalCatalog).toHaveLength(40);
  expect(catalog).toHaveLength(41);
  expect(additionalCatalog.map((e) => e.sourceId)).toContain('extension-code49');
  expect(getSymbology('code49')).toMatchObject({
    tab: 'matrix',
    layout: 'stacked',
    status: 'implemented',
    defaultProfileId: 'code49-default',
  });
});
for (const text of [
  'MULTIPLE ROWS IN CODE 49',
  'abcABC-123',
  '\x00\t\n\x1d\x7f',
  '^FNC1 ^ECI000026',
  '  padded  ',
])
  it(`preserves ASCII input ${JSON.stringify(text)} and recovers the full request`, async () => {
    const input = request({ text });
    const generated = await new AstMatrixApplicationService().generate(input);
    expect(generated.scene.metadata.sourceValue).toBe(text);
    expect(generateScene(generated.scene.metadata.request!)).toEqual(generated.scene);
    expect(generated.scene.metadata.options.parsefnc).toBe(false);
    expect(renderSvg(generated.scene)).toBe(generated.svg);
  });
for (const rows of [2, 3, 4, 5, 6, 7, 8])
  it(`uses ${rows} fixed rows with exact dimensions and quiet zones`, () => {
    const scene = generateScene(request({ text: 'A', rows }));
    expect(scene.symbolBounds.width).toBeCloseTo(81 * 0.4, 8);
    expect(scene.symbolBounds.height).toBeCloseTo((rows * 8 + rows + 1) * 0.4, 8);
    expect(scene.symbolBounds.x).toBeCloseTo(10 * 0.4, 8);
    expect(scene.symbolBounds.y).toBeCloseTo(2 * 0.4, 8);
    expect(scene.widthMm - scene.symbolBounds.x - scene.symbolBounds.width).toBeCloseTo(
      10 * 0.4,
      8,
    );
    expect(() => scaleScene(scene, 2, 1)).toThrow('uniform');
  });
it('maps row geometry options, preserves dimensions and style across regeneration', () => {
  const input = request({
    text: 'ABC',
    rows: 4,
    rowHeightModules: 12,
    separatorHeightModules: 3,
    moduleMm: 0.3,
    foreground: '123abc',
    background: 'FFFFFF',
    mergePaths: false,
  });
  expect(providerOptions(normalizeRequest(input))).toMatchObject({
    bcid: 'code49',
    rows: 4,
    rowheight: 12,
    sepheight: 3,
  });
  const scene = generateScene(input);
  expect(scene.symbolBounds.height).toBeCloseTo((4 * 12 + 5 * 3) * 0.3, 8);
  expect(generateScene(scene.metadata.request!)).toEqual(scene);
});
it('rejects invalid ASCII, dimensions, rows and unsupported fields before provider dispatch', () => {
  for (const fields of [
    { text: '' },
    { text: '中文' },
    { text: 'café' },
    { text: '😀' },
    { text: '\uD800' },
    { rows: 1 },
    { rows: 9 },
    { rows: 2.5 },
    { rows: NaN },
    { rowHeightModules: 7 },
    { rowHeightModules: 51 },
    { separatorHeightModules: 0 },
    { separatorHeightModules: 6 },
    { hri: true },
    { text: 'A'.repeat(501) },
  ])
    expect(() => normalizeRequest(request(fields))).toThrow(Error);
});
it('reports capacity overflow instead of silently changing fixed rows', () => {
  expect(() => generateScene(request({ text: 'A'.repeat(20), rows: 2 }))).toThrow(Error);
  expect(() => generateScene(request({ text: 'A'.repeat(100) }))).toThrow(Error);
});

for (const [text, overflow] of [
  ['1'.repeat(81), '1'.repeat(82)],
  ['A'.repeat(49), 'A'.repeat(50)],
  ['a'.repeat(25), 'a'.repeat(26)],
] as const)
  it(`enforces Code 49 capacity for ${JSON.stringify(text.slice(0, 4))}`, () => {
    expect(generateScene(request({ text })).nodes.length).toBeGreaterThan(0);
    expect(() => generateScene(request({ text: overflow }))).toThrow(
      expect.objectContaining({ code: 'CAPACITY_EXCEEDED' }),
    );
  });
