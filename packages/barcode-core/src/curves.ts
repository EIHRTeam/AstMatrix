import type { PathCommand } from '@astmatrix/vector-ir';
/** Four cubic segments, as in the locked bwip-js drawing contract; evenodd preserves finder holes. */
export function ellipseCommands(x: number, y: number, rx: number, ry: number): PathCommand[] {
  const k = 0.5522847498307936,
    dx = rx * k,
    dy = ry * k;
  return [
    { op: 'M', x: x - rx, y },
    { op: 'C', x1: x - rx, y1: y - dy, x2: x - dx, y2: y - ry, x, y: y - ry },
    { op: 'C', x1: x + dx, y1: y - ry, x2: x + rx, y2: y - dy, x: x + rx, y },
    { op: 'C', x1: x + rx, y1: y + dy, x2: x + dx, y2: y + ry, x, y: y + ry },
    { op: 'C', x1: x - dx, y1: y + ry, x2: x - rx, y2: y + dy, x: x - rx, y },
    { op: 'Z' },
  ];
}
