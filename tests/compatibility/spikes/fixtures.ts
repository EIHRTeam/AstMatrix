import type { VectorScene } from '@astmatrix/vector-ir';
import { LAYOUT_VERSION } from '@astmatrix/vector-ir';
export function primitiveScene(): VectorScene {
  return {
    version: 1,
    units: 'mm',
    widthMm: 45,
    heightMm: 30,
    contentBounds: { x: 2, y: 2, width: 38, height: 23 },
    symbolBounds: { x: 2, y: 2, width: 41, height: 26 },
    quietZoneBounds: { x: 0, y: 0, width: 45, height: 30 },
    foreground: { space: 'RGB', hex: '000000' },
    nodes: [
      { id: 'rect', role: 'other', geometry: { kind: 'rect', x: 2, y: 2, w: 20, h: 10 } },
      {
        id: 'curve',
        role: 'other',
        geometry: {
          kind: 'path',
          fillRule: 'nonzero',
          commands: [
            { op: 'M', x: 25, y: 10 },
            { op: 'C', x1: 25, y1: 2, x2: 40, y2: 2, x: 40, y: 10 },
            { op: 'L', x: 40, y: 25 },
            { op: 'L', x: 25, y: 25 },
            { op: 'Z' },
          ],
        },
      },
    ],
    metadata: {
      schemaVersion: 1,
      symbologyId: 'm0-primitives',
      profileId: 'm0-spike',
      sourceValue: 'non-barcode primitive fixture',
      options: { hri: 'excluded' },
      engineVersion: 'fixture-v1',
      layoutVersion: LAYOUT_VERSION,
    },
  };
}
