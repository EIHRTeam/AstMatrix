import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { encodeSpike, referenceSvg } from '../../packages/barcode-core/src/spike';
import type { SpikeRequest } from '../../packages/barcode-core/src/spike';
import { callbackSamples } from '../../packages/barcode-core/src/spike-callbacks';
import { renderSvg } from '@astmatrix/renderers-svg';
const samples: SpikeRequest[] = [
  { bcid: 'ean13', text: '6901234567892' },
  { bcid: 'qrcode', text: 'https://example.com/barcode' },
];
const sort = (a: number[], b: number[]) => a[0]! - b[0]!;
describe('M0 custom callbacks → mm IR → SVG', () => {
  for (const sample of samples)
    it(`${sample.bcid}: dimensions, deterministic IR, transparent quiet zone`, () => {
      const scene = encodeSpike(sample);
      const dom = new JSDOM(referenceSvg(sample), { contentType: 'image/svg+xml' });
      const box = dom.window.document.documentElement
        .getAttribute('viewBox')!
        .split(' ')
        .map(Number);
      const unit = sample.bcid === 'ean13' ? 0.33 / 2 : 0.4 / 4;
      expect(scene.symbolBounds.width / unit).toBeCloseTo(box[2]!, 8);
      expect(scene.symbolBounds.height / unit).toBeCloseTo(box[3]!, 8);
      dom.window.close();
      const output = new JSDOM(renderSvg(scene), { contentType: 'image/svg+xml' });
      const svg = output.window.document.documentElement;
      expect(svg.getAttribute('width')).toBe(`${Number(scene.widthMm.toFixed(8))}mm`);
      expect(svg.getAttribute('height')).toBe(`${Number(scene.heightMm.toFixed(8))}mm`);
      expect(svg.querySelectorAll('rect,path')).toHaveLength(scene.nodes.length);
      expect(scene.quietZoneBounds).toEqual({
        x: 0,
        y: 0,
        width: scene.widthMm,
        height: scene.heightMm,
      });
      expect(scene.contentBounds.x).toBeGreaterThanOrEqual(scene.symbolBounds.x);
      expect(scene.metadata.engineVersion).toContain('bwip-js:4.11.4');
      expect(encodeSpike(sample)).toEqual(scene);
      output.window.close();
    });
  it('EAN-13: compares all 30 bar rectangles to reference SVG strokes', () => {
    const scene = encodeSpike(samples[0]!);
    const dom = new JSDOM(referenceSvg(samples[0]!), { contentType: 'image/svg+xml' });
    const expected: number[][] = [];
    for (const p of dom.window.document.querySelectorAll('path')) {
      const w = Number(p.getAttribute('stroke-width'));
      for (const m of p.getAttribute('d')!.matchAll(/M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)/g)) {
        const [, xs, ys, xe, ye] = m;
        expect(Number(xs)).toBe(Number(xe));
        expected.push([
          Number(xs) - w / 2,
          Math.min(Number(ys), Number(ye)),
          w,
          Math.abs(Number(ye) - Number(ys)),
        ]);
      }
    }
    const actual = scene.nodes.map(({ geometry: g }) => {
      if (g.kind !== 'rect') throw new Error('Expected bar rectangle');
      return [(g.x - scene.symbolBounds.x) / 0.165, g.y / 0.165, g.w / 0.165, g.h / 0.165];
    });
    actual.sort(sort);
    expected.sort(sort);
    expect(actual).toHaveLength(30);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((r, i) => r.forEach((v, j) => expect(v).toBeCloseTo(expected[i]![j]!, 8)));
    expect(scene.symbolBounds.width / 0.165).toBeCloseTo(190, 8);
    expect(scene.widthMm).toBeCloseTo(113 * 0.33, 8);
    dom.window.close();
  });
  it('QR: matches every compound subpath and preserves evenodd holes', () => {
    const scene = encodeSpike(samples[1]!);
    const dom = new JSDOM(referenceSvg(samples[1]!), { contentType: 'image/svg+xml' });
    const expected = [...dom.window.document.querySelectorAll('path')].map((p) =>
      p.getAttribute('d')!,
    );
    const actual = scene.nodes.map(({ geometry: g }) => {
      if (g.kind !== 'path') throw new Error('Expected path');
      expect(g.fillRule).toBe('evenodd');
      return g.commands
        .map((c) =>
          c.op === 'Z'
            ? 'Z'
            : c.op === 'C'
              ? 'C'
              : `${c.op}${Number(((c.x - scene.symbolBounds.x) / 0.1).toFixed(2))} ${Number(((c.y - scene.symbolBounds.y) / 0.1).toFixed(2))}`,
        )
        .join('');
    });
    expect(actual).toEqual(expected);
    expect(scene.symbolBounds.width).toBeCloseTo(29 * 0.4, 8);
    expect(scene.widthMm).toBeCloseTo(37 * 0.4, 8);
    expect(scene.metadata.options.callbackUnitsPerModule).toBe(4);
    expect(scene.widthMm - scene.symbolBounds.width).toBeCloseTo(8 * 0.4, 8);
    expect(scene.heightMm - scene.symbolBounds.height).toBeCloseTo(8 * 0.4, 8);
    dom.window.close();
  });
  it('uniform physical scaling leaves topology unchanged', () => {
    const a = encodeSpike(samples[1]!);
    const b = encodeSpike({ ...samples[1]!, moduleMm: 0.8 });
    expect(b.widthMm).toBeCloseTo(a.widthMm * 2, 8);
    expect(b.nodes.length).toBe(a.nodes.length);
    expect(b.nodes[0]!.geometry.kind).toBe('path');
  });
  it('rejects bad check digits and nonphysical module sizes', () => {
    expect(() => encodeSpike({ bcid: 'ean13', text: '6901234567891' })).toThrow(/check digit/i);
    for (const moduleMm of [0, -1, NaN, Infinity])
      expect(() => encodeSpike({ ...samples[1]!, moduleMm })).toThrow('moduleMm');
  });
  it('SVG rejects nonfinite dimensions and unsafe colors', () => {
    const scene = encodeSpike(samples[1]!);
    expect(() => renderSvg({ ...scene, widthMm: NaN })).toThrow('Non-finite');
    expect(() => renderSvg({ ...scene, foreground: { space: 'RGB', hex: '" onload="x' } })).toThrow(
      'RGB',
    );
  });
});

it('M0 dispatch probe reaches HRI metrics/text, polygons, ellipses and hexagons', () => {
  const [ean, qr, dot, maxi] = callbackSamples();
  expect(ean!.calls.text).toBeGreaterThan(0);
  expect(ean!.calls.measure).toBeGreaterThan(0);
  expect(qr!.calls.polygon).toBeGreaterThan(0);
  expect(dot!.calls.ellipse).toBeGreaterThan(0);
  expect(maxi!.calls.hexagon).toBeGreaterThan(0);
  expect(maxi!.calls.ellipse).toBeGreaterThan(0);
});
