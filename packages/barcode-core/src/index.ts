import { BWIPJS_VERSION, BWIPP_VERSION } from 'bwip-js/generic';
import type { DrawingContext } from 'bwip-js/generic';
import { AstMatrixError, errorMessage } from '@astmatrix/shared';
import { normalizeRequest, getProfile } from '@astmatrix/profiles';
import type { GenerateRequest, NormalizedRequest } from '@astmatrix/profiles';
import {
  geometryBounds,
  unionBounds,
  transformGeometry,
  mergeRectangles,
  validateScene,
  LAYOUT_VERSION,
} from '@astmatrix/vector-ir';
import type { SceneNode, PathCommand, VectorScene } from '@astmatrix/vector-ir';
import { measureHri, outlineHri } from './hri';
import { getSymbology } from '@astmatrix/symbology-catalog';
import { encoders, drawingUnitsPerModule } from './encoders';
import { providerOptions, usesUtf8Eci } from './options';
import { ellipseCommands } from './curves';
export { providerOptions } from './options';
/**
 * Persisted engine identifier written into inserted-object metadata. The encoded BWIPP/provider
 * value is a compatibility token for restore checks; do not rename it without a migration.
 */
export const ENGINE_VERSION = `bwip-js:${BWIPJS_VERSION};BWIPP:${BWIPP_VERSION};provider:m7-v1`;
export interface EncodeProvider {
  readonly engineVersion: string;
  readonly restorableEngineVersions?: readonly string[];
  encode(request: NormalizedRequest): VectorScene | Promise<VectorScene>;
}
/** Captures the locked engine's raw drawing units. No SVG parsing, DOM or filesystem. */
export interface PipelineObserver {
  now: () => number;
  record: (stage: 'encode' | 'ir', milliseconds: number) => void;
}
export function encodeNormalized(
  request: NormalizedRequest,
  observer?: PipelineObserver,
): VectorScene {
  const start = observer?.now() ?? 0;
  const options = providerOptions(request),
    raw: SceneNode[] = [];
  const definition = getSymbology(request.symbologyId);
  const matrix = definition.layout !== 'linear';
  let scale = 2,
    width = 0,
    height = 0,
    commands: PathCommand[] = [];
  const add = (
    geometry: SceneNode['geometry'],
    role: SceneNode['role'] = matrix ? 'modules' : 'bars',
  ) => raw.push({ id: `n${raw.length}`, role, geometry });
  const unsupported = () => {
    throw new Error('Unsupported diagonal drawing callback');
  };
  const drawing: DrawingContext<VectorScene> = {
    scale(sx, sy) {
      if (sx !== sy || !Number.isFinite(sx) || sx <= 0)
        throw new Error('Nonuniform/invalid provider scale');
      scale = sx;
      return null;
    },
    measure: measureHri,
    init(w, h) {
      width = w;
      height = h;
    },
    line(x0, y0, x1, y1, lw) {
      x0 = Math.trunc(x0);
      x1 = Math.trunc(x1);
      y0 = Math.trunc(y0);
      y1 = Math.trunc(y1);
      lw = Math.round(lw) || 1;
      const shift = lw % 2 ? 0.5 : 0;
      if (x0 === x1)
        add({
          kind: 'rect',
          x: x0 + shift - lw / 2,
          y: Math.min(y0 + 1, y1),
          w: lw,
          h: Math.abs(y1 - y0 - 1),
        });
      else if (y0 === y1)
        add({
          kind: 'rect',
          x: Math.min(x0 + 1, x1),
          y: y0 + shift - lw / 2,
          w: Math.abs(x1 - x0 - 1),
          h: lw,
        });
      else unsupported();
    },
    polygon(points) {
      points.forEach(([x, y], i) => commands.push({ op: i ? 'L' : 'M', x, y }));
      commands.push({ op: 'Z' });
    },
    fill() {
      if (commands.length) {
        add({ kind: 'path', commands, fillRule: 'evenodd' });
        commands = [];
      }
    },
    ellipse(x, y, rx, ry) {
      commands.push(...ellipseCommands(x, y, rx, ry));
    },
    hexagon(points) {
      points.forEach(([x, y], i) => commands.push({ op: i ? 'L' : 'M', x, y }));
      commands.push({ op: 'Z' });
    },
    text(x, y, text, _color, font) {
      const outlines = outlineHri(x, y, text, font);
      if (outlines.length) add({ kind: 'path', commands: outlines, fillRule: 'nonzero' }, 'text');
    },
    end() {
      const layoutStart = observer?.now() ?? 0;
      observer?.record('encode', layoutStart - start);
      if (commands.length || !raw.length || width <= 0 || height <= 0)
        throw new Error('Incomplete provider drawing');
      const unitsPerModule = drawingUnitsPerModule(request.symbologyId, scale);
      const mm = request.fields.moduleMm / unitsPerModule;
      let physical = raw.map((n) => ({ ...n, geometry: transformGeometry(n.geometry, mm, mm) }));
      const originalSymbol = unionBounds(
        physical.filter((n) => n.role !== 'text').map((n) => geometryBounds(n.geometry)),
      );
      if (!matrix) {
        const dy = request.fields.heightMm - originalSymbol.height;
        physical = physical.map((n) => ({
          ...n,
          geometry:
            n.role === 'text'
              ? transformGeometry(
                  n.geometry,
                  1,
                  1,
                  0,
                  geometryBounds(n.geometry).y > originalSymbol.y + originalSymbol.height / 2
                    ? dy
                    : 0,
                )
              : transformGeometry(
                  n.geometry,
                  1,
                  request.fields.heightMm / originalSymbol.height,
                  0,
                  originalSymbol.y * (1 - request.fields.heightMm / originalSymbol.height),
                ),
        }));
        height += dy / mm;
      }
      const symbol = unionBounds(
        physical.filter((n) => n.role !== 'text').map((n) => geometryBounds(n.geometry)),
      );
      const content = unionBounds(physical.map((n) => geometryBounds(n.geometry)));
      const quiet = definition.quietModules;
      const [l, r, t, b] = quiet.map((n) => n * request.fields.moduleMm) as [
        number,
        number,
        number,
        number,
      ];
      const dx = Math.max(l - symbol.x, -content.x),
        dy = Math.max(t - symbol.y, -content.y);
      const nodes = physical.map((n) => ({
        ...n,
        geometry: transformGeometry(n.geometry, 1, 1, dx, dy),
      }));
      const widthMm =
        Math.max(symbol.x + symbol.width + r, content.x + content.width, width * mm) + dx;
      const heightMm =
        Math.max(symbol.y + symbol.height + b, content.y + content.height, height * mm) + dy;
      const scene: VectorScene = {
        version: 1,
        units: 'mm',
        widthMm,
        heightMm,
        contentBounds: { ...content, x: content.x + dx, y: content.y + dy },
        symbolBounds: { ...symbol, x: symbol.x + dx, y: symbol.y + dy },
        quietZoneBounds: { x: 0, y: 0, width: widthMm, height: heightMm },
        foreground: { space: 'RGB', hex: request.fields.foreground },
        ...(request.fields.background === 'transparent'
          ? {}
          : { background: { space: 'RGB' as const, hex: request.fields.background } }),
        nodes: request.fields.mergePaths ? mergeRectangles(nodes) : nodes,
        metadata: {
          schemaVersion: 1,
          symbologyId: request.symbologyId,
          profileId: request.profileId,
          sourceValue: request.text,
          options: {
            ...options,
            callbackUnitsPerModule: unitsPerModule,
            drawingScale: scale,
            quietModules: quiet,
            hri: request.fields.hri ? 'outlined' : 'none',
            unicode: usesUtf8Eci(request) ? 'UTF-8 ECI 26' : 'profile-defined ASCII',
          },
          engineVersion: ENGINE_VERSION,
          layoutVersion: LAYOUT_VERSION,
          request: {
            symbologyId: request.symbologyId,
            profileId: request.profileId,
            fields: request.inputFields ? { ...request.inputFields } : recoveryFields(request),
          },
          style: {
            foreground: request.fields.foreground,
            background: request.fields.background,
            hri: request.fields.hri,
            font: request.fields.font,
          },
          dimensions: { moduleMm: request.fields.moduleMm, heightMm: request.fields.heightMm },
        },
      };
      validateScene(scene);
      observer?.record('ir', observer.now() - layoutStart);
      return scene;
    },
  };
  try {
    const encoder = encoders[options.bcid];
    if (!encoder) throw new Error(`Missing encoder: ${request.symbologyId}`);
    return encoder({ ...options }, drawing);
  } catch (error) {
    const message = errorMessage(error);
    throw new AstMatrixError(
      /capacity|tooLong|too long|NoValidSymbol|maximum|fit/i.test(message)
        ? 'CAPACITY_EXCEEDED'
        : /font|glyph/i.test(message)
          ? 'MISSING_FONT'
          : 'PROVIDER_ERROR',
      message,
      'provider',
    );
  }
}
/** Compatibility for providers called with older hand-built normalized requests. */
function recoveryFields(request: NormalizedRequest): Record<string, unknown> {
  const profile = getProfile(request.profileId);
  return Object.fromEntries(
    profile.fields.map(({ name }) => [
      name,
      name === 'text' && request.fields.checkDigit === 'generate'
        ? request.text.slice(0, -1)
        : request.fields[name as keyof NormalizedRequest['fields']],
    ]),
  );
}
export const bwipProvider: EncodeProvider = {
  engineVersion: ENGINE_VERSION,
  // Read-only compatibility list for metadata written by earlier pre-release provider versions.
  restorableEngineVersions: [
    ENGINE_VERSION,
    ENGINE_VERSION.replace('provider:m7-v1', 'provider:m1-v1'),
  ],
  encode: encodeNormalized,
};
export function generateScene(request: GenerateRequest): VectorScene {
  return encodeNormalized(normalizeRequest(request));
}
