import { describe, expect, it, vi } from 'vitest';
import bwipjs, { toSVG, drawingSVG } from 'bwip-js/generic';
import { JSDOM } from 'jsdom';
import { Resvg } from '@resvg/resvg-js';
import {
  encodeHriSpike,
  hriSpikeOptions,
  measureHri,
  outlineHri,
} from '../../packages/barcode-core/src/spike-hri';
import { renderSvg } from '@astmatrix/renderers-svg';
import type { PathCommand } from '@astmatrix/vector-ir';

const request = { text: '6901234567892' };
const font = { name: 'OCR-B', width: 24, height: 24, dx: 0 };

describe('M0 shared HRI outlines; no system fonts or host acceptance implied', () => {
  it('matches the reference EAN bars and glyph rendering with explicit physical quiet zones', () => {
    const scene = encodeHriSpike(request);
    const reference = toSVG(hriSpikeOptions(request));
    const dom = new JSDOM(reference, { contentType: 'image/svg+xml' });
    const root = dom.window.document.documentElement;
    const expected = `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.widthMm}mm" height="${scene.heightMm}mm" viewBox="0 0 ${scene.widthMm} ${scene.heightMm}"><g transform="scale(0.165)">${root.innerHTML}</g></svg>`;
    const options = { dpi: 600, background: '#ffffff', font: { loadSystemFonts: false } };
    const actualImage = new Resvg(renderSvg(scene), options).render();
    const expectedImage = new Resvg(expected, options).render();
    expect(actualImage.width).toBe(expectedImage.width);
    expect(actualImage.height).toBe(expectedImage.height);
    const actualPixels = actualImage.pixels;
    const expectedPixels = expectedImage.pixels;
    let difference = 0;
    actualPixels.forEach((value, i) => {
      difference += Math.abs(value - expectedPixels[i]!);
    });
    // Reference SVG rounds glyph vertices to 0.01 callback units. Full-image comparison
    // allows that subpixel rounding, while detecting wrong baselines, advances or holes.
    expect(difference / (actualPixels.length * 255)).toBeLessThan(0.001);
    expect(scene.widthMm).toBeCloseTo(113 * 0.33, 8);
    expect(scene.heightMm).toBeCloseTo(149 * 0.165, 8);
    expect(scene.symbolBounds.x).toBeCloseTo(11 * 0.33, 8);
    expect(scene.symbolBounds.width).toBeCloseTo(95 * 0.33, 8);
    expect(scene.widthMm - scene.symbolBounds.x - scene.symbolBounds.width).toBeCloseTo(
      7 * 0.33,
      8,
    );
    expect(scene.nodes.filter((node) => node.role === 'bars')).toHaveLength(30);
    expect(scene.nodes.filter((node) => node.role === 'other')).toHaveLength(13);
    expect(renderSvg(scene)).not.toContain('<text');
    expect(encodeHriSpike(request)).toEqual(scene);
    dom.window.close();
  });
  it('uses the same metrics as the reference and closes every hole contour', () => {
    expect(measureHri('6901234567892', 'OCR-B', 24, 24)).toEqual(
      drawingSVG().measure('6901234567892', 'OCR-B', 24, 24),
    );
    const commands = outlineHri(0, 30, '8', font);
    expect(commands.filter((command) => command.op === 'M')).toHaveLength(3);
    expect(commands.filter((command) => command.op === 'Z')).toHaveLength(3);
    expect(commands.some((command) => command.op === 'C')).toBe(true);
    expect(commands.at(-1)?.op).toBe('Z');
  });
  it('converts quadratic curves exactly and preserves native cubic controls', () => {
    const paths = Object.assign(
      [
        { type: 'M', x: 1, y: 2 },
        { type: 'Q', x: 7, y: 5, cx: 2, cy: 9 },
        { type: 'M', x: 0, y: 0 },
        { type: 'C', x: 6, y: 4, cx1: 1, cy1: 2, cx2: 3, cy2: 8 },
      ] as const,
      { ascent: 9, descent: 0, advance: 12 },
    );
    const mock = vi.spyOn(bwipjs.FontLib, 'getpaths').mockReturnValue(paths as never);
    try {
      const commands = outlineHri(10, 30, '6', font);
      const cubic = commands[1] as Extract<PathCommand, { op: 'C' }>;
      expect(cubic.op).toBe('C');
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const s = 1 - t;
        expect(
          s ** 3 * 11 + 3 * s ** 2 * t * cubic.x1 + 3 * s * t ** 2 * cubic.x2 + t ** 3 * cubic.x,
        ).toBeCloseTo(s ** 2 * 11 + 2 * s * t * 12 + t ** 2 * 17, 10);
        expect(
          s ** 3 * 28 + 3 * s ** 2 * t * cubic.y1 + 3 * s * t ** 2 * cubic.y2 + t ** 3 * cubic.y,
        ).toBeCloseTo(s ** 2 * 28 + 2 * s * t * 21 + t ** 2 * 25, 10);
      }
      expect(commands).toContainEqual({ op: 'C', x1: 11, y1: 28, x2: 13, y2: 22, x: 16, y: 26 });
      expect(commands.filter((command) => command.op === 'Z')).toHaveLength(2);
    } finally {
      mock.mockRestore();
    }
  });
  it('rejects unavailable fonts and missing glyphs before silently substituting them', () => {
    for (const name of ['UnknownFont', 'Helvetica', 'OCR-A']) {
      expect(() => encodeHriSpike({ ...request, font: name })).toThrow('HRI font');
      expect(() => outlineHri(0, 30, '6', { ...font, name })).toThrow('HRI font');
    }
    for (const text of ['中', '😀', '\n']) {
      expect(() => outlineHri(0, 30, text, font)).toThrow('Missing HRI glyph');
      expect(() => measureHri(text, 'OCR-B', 24, 24)).toThrow('Missing HRI glyph');
    }
    expect(() => outlineHri(0, 30, '6', { ...font, rotate: 90 })).toThrow('Rotated HRI');
  });
  it('scales outlines and bars uniformly and rejects invalid physical input', () => {
    const scene = encodeHriSpike(request);
    const doubled = encodeHriSpike({ ...request, moduleMm: 0.66 });
    expect(doubled.widthMm).toBeCloseTo(scene.widthMm * 2, 8);
    expect(doubled.heightMm).toBeCloseTo(scene.heightMm * 2, 8);
    expect(doubled.nodes).toHaveLength(scene.nodes.length);
    for (const moduleMm of [0, -1, NaN, Infinity])
      expect(() => encodeHriSpike({ ...request, moduleMm })).toThrow('moduleMm');
    expect(() => encodeHriSpike({ text: '6901234567891' })).toThrow(/check digit/i);
  });
});
