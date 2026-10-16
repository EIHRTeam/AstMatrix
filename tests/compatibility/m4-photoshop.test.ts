import { describe, expect, it } from 'vitest';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { PhotoshopAdapter, geometryContours } from '@astmatrix/host-adapter-photoshop-uxp';
import type { InsertOptions } from '@astmatrix/host-contract';
import { profiles } from '@astmatrix/profiles';
import type { PathCommand } from '@astmatrix/vector-ir';
import { mockPhotoshop } from './ps-runtime';
const service = new AstMatrixApplicationService();
const options = (adapter: PhotoshopAdapter): InsertOptions => ({
  documentId: adapter.getSnapshot().documentId!,
  documentRevision: adapter.getSnapshot().revision,
  placement: 'center',
  isCurrent: () => true,
});
async function sample() {
  return (
    await service.generate({
      symbologyId: 'ean13',
      profileId: 'ean13-default',
      fields: profiles[0]!.defaults,
    })
  ).scene;
}
const square = (x: number, y: number, w: number, reverse = false): PathCommand[] => {
  const p = [
    [x, y],
    [x + w, y],
    [x + w, y + w],
    [x, y + w],
  ];
  if (reverse) p.reverse();
  return p
    .map(([x, y], i) => ({ op: i === 0 ? 'M' : 'L', x: x!, y: y! }) as PathCommand)
    .concat({ op: 'Z' });
};
describe('M4 native Photoshop composition (mock contracts, not editable-host acceptance)', () => {
  it.each([
    ['24.0.0', true],
    ['27.8.0', true],
    ['23.5.0', false],
    ['28.0.0', false],
    ['unknown', false],
  ])('uses the injected UXP host version %s for native capabilities', (version, supported) => {
    const env = mockPhotoshop();
    expect(env.ps.app).not.toHaveProperty('version');
    const adapter = new PhotoshopAdapter(env.ps, version);
    expect(adapter.getSnapshot().capabilities.canInsertNativeVector).toBe(supported);
    expect(adapter.getSnapshot().capabilities.canPersistMetadata).toBe(supported);
    adapter.dispose();
  });
  it.each([72, 150, 300])(
    'converts mm using %i DPI and commits one history transaction; preserves existing paths',
    async (dpi) => {
      const env = mockPhotoshop(dpi),
        adapter = new PhotoshopAdapter(env.ps, env.host.version),
        scene = await sample();
      env.paths.set('user path', []);
      const result = await adapter.insert(scene, options(adapter));
      expect(result.documentId).toBe('1');
      expect(env.resumed).toEqual([true]);
      expect([...env.paths.keys()]).toEqual(['user path']);
      const envelope = env.created[0]![0]!.entireSubPath;
      expect(envelope[1]!.anchor[0]! - envelope[0]!.anchor[0]!).toBeCloseTo(
        (scene.widthMm * dpi) / 25.4,
        8,
      );
      expect(envelope[2]!.anchor[1]! - envelope[1]!.anchor[1]!).toBeCloseTo(
        (scene.heightMm * dpi) / 25.4,
        8,
      );
      expect(env.layers[0]!.opacity).toBe(0);
      expect(await adapter.readSelectedMetadata()).toEqual(scene.metadata);
      expect(
        await service.generate(service.restore(await adapter.readSelectedMetadata())),
      ).toMatchObject({ scene });
    },
  );
  it.each(profiles.filter((p) => p.id !== 'qr-mobile'))(
    'preflights $id geometry and creates vector fill layers',
    async (p) => {
      const env = mockPhotoshop(),
        adapter = new PhotoshopAdapter(env.ps, env.host.version);
      const scene = (
        await service.generate({ symbologyId: p.symbologyId, profileId: p.id, fields: p.defaults })
      ).scene;
      await adapter.insert(scene, options(adapter));
      expect(
        env.descriptors.some(
          (d) => d._obj === 'make' && (d.using as { _obj: string })._obj === 'contentLayer',
        ),
      ).toBe(true);
      expect(
        env.created
          .slice(1)
          .flat()
          .every((s) => s.closed),
      ).toBe(true);
      expect(env.descriptors.some((d) => d._obj === 'rasterizeLayer')).toBe(false);
    },
  );
  it('maps curves, ellipses, polygons and nonzero/evenodd nested fills independently', () => {
    const g = {
      kind: 'path' as const,
      commands: [...square(0, 0, 10), ...square(2, 2, 6, true), ...square(4, 4, 2)],
      fillRule: 'nonzero' as const,
    };
    expect(geometryContours(g).map((c) => c.operation)).toEqual(['add', 'subtract', 'add']);
    expect(geometryContours({ ...g, fillRule: 'evenodd' }).map((c) => c.operation)).toEqual([
      'xor',
      'xor',
      'xor',
    ]);
    expect(
      geometryContours({ kind: 'ellipse', cx: 5, cy: 5, rx: 3, ry: 2 })[0]!.points,
    ).toHaveLength(4);
    expect(
      geometryContours({
        kind: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 1, y: 3 },
        ],
        fillRule: 'nonzero',
      })[0]!.points,
    ).toHaveLength(3);
    const curves = geometryContours({
      kind: 'path',
      fillRule: 'nonzero',
      commands: [
        { op: 'M', x: 0, y: 0 },
        { op: 'C', x1: 2, y1: 0, x2: 3, y2: 2, x: 2, y: 2 },
        { op: 'C', x1: 1, y1: 2, x2: 0, y2: 1, x: 0, y: 0 },
        { op: 'Z' },
      ],
    });
    expect(curves[0]!.points[0]!.left).toEqual([0, 1]);
    expect(curves[0]!.points[0]!.right).toEqual([2, 0]);
    expect(curves[0]!.points).toHaveLength(2);
    expect(() =>
      geometryContours({
        kind: 'path',
        fillRule: 'nonzero',
        commands: [...square(0, 0, 10), ...square(5, 5, 10, true)],
      }),
    ).toThrow(/反向/);
  });
  it.each(['make', 'delete'])('rolls back paths/layers on %s failure', async (step) => {
    const env = mockPhotoshop(),
      adapter = new PhotoshopAdapter(env.ps, env.host.version);
    env.fail(step);
    await expect(adapter.insert(await sample(), options(adapter))).rejects.toMatchObject({
      code: 'PARTIAL_INSERT_ROLLED_BACK',
    });
    expect(env.resumed).toEqual([false]);
    expect(env.paths.size).toBe(0);
    expect(env.layers).toHaveLength(0);
  });
  it('reports cleanup failure and rejects truncated metadata rather than committing', async () => {
    const env = mockPhotoshop(),
      adapter = new PhotoshopAdapter(env.ps, env.host.version);
    env.fail('make');
    env.failRollback();
    await expect(adapter.insert(await sample(), options(adapter))).rejects.toMatchObject({
      code: 'ROLLBACK_FAILED',
      cleanupError: 'rollback failure',
    });
    const second = mockPhotoshop(),
      other = new PhotoshopAdapter(second.ps, second.host.version);
    second.truncate();
    await expect(other.insert(await sample(), options(other))).rejects.toMatchObject({
      code: 'PARTIAL_INSERT_ROLLED_BACK',
    });
    expect(second.resumed).toEqual([false]);
  });
  it('rechecks document/DPI and cancellation inside the modal queue and between nodes', async () => {
    const scene = await sample(),
      env = mockPhotoshop(),
      adapter = new PhotoshopAdapter(env.ps, env.host.version),
      initial = options(adapter);
    initial.isCurrent = () => adapter.getSnapshot().revision === initial.documentRevision;
    env.beforeModal(() => {
      env.doc.resolution = 72;
    });
    await expect(adapter.insert(scene, initial)).rejects.toMatchObject({
      code: 'DOCUMENT_CHANGED',
    });
    expect(env.created).toHaveLength(0);
    const second = mockPhotoshop(),
      other = new PhotoshopAdapter(second.ps, second.host.version);
    let current = true;
    second.onPath(() => {
      current = false;
    });
    await expect(
      other.insert(scene, { ...options(other), isCurrent: () => current }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(second.resumed).toEqual([false]);
  });
  it('preflights document mode, canvas and unavailable editable text before mutation', async () => {
    const env = mockPhotoshop(),
      adapter = new PhotoshopAdapter(env.ps, env.host.version),
      scene = await sample();
    env.doc.mode = 'LAB';
    await expect(adapter.insert(scene, options(adapter))).rejects.toMatchObject({
      code: 'UNSUPPORTED_FEATURE',
    });
    env.doc.mode = 'RGB';
    env.doc.width = 1;
    await expect(adapter.insert(scene, options(adapter))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(env.created).toHaveLength(0);
    expect(adapter.getSnapshot().capabilities.supportsEditableText).toBe(false);
  });
  it('rejects duplicate insert, arbitrary descriptors and unknown metadata versions', async () => {
    const env = mockPhotoshop(),
      adapter = new PhotoshopAdapter(env.ps, env.host.version),
      scene = await sample(),
      initial = options(adapter);
    const first = adapter.insert(scene, initial);
    await expect(adapter.insert(scene, initial)).rejects.toMatchObject({ code: 'HOST_BUSY' });
    await first;
    const response = await adapter.dispatch(
      { requestId: 'bad', operation: 'batchPlay', payloadVersion: 1, payload: {} } as never,
      () => true,
    );
    expect(response).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(() => service.restore({ ...scene.metadata, layoutVersion: 'future' })).toThrow(/不同/);
  });
});
