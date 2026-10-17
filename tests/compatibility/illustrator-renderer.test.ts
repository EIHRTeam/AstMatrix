import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { profiles } from '@astmatrix/profiles';
import type { VectorScene } from '@astmatrix/vector-ir';
const source = ['json.jsx', 'renderer.jsx', 'astmatrix.jsx']
  .map((f) => readFileSync('apps/illustrator-cep/jsx/' + f, 'utf8'))
  .join('\n');
function mockIllustrator() {
  const shapes: Array<{ kind: string; args: number[]; evenodd?: boolean }> = [],
    groups: Array<Record<string, unknown>> = [];
  const rectangles: number[][] = [];
  let fail = false,
    cleanupFail = false;
  const path = () => {
    const points: Array<Record<string, unknown>> = [];
    const p = {
      pathPoints: Object.assign(points, {
        add: () => {
          const v: Record<string, unknown> = {};
          v.remove = () => {
            points.splice(points.indexOf(v), 1);
          };
          points.push(v);
          return v;
        },
      }),
      setEntirePath: () => {},
      closed: false,
    };
    return p;
  };
  const pathItems = {
    rectangle: (...args: number[]) => {
      if (fail) throw new Error('injected create');
      rectangles.push(args);
      return path();
    },
    ellipse: (...args: number[]) => {
      shapes.push({ kind: 'ellipse', args });
      return path();
    },
    add: path,
  };
  const doc = {
    selection: [] as unknown[],
    activeLayer: {
      locked: false,
      visible: true,
      groupItems: {
        add: () => {
          const group: Record<string, unknown> = {
            note: '',
            name: '',
            pathItems,
            compoundPathItems: { add: () => ({ pathItems: { add: path } }) },
            textFrames: { add: () => ({ textRange: { characterAttributes: {} } }) },
            remove: () => {
              if (cleanupFail) throw new Error('injected cleanup');
              groups.splice(groups.indexOf(group), 1);
            },
          };
          groups.push(group);
          return group;
        },
      },
    },
    artboards: Object.assign([{ artboardRect: [100, 500, 600, 0] }], {
      getActiveArtboardIndex: () => 0,
    }),
  };
  const app = {
    documents: [doc],
    activeDocument: doc,
    coordinateSystem: 'original',
    redraw: () => {},
    textFonts: { getByName: () => ({}) },
    convertSampleColor: () => [0, 0, 0, 100],
  };
  const context = vm.createContext({
    $: {},
    app,
    RGBColor: class {},
    CMYKColor: class {},
    PointType: { CORNER: 'corner' },
    CoordinateSystem: { DOCUMENTCOORDINATESYSTEM: 'document' },
    DocumentColorSpace: { RGB: 'RGB' },
    ImageColorSpace: { RGB: 'RGB', CMYK: 'CMYK' },
    ColorConvertPurpose: { defaultpurpose: 'default' },
  });
  vm.runInContext(source, context);
  const snapshot = () =>
    JSON.parse(
      String(vm.runInContext('$._astmatrix.json.stringify($._astmatrix.snapshot())', context)),
    ) as { documentId: string; revision: number };
  const insert = (scene: VectorScene) => {
    context.input = JSON.stringify({
      requestId: 'render-1',
      operation: 'insert',
      payloadVersion: 1,
      payload: {
        scene,
        documentId: snapshot().documentId,
        documentRevision: snapshot().revision,
        placement: 'center',
      },
    });
    return JSON.parse(
      String(vm.runInContext('$._astmatrix.dispatch($._astmatrix.json.parse(input))', context)),
    ) as { ok: boolean; result: { objectId: string }; error: { code: string } };
  };
  return {
    doc,
    app,
    context,
    groups,
    rectangles,
    insert,
    fail: () => {
      fail = true;
    },
    failCleanup: () => {
      cleanupFail = true;
    },
  };
}
it.each(profiles.filter((p) => p.id !== 'qr-mobile'))(
  'Illustrator inserts $id production Scene natively at absolute artboard center and reads exact metadata',
  async (p) => {
    const { scene } = await new AstMatrixApplicationService().generate({
      symbologyId: p.symbologyId,
      profileId: p.id,
      fields: p.defaults,
    });
    const env = mockIllustrator(),
      result = env.insert(scene);
    expect(result.ok).toBe(true);
    expect(env.groups).toHaveLength(1);
    const pt = 72 / 25.4;
    expect(env.rectangles[0]).toEqual([
      250 + (scene.heightMm * pt) / 2,
      350 - (scene.widthMm * pt) / 2,
      scene.widthMm * pt,
      scene.heightMm * pt,
    ]);
    expect(env.app.coordinateSystem).toBe('original');
    expect(JSON.parse(String(env.groups[0]!.note)).metadata).toEqual(scene.metadata);
    env.doc.selection = [{ note: env.groups[0]!.note }];
    expect(
      JSON.parse(
        String(
          vm.runInContext(
            "$._astmatrix.dispatch({requestId:'read-1',operation:'readSelectedMetadata',payloadVersion:1,payload:{}})",
            env.context,
          ),
        ),
      ),
    ).toMatchObject({ ok: true, result: scene.metadata });
  },
);
it('Illustrator validates geometry before mutation and reports cleanup failures honestly', async () => {
  const { scene } = await new AstMatrixApplicationService().generate({
    symbologyId: 'ean13',
    profileId: 'ean13-default',
    fields: profiles[0]!.defaults,
  });
  const env = mockIllustrator();
  expect(
    env.insert({
      ...scene,
      nodes: [{ id: 'bad', role: 'bars', geometry: { kind: 'rect', x: -10, y: 0, w: 1, h: 1 } }],
    }),
  ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  expect(env.groups).toHaveLength(0);
  env.fail();
  expect(env.insert(scene)).toMatchObject({
    ok: false,
    error: { code: 'PARTIAL_INSERT_ROLLED_BACK' },
  });
  expect(env.groups).toHaveLength(0);
  expect(env.app.coordinateSystem).toBe('original');
  env.failCleanup();
  expect(env.insert(scene)).toMatchObject({ ok: false, error: { code: 'ROLLBACK_FAILED' } });
});
