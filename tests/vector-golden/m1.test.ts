import { expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { JSDOM } from 'jsdom';
import { generateScene } from '@astmatrix/barcode-core';
import { renderSvg } from '@astmatrix/renderers-svg';
import { geometryBounds, scaleScene, validateScene } from '@astmatrix/vector-ir';
import type { VectorScene } from '@astmatrix/vector-ir';
import { basicSamples } from '../fixtures/m1';
for (const input of basicSamples)
  it(`${input.symbologyId}: explicit millimetres, bounds, HRI and deterministic golden`, async () => {
    const scene = generateScene(input),
      svg = renderSvg(scene);
    await expect(svg).toMatchFileSnapshot(`./fixtures/${input.symbologyId}.svg`);
    const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
    expect(dom.window.document.documentElement.getAttribute('width')).toBe(
      `${Number(scene.widthMm.toFixed(8))}mm`,
    );
    expect(scene.quietZoneBounds.width).toBe(scene.widthMm);
    expect(scene.symbolBounds.x / 0.33).toBeCloseTo(
      input.symbologyId === 'ean13'
        ? 11
        : input.symbologyId === 'ean8'
          ? 7
          : input.symbologyId === 'code128'
            ? 10
            : scene.symbolBounds.x / 0.33,
      7,
    );
    const linear = ['ean13', 'ean8', 'code128'].includes(input.symbologyId);
    expect(scene.nodes.some((n) => n.role === 'text')).toBe(linear);
    const quiet = input.symbologyId === 'qrcode' ? 4 : 1;
    expect(linear ? 0 : scene.symbolBounds.x).toBeCloseTo(linear ? 0 : quiet * 0.4, 8);
    expect(linear ? 0 : scene.widthMm - scene.symbolBounds.width).toBeCloseTo(
      linear ? 0 : quiet * 2 * 0.4,
      8,
    );
    dom.window.close();
  });
for (const input of basicSamples.slice(0, 3))
  for (const dpi of [72, 300, 600])
    it(`${input.symbologyId} merged/raw filled pixels match at ${dpi} DPI`, () => {
      const svg = (mergePaths: boolean) =>
        renderSvg(generateScene({ ...input, fields: { ...input.fields, mergePaths } }));
      const raster = (value: string) =>
        new Resvg(value, { dpi, font: { loadSystemFonts: false } }).render();
      const a = raster(svg(true)),
        b = raster(svg(false));
      expect(a.width).toBe(b.width);
      expect(a.height).toBe(b.height);
      expect(a.pixels).toEqual(b.pixels);
    });
it('rejects nonuniform matrix scaling, nonfinite/negative dimensions, bounds and malformed paths', () => {
  const scene = generateScene(basicSamples[3]!);
  expect(() => scaleScene(scene, 2, 1)).toThrow('uniform');
  expect(scaleScene(scene, 2).widthMm).toBeCloseTo(scene.widthMm * 2, 8);
  for (const widthMm of [0, -1, NaN, Infinity])
    expect(() => validateScene({ ...scene, widthMm })).toThrow(Error);
  expect(() => geometryBounds({ kind: 'rect', x: 0, y: 0, w: -1, h: 2 })).toThrow(Error);
  expect(() =>
    geometryBounds({ kind: 'path', fillRule: 'nonzero', commands: [{ op: 'L', x: 0, y: 0 }] }),
  ).toThrow(Error);
  expect(() =>
    geometryBounds({
      kind: 'path',
      fillRule: 'evenodd',
      commands: [
        { op: 'M', x: 0, y: 0 },
        { op: 'C', x1: 0, y1: NaN, x2: 1, y2: 2, x: 1, y: 1 },
        { op: 'Z' },
      ],
    }),
  ).toThrow(Error);
});
it('represents curves, ellipse, hexagon, compound holes and escaped editable text with explicit font policy', () => {
  expect(
    geometryBounds({
      kind: 'path',
      fillRule: 'nonzero',
      commands: [
        { op: 'M', x: 0, y: 0 },
        { op: 'C', x1: 0, y1: 10, x2: 10, y2: 10, x: 10, y: 0 },
        { op: 'Z' },
      ],
    }),
  ).toEqual({ x: 0, y: 0, width: 10, height: 7.5 });
  const source = generateScene(basicSamples[3]!);
  const scene: VectorScene = {
    ...source,
    widthMm: 20,
    heightMm: 20,
    contentBounds: { x: 0, y: 0, width: 20, height: 20 },
    symbolBounds: { x: 0, y: 0, width: 20, height: 20 },
    quietZoneBounds: { x: 0, y: 0, width: 20, height: 20 },
    nodes: [
      { id: 'ellipse', role: 'other', geometry: { kind: 'ellipse', cx: 5, cy: 5, rx: 2, ry: 1 } },
      {
        id: 'hexagon',
        role: 'other',
        fill: { space: 'CMYK', c: 0, m: 0, y: 0, k: 100 },
        geometry: {
          kind: 'polygon',
          fillRule: 'nonzero',
          points: [
            { x: 3, y: 0 },
            { x: 6, y: 2 },
            { x: 6, y: 4 },
            { x: 3, y: 6 },
            { x: 0, y: 4 },
            { x: 0, y: 2 },
          ],
        },
      },
      {
        id: 'text',
        role: 'text',
        geometry: {
          kind: 'text',
          text: '<&"\' >',
          x: 0,
          y: 15,
          fontFamily: 'Example"Font',
          fontSizeMm: 2,
          bounds: { x: 0, y: 12, width: 10, height: 3 },
        },
      },
    ],
  };
  expect(() => renderSvg(scene)).toThrow('Missing SVG font');
  const svg = renderSvg(scene, { availableFonts: ['Example"Font'] });
  expect(svg).toContain('&lt;&amp;&quot;&apos; &gt;');
  expect(svg).toContain('Example&quot;Font');
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  expect(dom.window.document.querySelector('text')?.textContent).toBe('<&"\' >');
  expect(dom.window.document.querySelector('ellipse')).not.toBeNull();
  dom.window.close();
});

it('transparent quiet-zone helpers retain the full envelope without painting the reserved area', () => {
  const scene = generateScene(basicSamples[3]!);
  const withHelper: VectorScene = {
    ...scene,
    nodes: [
      ...scene.nodes,
      {
        id: 'quiet-helper',
        role: 'quiet-zone',
        geometry: { kind: 'rect', x: 0, y: 0, w: scene.widthMm, h: scene.heightMm },
      },
    ],
  };
  validateScene(withHelper);
  expect(renderSvg(withHelper)).toBe(renderSvg(scene));
});
