import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { Resvg } from '@resvg/resvg-js';
import { encodeHriSpike } from '../../packages/barcode-core/src/spike-hri';
import { renderSvg } from '@astmatrix/renderers-svg';
import type { VectorScene } from '@astmatrix/vector-ir';
interface NativePoint {
  anchor: number[];
  left: number[];
  right: number[];
}
interface NativeNode {
  id: string;
  fillRule: string;
  contours: NativePoint[][];
}
const require = createRequire(import.meta.url);
const helper = require('./spikes/hri/contours.cjs') as {
  toContours(scene: VectorScene): NativeNode[];
};
const scene = encodeHriSpike({ text: '6901234567892' });
const outlinePath = (points: NativePoint[]) => {
  let result = `M${points[0]!.anchor.join(' ')}`;
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1]!,
      b = points[i % points.length]!;
    const curved =
      a.right.some((v, j) => v !== a.anchor[j]) || b.left.some((v, j) => v !== b.anchor[j]);
    result += curved
      ? `C${[...a.right, ...b.left, ...b.anchor].join(' ')}`
      : `L${b.anchor.join(' ')}`;
  }
  return `${result}Z`;
};

const command = () => ({
  addNode: () => {},
  createCommand: () => ({}),
  addCommand() {
    return this;
  },
});

describe('M0 native HRI conversions, not host acceptance', () => {
  it('passes HRI cubic controls to Illustrator in points with the correct Y inversion', () => {
    type Point = {
      anchor: number[];
      leftDirection: number[];
      rightDirection: number[];
      pointType: string;
    };
    const compounds: Array<
      Array<{ pathPoints: Point[] & { add(): Point }; closed: boolean; evenodd: boolean }>
    > = [];
    const rectangles: number[][] = [];
    const group = {
      name: '',
      note: '',
      selected: false,
      geometricBounds: [0, 0, 1, -1],
      remove: () => {},
      pathItems: {
        rectangle: (...args: number[]) => {
          rectangles.push(args);
          return {};
        },
      },
      compoundPathItems: {
        add: () => {
          const paths: (typeof compounds)[number] = [];
          compounds.push(paths);
          return {
            pathItems: {
              add: () => {
                const list: Point[] = [];
                const points = Object.assign(list, {
                  add() {
                    const p: Point = {
                      anchor: [],
                      leftDirection: [],
                      rightDirection: [],
                      pointType: '',
                    };
                    list.push(p);
                    return p;
                  },
                });
                const result = { pathPoints: points, closed: false, evenodd: false };
                paths.push(result);
                return result;
              },
            },
          };
        },
      },
    };
    const doc = {
      artboards: Object.assign([{ artboardRect: [0, 0, 500, -500] }], {
        getActiveArtboardIndex: () => 0,
      }),
      groupItems: { add: () => group },
      selection: null,
    };
    const app = {
      documents: [doc],
      activeDocument: doc,
      coordinateSystem: 'original',
      version: 'mock',
    };
    const context = vm.createContext({
      app,
      $: { os: 'mock', version: 'mock' },
      CoordinateSystem: { DOCUMENTCOORDINATESYSTEM: 'document' },
      PointType: { CORNER: 'corner' },
      RGBColor: class {
        red = 0;
        green = 0;
        blue = 0;
      },
      scene,
      metadata: JSON.stringify(scene.metadata),
    });
    vm.runInContext(
      readFileSync('tests/compatibility/spikes/illustrator/host.jsx', 'utf8'),
      context,
    );
    expect(vm.runInContext('$._astmatrixM0.insert(scene, metadata, -1)', context)).toContain(
      'INSERTED',
    );
    expect(app.coordinateSystem).toBe('original');
    expect(group.selected).toBe(true);
    expect(rectangles).toHaveLength(31); // Thirty bars and the transparent envelope.
    expect(compounds).toHaveLength(13);
    const pt = 72 / 25.4;
    const actual = compounds.flatMap((paths) =>
      paths.flatMap((path) =>
        path.pathPoints.map((p) => [...p.rightDirection, ...p.leftDirection, ...p.anchor]),
      ),
    );
    expect(actual.every((row) => row.every(Number.isFinite))).toBe(true);
    expect(compounds.every((paths) => paths.every((path) => path.closed && !path.evenodd))).toBe(
      true,
    );
    // Check every cubic against the original IR; the preceding anchor owns the outgoing handle.
    const cubicPairs: Array<{ actual: number[]; expected: number[] }> = [];
    const hriNodes = scene.nodes.filter((node) => node.geometry.kind === 'path');
    hriNodes.forEach((node, i) => {
      if (node.geometry.kind !== 'path') throw new Error('Expected HRI path');
      let contour = -1,
        position = -1;
      for (const command of node.geometry.commands) {
        if (command.op === 'M') {
          contour++;
          position = 0;
        } else if (command.op === 'L' || command.op === 'C') position++;
        if (command.op === 'C') {
          const points = compounds[i]![contour]!.pathPoints;
          cubicPairs.push({
            actual: [...points[position - 1]!.rightDirection, ...points[position]!.leftDirection],
            expected: [
              (10 + command.x1) * pt,
              -(10 + command.y1) * pt,
              (10 + command.x2) * pt,
              -(10 + command.y2) * pt,
            ],
          });
        }
      }
    });
    expect(cubicPairs.length).toBeGreaterThan(100);
    cubicPairs.forEach((pair) =>
      pair.actual.forEach((v, i) => expect(v).toBeCloseTo(pair.expected[i]!, 9)),
    );
  });
  it('roundtrips incoming/outgoing cubic handles, closed contours and XOR holes through raster comparison', () => {
    const native = helper.toContours(scene);
    const paths = native.flatMap((node) => node.contours.map(outlinePath)).join('');
    const reconstructed = `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.widthMm}mm" height="${scene.heightMm}mm" viewBox="0 0 ${scene.widthMm} ${scene.heightMm}"><path fill-rule="evenodd" d="${paths}"/></svg>`;
    const options = { dpi: 600, background: '#fff', font: { loadSystemFonts: false } };
    const actual = new Resvg(reconstructed, options).render().pixels;
    const expected = new Resvg(renderSvg(scene), options).render().pixels;
    expect(actual.length).toBe(expected.length);
    let difference = 0;
    actual.forEach((value, i) => {
      difference += Math.abs(value - expected[i]!);
    });
    expect(difference / (actual.length * 255)).toBeLessThan(1e-6);
    expect(native).toHaveLength(43);
    for (const node of native)
      for (const points of node.contours) {
        expect(points.length).toBeGreaterThan(1);
        expect(points.at(-1)!.anchor).not.toEqual(points[0]!.anchor);
      }
  });
  it('keeps the incoming control of a cubic closure while removing its duplicate endpoint', () => {
    const curved: VectorScene = {
      ...scene,
      nodes: [
        {
          id: 'closure',
          role: 'other',
          geometry: {
            kind: 'path',
            fillRule: 'nonzero',
            commands: [
              { op: 'M', x: 0, y: 0 },
              { op: 'L', x: 10, y: 0 },
              { op: 'C', x1: 10, y1: 10, x2: 0, y2: 10, x: 0, y: 0 },
              { op: 'Z' },
            ],
          },
        },
      ],
    };
    const points = helper.toContours(curved)[0]!.contours[0]!;
    expect(points).toHaveLength(2);
    expect(points[0]!.left).toEqual([0, 10]);
    expect(points[1]!.right).toEqual([10, 10]);
    expect(outlinePath(points)).toContain('C10 10 0 10 0 0');
    const open = {
      ...curved,
      nodes: [
        {
          ...curved.nodes[0]!,
          geometry: {
            kind: 'path' as const,
            fillRule: 'nonzero' as const,
            commands: [{ op: 'L' as const, x: 1, y: 1 }],
          },
        },
      ],
    };
    expect(() => helper.toContours(open)).toThrow('Missing native contour start');
    expect(() =>
      helper.toContours({
        ...scene,
        widthMm: NaN,
        nodes: [{ id: 'bad', role: 'other', geometry: { kind: 'rect', x: NaN, y: 0, w: 1, h: 1 } }],
      }),
    ).toThrow('Non-finite');
  });
  for (const dpi of [72, 300, 600]) {
    it(`preserves Photoshop closed path anchors and cubic handles at ${dpi} DPI`, () => {
      const ps = {
        app: {
          PathPointInfo: class {
            anchor = [];
            leftDirection = [];
            rightDirection = [];
          },
          SubPathInfo: class {
            closed = false;
            operation = '';
            entireSubPath = [];
          },
        },
        constants: { PointKind: { CORNERPOINT: 'corner' }, ShapeOperation: { SHAPEXOR: 'xor' } },
      };
      const context = vm.createContext({ ps, module: { exports: {} }, require: () => helper });
      const source = readFileSync('tests/compatibility/spikes/photoshop/index.js', 'utf8');
      vm.runInContext(
        source.slice(source.indexOf('function point('), source.indexOf('function subpaths(')),
        context,
      );
      vm.runInContext(
        readFileSync('tests/compatibility/spikes/hri/photoshop.cjs', 'utf8'),
        context,
      );
      const convert = context['module'].exports as (
        value: VectorScene,
        scale: number,
        point: unknown,
        pathInfo: unknown,
      ) => Array<{
        closed: boolean;
        operation: string;
        entireSubPath: Array<{
          anchor: number[];
          leftDirection: number[];
          rightDirection: number[];
        }>;
      }>;
      const actual = convert(scene, dpi, context['point'], context['pathInfo']);
      const expected = helper.toContours(scene).flatMap((node) => node.contours);
      expect(actual).toHaveLength(expected.length);
      actual.forEach((contour, i) => {
        expect(contour.closed).toBe(true);
        expect(contour.operation).toBe('xor');
        expect(contour.entireSubPath).toHaveLength(expected[i]!.length);
        contour.entireSubPath.forEach((point, j) => {
          for (const [field, nativeField] of [
            ['anchor', 'anchor'],
            ['left', 'leftDirection'],
            ['right', 'rightDirection'],
          ] as const) {
            point[nativeField].forEach((v, k) =>
              expect(v).toBeCloseTo(((expected[i]![j]![field][k]! + 10) * dpi) / 25.4, 9),
            );
          }
        });
      });
    });
    it(`preserves Affinity native cubic control ordering at ${dpi} DPI`, () => {
      const calls: number[][] = [];
      const execute: unknown[] = [];
      const builder = () => ({
        beginXY: () => builder(),
        lineToXY: () => {},
        close: () => {},
        createCurve: () => ({}),
        addBezierXY: (...args: number[]) => calls.push(args),
      });
      const geometry = {
        CurveBuilder: { create: builder },
        PolyCurve: { create: () => ({ addCurve: () => {} }) },
        Curve: { createRectangle: () => ({}) },
        Rectangle: class {
          coordinates: number[];
          constructor(...values: number[]) {
            this.coordinates = values;
          }
        },
      };
      const modules: Record<string, unknown> = {
        '/document.js': {
          Document: {
            current: { dpi, executeCommand: (...args: unknown[]) => execute.push(args) },
          },
        },
        '/application.js': { Application: { version: 'mock-3.3.1' } },
        '/environment.js': { Environment: {} },
        '/geometry.js': geometry,
        '/nodes.js': {
          PolyCurveNodeDefinition: { create: () => ({}) },
          ContainerNodeDefinition: { create: () => ({}) },
        },
        '/commands.js': {
          AddChildNodesCommandBuilder: { create: command },
          CompoundCommandBuilder: { create: command },
        },
        '/fills.js': { FillDescriptor: { createNone: () => ({}), createSolid: () => ({}) } },
        '/linestyle.js': { LineStyleDescriptor: { createDefault: () => ({}) } },
        '/colours.js': { SVG11: { black: {} } },
        'affinity:common': { BlendMode: { Normal: 0 } },
        './hri-contours.js': helper,
        './hri-scene.js': scene,
      };
      vm.runInContext(
        readFileSync('tests/compatibility/spikes/hri/affinity.cjs', 'utf8'),
        vm.createContext({ require: (id: string) => modules[id], console: { log: () => {} } }),
      );
      const expected: number[][] = [];
      for (const node of helper.toContours(scene))
        for (const points of node.contours) {
          for (let i = 1; i <= points.length; i++) {
            const a = points[i - 1]!,
              b = points[i % points.length]!;
            if (
              a.right.some((v, j) => v !== a.anchor[j]) ||
              b.left.some((v, j) => v !== b.anchor[j])
            )
              expected.push(
                [...a.right, ...b.left, ...b.anchor].map((v) => ((v + 10) * dpi) / 25.4),
              );
          }
        }
      expect(calls.length).toBeGreaterThan(100);
      expect(calls).toHaveLength(expected.length);
      calls.forEach((actual, i) =>
        actual.forEach((v, j) => expect(v).toBeCloseTo(expected[i]![j]!, 9)),
      );
      expect(execute).toHaveLength(1);
    });
  }
});
