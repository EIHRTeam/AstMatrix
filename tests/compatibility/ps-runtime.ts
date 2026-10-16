import type {
  ModalContext,
  PhotoshopRuntime,
  PsDocument,
  PsLayer,
  PsPoint,
  PsSubpath,
} from '../../packages/host-adapters/photoshop-uxp/src/runtime';
export function mockPhotoshop(dpi = 300) {
  let nextLayer = 10,
    selectedPath = '';
  const paths = new Map<string, PsSubpath[]>(),
    masks = new Map<number, PsSubpath[]>(),
    layers: PsLayer[] = [];
  const created: PsSubpath[][] = [];
  const descriptors: Record<string, unknown>[] = [];
  let failStep = '',
    rollbackFails = false,
    truncated = false,
    beforeModal = () => {},
    onPath = () => {};
  const resumed: boolean[] = [];
  const doc: PsDocument = {
    id: 1,
    width: (200 / 25.4) * dpi,
    height: (150 / 25.4) * dpi,
    resolution: dpi,
    mode: 'RGB',
    activeLayers: [],
    pathItems: {
      add: async (name, subpaths) => {
        paths.set(name, subpaths);
        created.push(subpaths);
        onPath();
      },
    },
    createLayerGroup: async ({ name, fromLayers }) => {
      const group: PsLayer = {
        id: ++nextLayer,
        name: truncated ? name.slice(0, 100) : name,
        opacity: 100,
        boundsNoEffects: { left: 0, top: 0, right: doc.width, bottom: doc.height },
      };
      layers.push(group);
      fromLayers.forEach((l) => {
        l.parent = group;
      });
      doc.activeLayers = [group];
      return group;
    },
  };
  class Point implements PsPoint {
    anchor: number[] = [];
    leftDirection: number[] = [];
    rightDirection: number[] = [];
    kind: unknown;
  }
  class Subpath implements PsSubpath {
    closed = false;
    operation: unknown;
    entireSubPath: PsPoint[] = [];
  }
  const context: ModalContext = {
    isCancelled: false,
    hostControl: {
      suspendHistory: async () => 17,
      resumeHistory: async (_id, commit) => {
        resumed.push(commit);
        if (!commit) {
          if (rollbackFails) throw new Error('rollback failure');
          layers.length = 0;
          masks.clear();
          for (const name of paths.keys())
            if (name.startsWith('AstMatrix-temp')) paths.delete(name);
          doc.activeLayers = [];
        }
      },
    },
  };
  const ps: PhotoshopRuntime = {
    app: {
      documents: [doc],
      activeDocument: doc,
      PathPointInfo: Point,
      SubPathInfo: Subpath,
    },
    constants: {
      PointKind: { CORNERPOINT: 'corner' },
      ShapeOperation: { SHAPEADD: 'add', SHAPESUBTRACT: 'subtract', SHAPEXOR: 'xor' },
      DocumentMode: { RGB: 'RGB', CMYK: 'CMYK' },
    },
    action: {
      batchPlay: async (commands) =>
        commands.map((c) => {
          descriptors.push(c);
          if (c._obj === failStep) return { _obj: 'error', message: 'injected error' };
          const targets = c._target as Array<Record<string, unknown>>;
          const pathTarget = targets?.find((t) => t._ref === 'path'),
            layerTarget = targets?.find((t) => t._ref === 'layer');
          if (c._obj === 'select' && pathTarget) {
            selectedPath = String(pathTarget._name);
            return { _obj: 'select' };
          }
          if (c._obj === 'make' && targets[0]?._ref === 'contentLayer') {
            const l: PsLayer = {
              id: ++nextLayer,
              name: 'new shape',
              opacity: 100,
              boundsNoEffects: { left: 0, top: 0, right: 100, bottom: 100 },
            };
            layers.push(l);
            doc.activeLayers = [l];
            masks.set(l.id, paths.get(selectedPath)!);
            return { _obj: 'make' };
          }
          if (c._obj === 'get' && pathTarget?._value === 'vectorMask')
            return masks.has(Number(layerTarget?._id))
              ? {
                  _obj: 'path',
                  pathContents: { pathComponents: [masks.get(Number(layerTarget?._id))] },
                }
              : { _obj: 'error' };
          if (c._obj === 'get' && pathTarget?._name)
            return paths.has(String(pathTarget._name)) ? { _obj: 'path' } : { _obj: 'error' };
          if (c._obj === 'delete' && pathTarget?._name) {
            paths.delete(String(pathTarget._name));
            return { _obj: 'delete' };
          }
          return { _obj: String(c._obj) };
        }),
    },
    core: {
      executeAsModal: async (callback) => {
        beforeModal();
        return callback(context);
      },
    },
  };
  return {
    host: { version: '27.8.0' },
    ps,
    doc,
    paths,
    layers,
    created,
    resumed,
    descriptors,
    context,
    fail: (step: string) => {
      failStep = step;
    },
    failRollback: () => {
      rollbackFails = true;
    },
    truncate: () => {
      truncated = true;
    },
    beforeModal: (f: () => void) => {
      beforeModal = f;
    },
    onPath: (f: () => void) => {
      onPath = f;
    },
  };
}
