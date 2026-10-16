import { finite, stableStringify } from '@astmatrix/shared';
export { MM_TO_PT } from '@astmatrix/shared';
/** Millimetres; top-left origin, x right, y down. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Color =
  | { space: 'RGB'; hex: string }
  | { space: 'CMYK'; c: number; m: number; y: number; k: number };
export type PathCommand =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Z' };
export type Geometry =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'path'; commands: PathCommand[]; fillRule: 'nonzero' | 'evenodd' }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'polygon'; points: { x: number; y: number }[]; fillRule: 'nonzero' | 'evenodd' }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      fontFamily: string;
      fontSizeMm: number;
      bounds: Bounds;
    };
export interface SceneNode {
  id: string;
  role: 'bars' | 'modules' | 'finder' | 'text' | 'quiet-zone' | 'other';
  geometry: Geometry;
  fill?: Color;
}
export interface VectorScene {
  version: 1;
  units: 'mm';
  widthMm: number;
  heightMm: number;
  contentBounds: Bounds;
  symbolBounds: Bounds;
  quietZoneBounds: Bounds;
  foreground: { space: 'RGB'; hex: string };
  background?: { space: 'RGB'; hex: string };
  nodes: SceneNode[];
  metadata: {
    schemaVersion: 1;
    symbologyId: string;
    profileId: string;
    sourceValue: string;
    options: Record<string, unknown>;
    engineVersion: string;
    layoutVersion: string;
    request?: { symbologyId: string; profileId: string; fields: Record<string, unknown> };
    style?: { foreground: string; background: string; hri: boolean; font: string };
    dimensions?: { moduleMm: number; heightMm: number };
  };
}
export const LAYOUT_VERSION = 'm1-mm-v1';
export const SPIKE_LAYOUT_VERSION = 'm0-mm-v1';
export const GEOMETRY_TOLERANCE_MM = 1e-8;
export function validateColor(color: Color): void {
  if (color.space === 'RGB') {
    if (!/^[0-9a-fA-F]{6}$/.test(color.hex)) throw new Error('Invalid RGB color');
  } else if (color.space === 'CMYK') {
    if ([color.c, color.m, color.y, color.k].some((v) => !Number.isFinite(v) || v < 0 || v > 100))
      throw new Error('Invalid CMYK color');
  } else throw new Error('Unsupported color space');
}
const positive = (v: number) => {
  finite(v);
  if (v <= 0) throw new Error('Expected positive dimension');
};
export function validateBounds(b: Bounds): void {
  [b.x, b.y, b.width, b.height].forEach(finite);
  if (b.width < 0 || b.height < 0) throw new Error('Negative bounds');
}
export function unionBounds(bounds: Bounds[]): Bounds {
  if (!bounds.length) throw new Error('Empty geometry');
  bounds.forEach(validateBounds);
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const b of bounds) {
    x = Math.min(x, b.x);
    y = Math.min(y, b.y);
    right = Math.max(right, b.x + b.width);
    bottom = Math.max(bottom, b.y + b.height);
  }
  return { x, y, width: right - x, height: bottom - y };
}
function pointsBounds(points: { x: number; y: number }[]): Bounds {
  if (!points.length) throw new Error('Empty points');
  points.forEach((p) => {
    finite(p.x);
    finite(p.y);
  });
  return unionBounds(points.map((p) => ({ ...p, width: 0, height: 0 })));
}
const cubic = (a: number, b: number, c: number, d: number, t: number) =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
function extrema(a: number, b: number, c: number, d: number): number[] {
  const qa = -a + 3 * b - 3 * c + d,
    qb = 2 * (a - 2 * b + c),
    qc = b - a;
  if (Math.abs(qa) < 1e-12)
    return Math.abs(qb) < 1e-12 ? [] : [-qc / qb].filter((t) => t > 0 && t < 1);
  const delta = qb * qb - 4 * qa * qc;
  return delta < 0
    ? []
    : [(-qb + Math.sqrt(delta)) / (2 * qa), (-qb - Math.sqrt(delta)) / (2 * qa)].filter(
        (t) => t > 0 && t < 1,
      );
}
export function geometryBounds(g: Geometry): Bounds {
  if (g.kind === 'rect') {
    positive(g.w);
    positive(g.h);
    return pointsBounds([
      { x: g.x, y: g.y },
      { x: g.x + g.w, y: g.y + g.h },
    ]);
  }
  if (g.kind === 'ellipse') {
    positive(g.rx);
    positive(g.ry);
    return pointsBounds([
      { x: g.cx - g.rx, y: g.cy - g.ry },
      { x: g.cx + g.rx, y: g.cy + g.ry },
    ]);
  }
  if (g.kind === 'text') {
    finite(g.x);
    finite(g.y);
    positive(g.fontSizeMm);
    if (!g.fontFamily || !g.text) throw new Error('Missing text/font');
    validateBounds(g.bounds);
    return g.bounds;
  }
  if (g.kind === 'polygon') {
    if (g.points.length < 3 || !['nonzero', 'evenodd'].includes(g.fillRule))
      throw new Error('Invalid polygon');
    return pointsBounds(g.points);
  }
  if (g.kind !== 'path' || !['nonzero', 'evenodd'].includes(g.fillRule))
    throw new Error('Unsupported geometry');
  const points: { x: number; y: number }[] = [];
  let current: { x: number; y: number } | null = null,
    start: { x: number; y: number } | null = null;
  for (const command of g.commands) {
    if (command.op === 'Z') {
      if (!start) throw new Error('Close without move');
      current = start;
      start = null;
      continue;
    }
    Object.values(command)
      .filter((v) => typeof v === 'number')
      .forEach((v) => finite(v));
    if (command.op === 'M') {
      current = { x: command.x, y: command.y };
      start = current;
      points.push(current);
      continue;
    }
    if (!current || !start) throw new Error('Path must start with move');
    const end = { x: command.x, y: command.y };
    if (command.op === 'C') {
      for (const t of [
        ...extrema(current.x, command.x1, command.x2, command.x),
        ...extrema(current.y, command.y1, command.y2, command.y),
      ])
        points.push({
          x: cubic(current.x, command.x1, command.x2, command.x, t),
          y: cubic(current.y, command.y1, command.y2, command.y, t),
        });
    } else if (command.op !== 'L') throw new Error('Unsupported path command');
    points.push(end);
    current = end;
  }
  if (start) throw new Error('Filled paths must be closed');
  return pointsBounds(points);
}
export function contains(outer: Bounds, inner: Bounds): boolean {
  const e = GEOMETRY_TOLERANCE_MM;
  return (
    inner.x >= outer.x - e &&
    inner.y >= outer.y - e &&
    inner.x + inner.width <= outer.x + outer.width + e &&
    inner.y + inner.height <= outer.y + outer.height + e
  );
}
export function validateScene(scene: VectorScene): void {
  if (scene.version !== 1 || scene.units !== 'mm')
    throw new Error('Unsupported scene version/units');
  positive(scene.widthMm);
  positive(scene.heightMm);
  validateColor(scene.foreground);
  if (scene.background) validateColor(scene.background);
  const envelope = { x: 0, y: 0, width: scene.widthMm, height: scene.heightMm };
  for (const b of [scene.contentBounds, scene.symbolBounds, scene.quietZoneBounds]) {
    validateBounds(b);
    if (!contains(envelope, b)) throw new Error('Bounds outside scene');
  }
  if (stableStringify(envelope) !== stableStringify(scene.quietZoneBounds))
    throw new Error('Quiet-zone envelope must match physical dimensions');
  const ids = new Set<string>();
  for (const n of scene.nodes) {
    if (!n.id || ids.has(n.id)) throw new Error('Duplicate/empty node ID');
    ids.add(n.id);
    if (!['bars', 'modules', 'finder', 'text', 'quiet-zone', 'other'].includes(n.role))
      throw new Error('Invalid node role');
    if (n.fill) validateColor(n.fill);
    if (
      !contains(
        n.role === 'quiet-zone' ? scene.quietZoneBounds : scene.contentBounds,
        geometryBounds(n.geometry),
      )
    )
      throw new Error('Geometry outside content bounds');
  }
  if (!scene.nodes.length) throw new Error('Empty scene');
  const m = scene.metadata;
  if (
    m.schemaVersion !== 1 ||
    !m.symbologyId ||
    !m.profileId ||
    typeof m.sourceValue !== 'string' ||
    !m.engineVersion ||
    !m.layoutVersion
  )
    throw new Error('Invalid recoverable metadata');
  stableStringify(m);
}
export function transformGeometry(g: Geometry, sx: number, sy: number, dx = 0, dy = 0): Geometry {
  positive(sx);
  positive(sy);
  finite(dx);
  finite(dy);
  const point = (p: { x: number; y: number }) => ({ x: p.x * sx + dx, y: p.y * sy + dy });
  if (g.kind === 'rect') return { kind: 'rect', ...point(g), w: g.w * sx, h: g.h * sy };
  if (g.kind === 'ellipse')
    return { ...g, cx: g.cx * sx + dx, cy: g.cy * sy + dy, rx: g.rx * sx, ry: g.ry * sy };
  if (g.kind === 'polygon') return { ...g, points: g.points.map(point) };
  if (g.kind === 'text') {
    if (sx !== sy) throw new Error('Text requires uniform scaling');
    return {
      ...g,
      ...point(g),
      fontSizeMm: g.fontSizeMm * sx,
      bounds: { ...point(g.bounds), width: g.bounds.width * sx, height: g.bounds.height * sy },
    };
  }
  return {
    ...g,
    commands: g.commands.map((c) =>
      c.op === 'Z'
        ? c
        : c.op === 'C'
          ? {
              op: 'C',
              ...point(c),
              x1: c.x1 * sx + dx,
              y1: c.y1 * sy + dy,
              x2: c.x2 * sx + dx,
              y2: c.y2 * sy + dy,
            }
          : { op: c.op, ...point(c) },
    ),
  };
}
export function scaleScene(scene: VectorScene, sx: number, sy = sx): VectorScene {
  validateScene(scene);
  positive(sx);
  positive(sy);
  if (
    (['qrcode', 'datamatrix'].includes(scene.metadata.symbologyId) ||
      scene.nodes.some((node) => node.role === 'modules' || node.role === 'finder')) &&
    sx !== sy
  )
    throw new Error('Matrix codes require uniform scaling');
  const bounds = (b: Bounds) => ({
    x: b.x * sx,
    y: b.y * sy,
    width: b.width * sx,
    height: b.height * sy,
  });
  const result: VectorScene = {
    ...scene,
    widthMm: scene.widthMm * sx,
    heightMm: scene.heightMm * sy,
    contentBounds: bounds(scene.contentBounds),
    symbolBounds: bounds(scene.symbolBounds),
    quietZoneBounds: bounds(scene.quietZoneBounds),
    nodes: scene.nodes.map((n) => ({ ...n, geometry: transformGeometry(n.geometry, sx, sy) })),
    metadata: {
      ...scene.metadata,
      options: { ...scene.metadata.options, physicalScale: { sx, sy } },
    },
  };
  validateScene(result);
  return result;
}
/** Preserve every rectangle edge; merge only nonzero rectangles of one role and fill. */
export function mergeRectangles(nodes: SceneNode[]): SceneNode[] {
  const groups = new Map<string, SceneNode[]>();
  const others: SceneNode[] = [];
  for (const n of nodes) {
    if (n.geometry.kind !== 'rect') {
      others.push(n);
      continue;
    }
    const key = stableStringify({ role: n.role, fill: n.fill ?? null });
    const group = groups.get(key) ?? [];
    group.push(n);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const commands: PathCommand[] = [];
    for (const n of group) {
      const g = n.geometry;
      if (g.kind !== 'rect') continue;
      commands.push(
        { op: 'M', x: g.x, y: g.y },
        { op: 'L', x: g.x + g.w, y: g.y },
        { op: 'L', x: g.x + g.w, y: g.y + g.h },
        { op: 'L', x: g.x, y: g.y + g.h },
        { op: 'Z' },
      );
    }
    others.push({
      ...group[0]!,
      id: `merged-${group[0]!.id}`,
      geometry: { kind: 'path', commands, fillRule: 'nonzero' },
    });
  }
  return others;
}
