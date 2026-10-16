import { HostError } from '@astmatrix/host-contract';
import type { Geometry } from '@astmatrix/vector-ir';
export type Pair = [number, number];
export interface Vertex {
  anchor: Pair;
  left: Pair;
  right: Pair;
}
export interface Contour {
  points: Vertex[];
  operation: 'add' | 'subtract' | 'xor';
}
const vertex = (x: number, y: number): Vertex => ({ anchor: [x, y], left: [x, y], right: [x, y] });
const equal = (a: Pair, b: Pair) => a[0] === b[0] && a[1] === b[1];
/** Preserve cubic handles; closing curves use the incoming handle on the first anchor. */
export function geometryContours(g: Geometry): Contour[] {
  if (g.kind === 'text')
    throw new HostError(
      'UNSUPPORTED_FEATURE',
      'Photoshop 使用 HRI 矢量轮廓；不支持任意可编辑文字 Scene',
    );
  let paths: Vertex[][];
  const rule = g.kind === 'path' || g.kind === 'polygon' ? g.fillRule : 'nonzero';
  if (g.kind === 'rect')
    paths = [
      [
        vertex(g.x, g.y),
        vertex(g.x + g.w, g.y),
        vertex(g.x + g.w, g.y + g.h),
        vertex(g.x, g.y + g.h),
      ],
    ];
  else if (g.kind === 'polygon') paths = [g.points.map((p) => vertex(p.x, p.y))];
  else if (g.kind === 'ellipse') {
    const k = 0.5522847498307936,
      { cx: x, cy: y, rx, ry } = g;
    paths = [
      [
        { anchor: [x + rx, y], left: [x + rx, y - k * ry], right: [x + rx, y + k * ry] },
        { anchor: [x, y + ry], left: [x + k * rx, y + ry], right: [x - k * rx, y + ry] },
        { anchor: [x - rx, y], left: [x - rx, y + k * ry], right: [x - rx, y - k * ry] },
        { anchor: [x, y - ry], left: [x - k * rx, y - ry], right: [x + k * rx, y - ry] },
      ],
    ];
  } else {
    paths = [];
    let points: Vertex[] | null = null;
    for (const c of g.commands) {
      if (c.op === 'M') points = [vertex(c.x, c.y)];
      else if (c.op === 'L' || c.op === 'C') {
        if (!points) throw new HostError('INVALID_INPUT', 'Missing path start');
        const p = vertex(c.x, c.y);
        if (c.op === 'C') {
          points[points.length - 1]!.right = [c.x1, c.y1];
          p.left = [c.x2, c.y2];
        }
        points.push(p);
      } else {
        if (!points || points.length < 2) throw new HostError('INVALID_INPUT', 'Empty contour');
        if (equal(points[0]!.anchor, points[points.length - 1]!.anchor)) {
          points[0]!.left = points[points.length - 1]!.left;
          points.pop();
        }
        paths.push(points);
        points = null;
      }
    }
  }
  // FontLib includes a few closed, straight two-anchor contours. They have no fill area.
  paths = paths.filter(
    (points) =>
      !(
        points.length < 3 &&
        points.every((p) =>
          [p.anchor, p.left, p.right].every(
            (v) => Math.abs(cross(points[0]!.anchor, points[1]!.anchor, v)) < 1e-14,
          ),
        )
      ),
  );
  if (rule === 'evenodd') return paths.map((points) => ({ points, operation: 'xor' }));
  // Photoshop Boolean subpaths do not expose SVG's winding rule. Convert nested contours
  // into ordered add/subtract operations and reject ambiguous intersecting opposite winds.
  const polygons = paths.map(flatten),
    areas = polygons.map(area);
  if (areas.some((a) => Math.abs(a) < 1e-14))
    throw new HostError('UNSUPPORTED_FEATURE', 'Photoshop 不支持退化或抵消的 nonzero 轮廓');
  if (areas.every((a) => a > 0) || areas.every((a) => a < 0))
    return paths.map((points) => ({ points, operation: 'add' }));
  const containers = polygons.map((p, i) =>
    polygons.flatMap((other, j) => {
      if (i === j) return [];
      if (Math.sign(areas[i]!) !== Math.sign(areas[j]!) && intersects(p, other))
        throw new HostError('UNSUPPORTED_FEATURE', 'Photoshop 无法无损映射相交的反向 nonzero 轮廓');
      return Math.abs(areas[j]!) > Math.abs(areas[i]!) && inside(p[0]!, other) ? [j] : [];
    }),
  );
  return paths
    .map((points, i) => {
      const outside = containers[i]!.reduce((sum, j) => sum + Math.sign(areas[j]!), 0);
      const filled = outside + Math.sign(areas[i]!);
      return {
        points,
        operation: outside === 0 ? ('add' as const) : filled === 0 ? ('subtract' as const) : null,
        depth: containers[i]!.length,
      };
    })
    .filter(
      (c): c is { points: Vertex[]; operation: 'add' | 'subtract'; depth: number } =>
        c.operation !== null,
    )
    .sort((a, b) => a.depth - b.depth)
    .map(({ points, operation }) => ({ points, operation }));
}
function flatten(points: Vertex[]): Pair[] {
  const result: Pair[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    result.push(a.anchor);
    if (!equal(a.right, a.anchor) || !equal(b.left, b.anchor)) {
      // Classification only; original cubics are retained in the native path.
      for (let n = 1; n < 32; n++) {
        const t = n / 32,
          u = 1 - t;
        result.push(
          [0, 1].map(
            (k) =>
              u * u * u * a.anchor[k]! +
              3 * u * u * t * a.right[k]! +
              3 * u * t * t * b.left[k]! +
              t * t * t * b.anchor[k]!,
          ) as Pair,
        );
      }
    }
  }
  return result;
}
const area = (p: Pair[]) =>
  p.reduce((sum, a, i) => {
    const b = p[(i + 1) % p.length]!;
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
function inside(p: Pair, polygon: Pair[]): boolean {
  let contained = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      contained = !contained;
  }
  return contained;
}
const cross = (a: Pair, b: Pair, c: Pair) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function intersects(a: Pair[], b: Pair[]): boolean {
  const bounds = (p: Pair[]) => [
    Math.min(...p.map((v) => v[0])),
    Math.min(...p.map((v) => v[1])),
    Math.max(...p.map((v) => v[0])),
    Math.max(...p.map((v) => v[1])),
  ];
  const x = bounds(a),
    y = bounds(b);
  if (x[2]! < y[0]! || y[2]! < x[0]! || x[3]! < y[1]! || y[3]! < x[1]!) return false;
  return a.some((p, i) =>
    b.some((q, j) => {
      const r = a[(i + 1) % a.length]!,
        s = b[(j + 1) % b.length]!;
      const on = (a: Pair, b: Pair, c: Pair) =>
        Math.abs(cross(a, b, c)) < 1e-12 &&
        c[0] >= Math.min(a[0], b[0]) - 1e-12 &&
        c[0] <= Math.max(a[0], b[0]) + 1e-12 &&
        c[1] >= Math.min(a[1], b[1]) - 1e-12 &&
        c[1] <= Math.max(a[1], b[1]) + 1e-12;
      return (
        (cross(p, r, q) * cross(p, r, s) < 0 && cross(q, s, p) * cross(q, s, r) < 0) ||
        on(p, r, q) ||
        on(p, r, s) ||
        on(q, s, p) ||
        on(q, s, r)
      );
    }),
  );
}
