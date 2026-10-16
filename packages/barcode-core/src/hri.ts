import bwipjs from 'bwip-js/generic';
const { FontLib } = bwipjs;
import type { PathCommand } from '@astmatrix/vector-ir';
// FontLib.lookup silently substitutes unknown names. Admit only our bundled font explicitly.
function fontId(name: string): number {
  if (name !== 'OCR-B') throw new Error(`Missing or unverified HRI font: ${name}`);
  return FontLib.lookup(name);
}
function glyphMetrics(name: string, ch: string, width: number, height: number) {
  const id = fontId(name);
  const code = ch.charCodeAt(0);
  const glyph = FontLib.getglyph(id, code, width, height);
  // FontLib.getglyph substitutes .notdef, while getpaths returns null for absent glyphs.
  const paths = FontLib.getpaths(id, code, width, height);
  if (!paths || !glyph || glyph.glyph === 0 || ch.length !== 1 || code < 32)
    throw new Error(`Missing HRI glyph: ${ch}`);
  return { glyph, paths };
}
export function measureHri(text: string, font: string, width: number, height: number) {
  fontId(font);
  width = Math.trunc(width);
  height = Math.trunc(height);
  let advance = 0,
    ascent = 0,
    descent = 0;
  [...text].forEach((ch, i, chars) => {
    const { glyph } = glyphMetrics(font, ch, width, height);
    ascent = Math.max(ascent, glyph.top);
    descent = Math.max(descent, glyph.height - glyph.top);
    advance += i === chars.length - 1 ? glyph.left + glyph.width : glyph.advance;
  });
  return { width: advance, ascent, descent };
}

/** Convert native font contours directly; SVG is a reference only, never an input. */
export function outlineHri(
  x: number,
  baseline: number,
  text: string,
  font: { name: string; width: number; height: number; dx: number; rotate?: number },
): PathCommand[] {
  fontId(font.name);
  if (font.rotate) throw new Error('Rotated HRI is not supported');
  x = Math.trunc(x);
  baseline = Math.trunc(baseline);
  const width = Math.trunc(font.width),
    height = Math.trunc(font.height),
    dx = Math.trunc(font.dx);
  const result: PathCommand[] = [];
  for (const ch of text) {
    const { glyph, paths } = glyphMetrics(font.name, ch, width, height);
    let current = { x: 0, y: 0 };
    let open = false;
    for (const segment of paths) {
      const end = { x: x + segment.x, y: baseline - segment.y };
      if (segment.type === 'M') {
        if (open) result.push({ op: 'Z' });
        result.push({ op: 'M', ...end });
        open = true;
      } else if (segment.type === 'L') result.push({ op: 'L', ...end });
      else if (segment.type === 'Q') {
        const control = { x: x + segment.cx, y: baseline - segment.cy };
        result.push({
          op: 'C',
          x1: current.x + (2 / 3) * (control.x - current.x),
          y1: current.y + (2 / 3) * (control.y - current.y),
          x2: end.x + (2 / 3) * (control.x - end.x),
          y2: end.y + (2 / 3) * (control.y - end.y),
          ...end,
        });
      } else {
        result.push({
          op: 'C',
          x1: x + segment.cx1,
          y1: baseline - segment.cy1,
          x2: x + segment.cx2,
          y2: baseline - segment.cy2,
          ...end,
        });
      }
      current = end;
    }
    if (open) result.push({ op: 'Z' });
    x += glyph.advance + dx;
  }
  return result;
}
