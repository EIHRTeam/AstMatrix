import { expect, it } from 'vitest';
import { generateScene } from '@astmatrix/barcode-core';
import { geometryBounds, validateScene } from '@astmatrix/vector-ir';
import type { VectorScene } from '@astmatrix/vector-ir';
import {
  insertScene,
  MM_TO_FIGMA,
  FIGMA_METADATA_KEY,
  vectorPath,
  paint,
} from '../../packages/host-adapters/figma-plugin/src/renderer';
import { fakeFigma, figmaScene } from '../fixtures/figma';
import { basicSamples } from '../fixtures/core-samples';

for (const request of basicSamples)
  it(`Figma preserves physical bounds and outlines for ${request.symbologyId}`, () => {
    const host = fakeFigma();
    const scene = generateScene(request);
    const frame = insertScene(host.api, scene, () => true);
    expect(frame.width).toBeCloseTo(scene.widthMm * MM_TO_FIGMA, 10);
    expect(frame.height).toBeCloseTo(scene.heightMm * MM_TO_FIGMA, 10);
    expect(frame.x + frame.width / 2).toBeCloseTo(250);
    expect(frame.y + frame.height / 2).toBeCloseTo(360);
    expect(frame.clipsContent).toBe(false);
    expect(frame.layoutMode).toBe('NONE');
    expect(host.mock.currentPage.children).toHaveLength(1);
    expect(host.mock.currentPage.selection[0]?.id).toBe(frame.id);
    const root = host.created[0]!;
    expect(JSON.parse(root.data.get(FIGMA_METADATA_KEY)!)).toEqual(scene.metadata);
    const nodes = scene.nodes.filter((n) => n.role !== 'quiet-zone');
    expect(root.children).toHaveLength(nodes.length);
    nodes.forEach((source, i) => {
      const target = root.children[i]!;
      const b = geometryBounds(source.geometry);
      expect(target.x).toBeCloseTo(b.x * MM_TO_FIGMA, 10);
      expect(target.y).toBeCloseTo(b.y * MM_TO_FIGMA, 10);
      expect(target.strokes).toEqual([]);
      expect(target.fills).toEqual([paint(source.fill ?? scene.foreground)]);
    });
    expect(host.mock.commitUndo).toHaveBeenCalledOnce();
  });

it('keeps transparent and solid backgrounds on the full quiet-zone frame', () => {
  for (const background of ['transparent', 'ffffff']) {
    const host = fakeFigma();
    const scene = generateScene({
      symbologyId: 'qrcode',
      profileId: 'qr-default',
      fields: { text: 'Quiet zone', background },
    });
    const frame = insertScene(host.api, scene, () => true);
    expect(frame.fills).toEqual(background === 'transparent' ? [] : [paint(scene.background!)]);
    expect(frame.width).toBeGreaterThan(scene.symbolBounds.width * MM_TO_FIGMA);
  }
});

it('normalizes curves, compound holes, polygons and ellipses without rounding', () => {
  const host = fakeFigma();
  const scene: VectorScene = {
    ...figmaScene(),
    widthMm: 30,
    heightMm: 30,
    contentBounds: { x: 1, y: 1, width: 20, height: 20 },
    symbolBounds: { x: 1, y: 1, width: 20, height: 20 },
    quietZoneBounds: { x: 0, y: 0, width: 30, height: 30 },
    nodes: [
      {
        id: 'curve',
        role: 'text',
        geometry: {
          kind: 'path',
          fillRule: 'evenodd',
          commands: [
            { op: 'M', x: 1, y: 1 },
            { op: 'C', x1: 2, y1: 1, x2: 3, y2: 4, x: 4, y: 4 },
            { op: 'L', x: 1, y: 4 },
            { op: 'Z' },
            { op: 'M', x: 1.5, y: 2 },
            { op: 'L', x: 2, y: 2 },
            { op: 'L', x: 2, y: 3 },
            { op: 'Z' },
          ],
        },
      },
      {
        id: 'polygon',
        role: 'bars',
        geometry: {
          kind: 'polygon',
          fillRule: 'nonzero',
          points: [
            { x: 10, y: 10 },
            { x: 11.33, y: 10 },
            { x: 11, y: 11 },
          ],
        },
      },
      {
        id: 'ellipse',
        role: 'finder',
        geometry: { kind: 'ellipse', cx: 20, cy: 20, rx: 1, ry: 1 },
      },
    ],
  };
  validateScene(scene);
  insertScene(host.api, scene, () => true);
  expect(host.created.map((n) => n.type)).toEqual(['FRAME', 'VECTOR', 'VECTOR', 'ELLIPSE']);
  expect(host.created[1]!.vectorPaths[0]).toMatchObject({ windingRule: 'EVENODD' });
  expect(host.created[1]!.vectorPaths[0]!.data).toContain('C ');
  expect(host.created[1]!.vectorPaths[0]!.data.match(/M /g)).toHaveLength(2);
  expect(host.created[2]!.vectorPaths[0]!.windingRule).toBe('NONZERO');
  expect(host.created[3]!.width).toBeCloseTo(2 * MM_TO_FIGMA);
  expect(
    vectorPath({
      kind: 'polygon',
      fillRule: 'evenodd',
      points: [
        { x: -1, y: -1 },
        { x: 0, y: -1 },
        { x: 0, y: 0 },
      ],
    }).data,
  ).toMatch(/^M 0 0 /);
  expect(paint({ space: 'CMYK', c: 100, m: 0, y: 0, k: 50 }).color).toEqual({
    r: 0,
    g: 0.5,
    b: 0.5,
  });
});

it('rejects stale requests, invalid scenes and editable text before creating anything', () => {
  const host = fakeFigma();
  expect(() => insertScene(host.api, figmaScene(), () => false)).toThrow(
    expect.objectContaining({ code: 'CANCELLED' }),
  );
  expect(() => insertScene(host.api, { ...figmaScene(), widthMm: NaN }, () => true)).toThrow(
    /finite/i,
  );
  const scene = figmaScene();
  const b = scene.symbolBounds;
  scene.nodes = [
    {
      id: 'text',
      role: 'text',
      geometry: {
        kind: 'text',
        x: b.x,
        y: b.y,
        text: 'ABC',
        fontFamily: 'OCR-B',
        fontSizeMm: 3,
        bounds: b,
      },
    },
  ];
  expect(() => insertScene(host.api, scene, () => true)).toThrow(
    expect.objectContaining({ code: 'UNSUPPORTED_FEATURE' }),
  );
  expect(host.created).toHaveLength(0);
});

it('cleans orphan nodes if configuration fails and reports cleanup failures distinctly', () => {
  for (const cleanupFails of [false, true]) {
    const host = fakeFigma();
    host.mock.createVector.mockImplementation(() => {
      const node = host.mock.createRectangle();
      if (cleanupFails)
        node.remove.mockImplementation(() => {
          throw new Error('delete denied');
        });
      Object.defineProperty(node, 'fills', {
        set() {
          throw new Error('paint rejected');
        },
      });
      return node;
    });
    expect(() => insertScene(host.api, figmaScene(), () => true)).toThrow(
      expect.objectContaining({
        code: cleanupFails ? 'ROLLBACK_FAILED' : 'PARTIAL_INSERT_ROLLED_BACK',
        originalError: 'paint rejected',
      }),
    );
    expect(host.created[0]!.removed).toBe(true);
    expect(host.mock.commitUndo).not.toHaveBeenCalled();
  }
});
