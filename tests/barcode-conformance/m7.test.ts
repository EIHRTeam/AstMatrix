import { afterAll, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateScene, providerOptions } from '@astmatrix/barcode-core';
import { profiles, normalizeRequest, ppnCheckDigits, expandUpce } from '@astmatrix/profiles';
import { originalCatalog, symbologies } from '@astmatrix/symbology-catalog';
import { validateScene } from '@astmatrix/vector-ir';
import { renderSvg } from '@astmatrix/renderers-svg';

for (const p of profiles)
  it(`${p.id}: generates offline, deterministic geometry and lossless recovery`, () => {
    const request = { symbologyId: p.symbologyId, profileId: p.id, fields: { ...p.defaults } };
    const a = generateScene(request);
    validateScene(a);
    expect(a.nodes.length).toBeGreaterThan(0);
    expect(a).toEqual(generateScene(request));
    expect(generateScene(a.metadata.request!)).toEqual(a);
    expect(renderSvg(a)).toContain('mm"');
    expect(a.metadata.request!.fields).toEqual(normalizeRequest(request).inputFields);
  });

it('covers every original catalog row with executable defaults', () => {
  expect(originalCatalog).toHaveLength(40);
  for (const row of originalCatalog)
    for (const profileId of row.profileIds) {
      const p = profiles.find((p) => p.id === profileId)!;
      expect(p).toBeDefined();
      expect(row.symbologyIds).toContain(p.symbologyId);
      expect(
        generateScene({ symbologyId: p.symbologyId, profileId, fields: p.defaults }).nodes.length,
      ).toBeGreaterThan(0);
    }
  expect(symbologies.every((s) => s.status === 'implemented')).toBe(true);
});
const make = (id: string, fields: Record<string, unknown>, profileId = `${id}-default`) => {
  const p = profiles.find((p) => p.id === profileId)!;
  return { symbologyId: id, profileId, fields: { ...p.defaults, ...fields } };
};
it('computes UPC-E checks against expanded UPC-A rather than compressed digits', () => {
  expect(expandUpce('0123455')).toBe('01234500005');
  const input = make('upce', { text: '0123455', checkDigit: 'generate' });
  expect(normalizeRequest(input).text).toBe('01234558');
  const scene = generateScene(input);
  expect(scene.metadata.request!.fields.text).toBe('0123455');
  expect(generateScene(scene.metadata.request!)).toEqual(scene);
  expect(() => generateScene(make('upce', { text: '01234559' }))).toThrow('校验');
});
it('keeps composite components separated and prevents separator injection', () => {
  const input = make('ean13composite', {});
  expect(providerOptions(normalizeRequest(input)).text).toBe('9520123456788|(21)A12345678');
  for (const secondary of ['', 'abc', '(21)ABC|DEF', '(01)123'])
    expect(() => generateScene(make('ean13composite', { secondary }))).toThrow(Error);
  expect(() => generateScene(make('ean13composite', { text: '9520123456789' }))).toThrow(Error);
});
it('checks healthcare checksums, date and builds control characters without ECI contamination', () => {
  expect(ppnCheckDigits('1112345678')).toBe('42');
  const input = make('datamatrix', {}, 'ppn');
  const opts = providerOptions(normalizeRequest(input));
  expect(opts.text).toBe('[)>\x1e06\x1d9N110375286414\x1d1TLOT123\x1dD291231\x1dSABC123\x1e\x04');
  expect(opts.parsefnc).toBe(false);
  for (const fields of [{ text: '110375286415' }, { expiry: '290229' }, { batch: 'A\x1d9N123' }])
    expect(() => generateScene(make('datamatrix', fields, 'ppn'))).toThrow(Error);
  expect(() => generateScene(make('gs1datamatrix', { text: '04150037528644' }, 'ntin'))).toThrow(
    Error,
  );
});
it('rejects incompatible characters, numeric boundaries, parity and publication checks', () => {
  for (const [id, fields] of [
    ['code39', { text: 'lowercase' }],
    ['telepen', { text: '中文' }],
    ['interleaved2of5', { text: '123' }],
    ['pharmacode', { text: '2' }],
    ['pharmacode2', { text: '64570081' }],
    ['code11', { text: '12A' }],
    ['msi', { text: '12A' }],
    ['microqrcode', { text: '中文' }],
  ] as const)
    expect(() => generateScene(make(id, fields))).toThrow(Error);
  expect(() => generateScene(make('isbn', { text: '978-1-56581-231-5' }, 'isbn13'))).toThrow(Error);
  expect(() => generateScene(make('issn', { text: '0311-1750' }))).toThrow(Error);
  expect(() => generateScene(make('isbn', { addon: '12' }, 'isbn13-addon5'))).toThrow(Error);
});

it('preserves supplement geometry, fixed Mailmark carriers and per-format quiet zones', () => {
  const isbn = generateScene(make('isbn', {}, 'isbn13-addon5'));
  const issn = generateScene(make('issn', {}, 'issn-addon2'));
  expect(isbn.symbolBounds.width).toBeCloseTo((95 + 9 + 47) * 0.33, 8);
  expect(issn.symbolBounds.width).toBeCloseTo((95 + 9 + 20) * 0.33, 8);
  for (const [mailmarkType, columns, rows] of [
    ['7', 24, 24],
    ['9', 32, 32],
    ['29', 48, 16],
  ] as const) {
    const scene = generateScene(
      make('mailmark', { mailmarkType, text: 'JGB 012100123412345678AB19XY1A 0             ' }),
    );
    expect(scene.symbolBounds.width).toBeCloseTo(columns * 0.5, 8);
    expect(scene.symbolBounds.height).toBeCloseTo(rows * 0.5, 8);
    expect(scene.symbolBounds.x).toBeCloseTo(4 * 0.5, 8);
    expect(scene.symbolBounds.y).toBeCloseTo(4 * 0.5, 8);
  }
});
it('handles explicit checksum strategies, full ASCII controls and numeric boundaries', () => {
  for (const [id, fieldName] of [
    ['code11', 'checksum'],
    ['msi', 'checksum'],
    ['interleaved2of5', 'checksum'],
  ] as const) {
    const p = profiles.find((p) => p.symbologyId === id)!;
    for (const choice of p.fields.find((f) => f.name === fieldName)!.options!) {
      const scene = generateScene(
        make(id, {
          text: id === 'interleaved2of5' && choice !== 'none' ? '12345' : '123456',
          [fieldName]: choice,
        }),
      );
      expect(generateScene(scene.metadata.request!)).toEqual(scene);
    }
  }
  for (const [id, values] of [
    ['pharmacode', ['3', '131070']],
    ['pharmacode2', ['4', '64570080']],
  ] as const)
    for (const text of values)
      expect(generateScene(make(id, { text })).nodes.length).toBeGreaterThan(0);
  for (const id of ['code39ext', 'telepen']) {
    expect(
      generateScene(make(id, { text: '\x00ABC\x7f', hri: false })).nodes.length,
    ).toBeGreaterThan(0);
    expect(() => generateScene(make(id, { text: '\x00ABC', hri: true }))).toThrow('控制字符');
  }
  for (const id of ['isbn', 'ismn']) {
    const p = profiles.find((p) => p.symbologyId === id)!;
    const request = make(id, { text: String(p.defaults.text).replace(/-/g, '') }, p.id);
    expect(generateScene(generateScene(request).metadata.request!)).toEqual(generateScene(request));
  }
});

afterAll(async () => {
  const destination = process.env.ASTMATRIX_M7_EVIDENCE_DIR;
  if (!destination) return;
  await mkdir(destination, { recursive: true });
  await writeFile(
    `${destination}/catalog.json`,
    JSON.stringify(
      {
        sourceRows: originalCatalog.length,
        carriers: symbologies.length,
        profileCount: profiles.length,
        catalog: originalCatalog,
        symbologies,
        requests: profiles.map((p) => ({
          symbologyId: p.symbologyId,
          profileId: p.id,
          fields: p.defaults,
        })),
      },
      null,
      2,
    ) + '\n',
  );
});

it('honors fixed Han Xin / Micro QR versions and rejects overflow instead of enlarging', () => {
  for (const version of [1, 4]) {
    const scene = generateScene(make('hanxin', { version, ecc: 'L2' }));
    expect(scene.symbolBounds.width).toBeCloseTo((21 + 2 * version) * 0.4, 8);
  }
  const micro = generateScene(make('microqrcode', { version: 2, ecc: 'M', text: 'ABC' }));
  expect(micro.symbolBounds.width).toBeCloseTo(13 * 0.4, 8);
  for (const id of ['hanxin', 'microqrcode'])
    expect(() => generateScene(make(id, { version: 1, text: 'A'.repeat(500) }))).toThrow(Error);
});
it('validates separated MaxiCode carrier fields before encoding', () => {
  for (const fields of [
    { mode: 2, postalCode: 'ABC' },
    { mode: 3, postalCode: '1234567' },
    { mode: 2, countryCode: '84' },
    { mode: 3, postalCode: 'ABC123', serviceClass: 'A01' },
  ])
    expect(() => generateScene(make('maxicode', fields))).toThrow(Error);
});

it('normalizes MaxiCode lattice pitch and pharmaceutical narrow-bar widths to moduleMm', () => {
  const maxi = generateScene(make('maxicode', { moduleMm: 0.88, mergePaths: false }));
  const modules = maxi.nodes.find((n) => n.geometry.kind === 'path')!.geometry;
  if (modules.kind !== 'path') throw new Error('Missing MaxiCode modules');
  const rows = new Map<number, number[]>();
  for (const c of modules.commands)
    if (c.op === 'M') rows.set(c.y, [...(rows.get(c.y) ?? []), c.x]);
  const steps = [...rows.values()]
    .flatMap((xs) => xs.slice(1).map((x, i) => Math.abs(x - xs[i]!)))
    .filter((x) => x > 1e-8);
  expect(Math.min(...steps)).toBeCloseTo(0.88, 8);
  for (const id of ['pharmacode', 'pharmacode2']) {
    const scene = generateScene(make(id, { moduleMm: 0.5, mergePaths: false }));
    const widths = scene.nodes
      .filter((n) => n.role === 'bars')
      .map((n) => (n.geometry.kind === 'rect' ? n.geometry.w : Infinity));
    expect(Math.min(...widths)).toBeCloseTo(0.5, 8);
  }
});

it('preserves Pharmacode 1:3 bars, 2X spaces and its independent binary value interpretation', () => {
  for (const text of ['3', '117480', '131070']) {
    const scene = generateScene(make('pharmacode', { text, moduleMm: 0.5, mergePaths: false }));
    const bars = scene.nodes
      .flatMap((n) => (n.role === 'bars' && n.geometry.kind === 'rect' ? [n.geometry] : []))
      .sort((a, b) => a.x - b.x);
    expect(bars.reduce((value, bar) => value * 2 + (Math.abs(bar.w - 0.5) < 1e-8 ? 1 : 2), 0)).toBe(
      Number(text),
    );
    for (let i = 1; i < bars.length; i++)
      expect(bars[i]!.x - bars[i - 1]!.x - bars[i - 1]!.w).toBeCloseTo(1, 8);
  }
});
it('honors the HRI switch for all admitted linear/publication/composite profiles', () => {
  for (const p of profiles.filter((p) => p.fields.some((f) => f.name === 'hri'))) {
    const request = {
      symbologyId: p.symbologyId,
      profileId: p.id,
      fields: { ...p.defaults, hri: true },
    };
    expect(generateScene(request).nodes.some((n) => n.role === 'text')).toBe(true);
    expect(
      generateScene({ ...request, fields: { ...p.defaults, hri: false } }).nodes.some(
        (n) => n.role === 'text',
      ),
    ).toBe(false);
  }
});
