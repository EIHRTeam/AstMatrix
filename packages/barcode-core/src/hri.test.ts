import { describe, expect, it, vi } from 'vitest';
import bwipjs, { drawingSVG } from 'bwip-js/generic';
import type { PathCommand } from '@astmatrix/vector-ir';
import { measureHri, outlineHri } from './hri';

const font = { name: 'OCR-B', width: 24, height: 24, dx: 0 };

describe('OCR-B HRI outline conversion', () => {
  it('uses the same metrics as the reference drawing implementation', () => {
    expect(measureHri('6901234567892', 'OCR-B', 24, 24)).toEqual(
      drawingSVG().measure('6901234567892', 'OCR-B', 24, 24),
    );
  });

  it('closes every glyph contour and keeps cubic segments', () => {
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

  it('rejects unavailable fonts, missing glyphs and rotated text', () => {
    for (const name of ['UnknownFont', 'Helvetica', 'OCR-A']) {
      expect(() => outlineHri(0, 30, '6', { ...font, name })).toThrow('HRI font');
      expect(() => measureHri('6', name, 24, 24)).toThrow('HRI font');
    }
    for (const text of ['中', '😀', '\n']) {
      expect(() => outlineHri(0, 30, text, font)).toThrow('Missing HRI glyph');
      expect(() => measureHri(text, 'OCR-B', 24, 24)).toThrow('Missing HRI glyph');
    }
    expect(() => outlineHri(0, 30, '6', { ...font, rotate: 90 })).toThrow('Rotated HRI');
  });
});
