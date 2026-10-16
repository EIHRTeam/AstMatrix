/** Experimental M0 provider; deliberately absent from the production package export. */
import { BWIPJS_VERSION, BWIPP_VERSION, ean13, qrcode, toSVG } from 'bwip-js/generic';
import type { DrawingContext, RenderOptions } from 'bwip-js/generic';
import { SPIKE_LAYOUT_VERSION as LAYOUT_VERSION } from '@astmatrix/vector-ir';
import type { PathCommand, VectorScene } from '@astmatrix/vector-ir';

export interface SpikeRequest {
  bcid: 'ean13' | 'qrcode';
  text: string;
  moduleMm?: number;
}
export const ENGINE_VERSION = `bwip-js:${BWIPJS_VERSION};BWIPP:${BWIPP_VERSION}`;
export function spikeOptions(request: SpikeRequest): RenderOptions {
  return {
    bcid: request.bcid,
    text: request.text,
    scale: 2,
    includetext: false,
    ...(request.bcid === 'ean13' ? { height: 22.85 } : {}),
  };
}
function unsupported(): never {
  throw new Error('M0 excludes ellipse, hexagon, clipping and HRI; dedicated M7 samples required');
}

export function encodeSpike(request: SpikeRequest): VectorScene {
  if (request.bcid !== 'ean13' && request.bcid !== 'qrcode')
    throw new Error('M0 supports EAN-13 and QR only');
  const moduleMm = request.moduleMm ?? (request.bcid === 'ean13' ? 0.33 : 0.4);
  if (!Number.isFinite(moduleMm) || moduleMm <= 0 || moduleMm > 10)
    throw new Error('Invalid moduleMm');
  // BWIPP QR requests another scale(4,4) after scale(2,2); use the final callback scale.
  // Callback units are drawing units, never screen CSS px. Only these two sample encoders are admitted.
  let callbackUnitsPerModule = 2;
  let mm = moduleMm / callbackUnitsPerModule;
  const left = (request.bcid === 'ean13' ? 11 : 4) * moduleMm;
  const right = (request.bcid === 'ean13' ? 7 : 4) * moduleMm;
  const top = (request.bcid === 'ean13' ? 0 : 4) * moduleMm;
  const bottom = top;
  const nodes: VectorScene['nodes'] = [];
  let commands: PathCommand[] = [];
  let widthMm = 0,
    heightMm = 0;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const point = (x: number, y: number) => {
    const result = { x: x * mm + left, y: y * mm + top };
    minX = Math.min(minX, result.x);
    minY = Math.min(minY, result.y);
    maxX = Math.max(maxX, result.x);
    maxY = Math.max(maxY, result.y);
    return result;
  };
  const add = (geometry: VectorScene['nodes'][number]['geometry']) => {
    nodes.push({
      id: `n${nodes.length}`,
      role: request.bcid === 'ean13' ? 'bars' : 'modules',
      geometry,
    });
  };
  const drawing: DrawingContext<VectorScene> = {
    scale(sx, sy) {
      if (sx !== sy || sx <= 0) throw new Error('Nonuniform callback scale');
      callbackUnitsPerModule = sx;
      mm = moduleMm / sx;
      return null;
    },
    measure: unsupported,
    init(w, h) {
      widthMm = w * mm + left + right;
      heightMm = h * mm + top + bottom;
    },
    line(x0, y0, x1, y1, lw) {
      // Match the locked reference SVG's scale=2 integer, butt-cap convention.
      x0 = Math.trunc(x0);
      x1 = Math.trunc(x1);
      y0 = Math.trunc(y0);
      y1 = Math.trunc(y1);
      lw = Math.round(lw) || 1;
      if (x0 === x1) {
        const dx = lw % 2 ? 0.5 : 0;
        const a = point(x0 + dx - lw / 2, Math.min(y0 + 1, y1));
        const b = point(x0 + dx + lw / 2, Math.max(y0 + 1, y1));
        add({ kind: 'rect', x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
      } else if (y0 === y1) {
        const dy = lw % 2 ? 0.5 : 0;
        const a = point(Math.min(x0 + 1, x1), y0 + dy - lw / 2);
        const b = point(Math.max(x0 + 1, x1), y0 + dy + lw / 2);
        add({ kind: 'rect', x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
      } else throw new Error('Non-orthogonal line');
    },
    polygon(points) {
      points.forEach(([x, y], i) => commands.push({ op: i ? 'L' : 'M', ...point(x, y) }));
      commands.push({ op: 'Z' });
    },
    fill() {
      if (commands.length) {
        add({ kind: 'path', commands, fillRule: 'evenodd' });
        commands = [];
      }
    },
    hexagon: unsupported,
    ellipse: unsupported,
    text: unsupported,
    end() {
      if (commands.length || !nodes.length) throw new Error('Incomplete drawing');
      return {
        version: 1,
        units: 'mm',
        widthMm,
        heightMm,
        contentBounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        symbolBounds: {
          x: left,
          y: top,
          width: widthMm - left - right,
          height: heightMm - top - bottom,
        },
        quietZoneBounds: { x: 0, y: 0, width: widthMm, height: heightMm },
        foreground: { space: 'RGB', hex: '000000' },
        nodes,
        metadata: {
          schemaVersion: 1,
          symbologyId: request.bcid,
          profileId: 'm0-spike',
          sourceValue: request.text,
          options: { ...spikeOptions(request), moduleMm, callbackUnitsPerModule, hri: 'excluded' },
          engineVersion: ENGINE_VERSION,
          layoutVersion: LAYOUT_VERSION,
        },
      };
    },
  };
  return request.bcid === 'ean13'
    ? ean13(spikeOptions(request), drawing)
    : qrcode(spikeOptions(request), drawing);
}

/** Reference only; never parse this output in the encoding pipeline. */
export function referenceSvg(request: SpikeRequest): string {
  return toSVG(spikeOptions(request));
}
