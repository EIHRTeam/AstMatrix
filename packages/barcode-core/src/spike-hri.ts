/** M0 EAN HRI experiment only; not exported by the production package or host entry. */
import bwipjs, { ean13 } from 'bwip-js/generic';
import type { DrawingContext, RenderOptions } from 'bwip-js/generic';
import { SPIKE_LAYOUT_VERSION as LAYOUT_VERSION } from '@astmatrix/vector-ir';
import type { PathCommand, VectorScene } from '@astmatrix/vector-ir';
import { ENGINE_VERSION, spikeOptions } from './spike';

export interface HriSpikeRequest {
  text: string;
  moduleMm?: number;
  font?: string;
}
// FontLib.lookup silently substitutes unknown names. Admit only our bundled font explicitly.
function fontId(name: string): number {
  if (name !== 'OCR-B') throw new Error(`Missing or unverified HRI font: ${name}`);
  return bwipjs.FontLib.lookup(name);
}
export function hriSpikeOptions(request: HriSpikeRequest): RenderOptions {
  const font = request.font ?? 'OCR-B';
  fontId(font);
  return {
    ...spikeOptions({ bcid: 'ean13', text: request.text }),
    includetext: true,
    textfont: font,
  };
}
function glyphMetrics(name: string, ch: string, width: number, height: number) {
  const id = fontId(name);
  const code = ch.charCodeAt(0);
  const glyph = bwipjs.FontLib.getglyph(id, code, width, height);
  // FontLib.getglyph substitutes .notdef, while getpaths returns null for absent glyphs.
  const paths = bwipjs.FontLib.getpaths(id, code, width, height);
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
  if (font.rotate) throw new Error('Rotated HRI not admitted by the M0 EAN sample');
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

function unsupported(): never {
  throw new Error('M0 HRI probe accepts EAN-13 bars and unrotated outlined text only');
}

export function encodeHriSpike(request: HriSpikeRequest): VectorScene {
  const moduleMm = request.moduleMm ?? 0.33;
  if (!Number.isFinite(moduleMm) || moduleMm <= 0 || moduleMm > 10)
    throw new Error('Invalid moduleMm');
  const options = hriSpikeOptions(request);
  const nodes: VectorScene['nodes'] = [];
  let mm = moduleMm / 2,
    widthMm = 0,
    heightMm = 0;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let barMinX = Infinity,
    barMaxX = -Infinity,
    barMaxY = -Infinity;
  const point = (x: number, y: number) => {
    x *= mm;
    y *= mm;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    return { x, y };
  };
  const drawing: DrawingContext<VectorScene> = {
    scale(sx, sy) {
      if (sx !== 2 || sy !== 2) throw new Error('Unexpected EAN callback scale');
      mm = moduleMm / sx;
      return null;
    },
    measure: measureHri,
    init(w, h) {
      // Locked BWIPP EAN HRI already includes 11X to the left of the first bar.
      // Add only the missing 7X on the right; do not double-pad the leading digit.
      widthMm = w * mm + 7 * moduleMm;
      heightMm = h * mm;
    },
    line(x0, y0, x1, y1, lw) {
      x0 = Math.trunc(x0);
      x1 = Math.trunc(x1);
      y0 = Math.trunc(y0);
      y1 = Math.trunc(y1);
      lw = Math.round(lw) || 1;
      if (x0 !== x1) throw new Error('Nonvertical EAN bar');
      const shift = lw % 2 ? 0.5 : 0;
      const a = point(x0 + shift - lw / 2, Math.min(y0 + 1, y1));
      const b = point(x0 + shift + lw / 2, Math.max(y0 + 1, y1));
      barMinX = Math.min(barMinX, a.x);
      barMaxX = Math.max(barMaxX, b.x);
      barMaxY = Math.max(barMaxY, b.y);
      nodes.push({
        id: `bar-${nodes.length}`,
        role: 'bars',
        geometry: { kind: 'rect', x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y },
      });
    },
    text(x, y, value, rgb, font) {
      if (rgb !== '000000') throw new Error('Unexpected HRI color');
      const commands = outlineHri(x, y, value, font).map((command): PathCommand => {
        if (command.op === 'Z') return command;
        if (command.op === 'C') {
          const a = point(command.x1, command.y1);
          const b = point(command.x2, command.y2);
          return { op: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...point(command.x, command.y) };
        }
        return { op: command.op, ...point(command.x, command.y) };
      });
      nodes.push({
        id: `hri-${nodes.length}`,
        role: 'other',
        geometry: { kind: 'path', commands, fillRule: 'nonzero' },
      });
    },
    polygon: unsupported,
    fill: unsupported,
    hexagon: unsupported,
    ellipse: unsupported,
    end() {
      // These layout assumptions are verified against the locked reference, not general EAN profiles.
      if (Math.abs(barMinX - 11 * moduleMm) > 1e-8 || Math.abs(barMaxX - 106 * moduleMm) > 1e-8)
        throw new Error('Unexpected EAN HRI layout');
      if (minX < 0 || minY < 0 || maxX > widthMm || maxY > heightMm)
        throw new Error('HRI outside scene envelope');
      return {
        version: 1,
        units: 'mm',
        widthMm,
        heightMm,
        contentBounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        symbolBounds: { x: barMinX, y: 0, width: barMaxX - barMinX, height: barMaxY },
        quietZoneBounds: { x: 0, y: 0, width: widthMm, height: heightMm },
        foreground: { space: 'RGB', hex: '000000' },
        nodes,
        metadata: {
          schemaVersion: 1,
          symbologyId: 'ean13',
          profileId: 'm0-hri-spike',
          sourceValue: request.text,
          options: { ...options, moduleMm, callbackUnitsPerModule: 2, hri: 'outlined' },
          engineVersion: ENGINE_VERSION,
          layoutVersion: `${LAYOUT_VERSION};hri-v1`,
        },
      };
    },
  };
  return ean13(options, drawing);
}
