/** Minimal injected Adobe APIs. The bundle retains require('photoshop') in the app entry. */
export interface PsLayer {
  id: number;
  name: string;
  opacity: number;
  parent?: PsLayer;
  boundsNoEffects: { left: number; top: number; right: number; bottom: number };
}
export interface PsPoint {
  anchor: number[];
  leftDirection: number[];
  rightDirection: number[];
  kind: unknown;
}
export interface PsSubpath {
  closed: boolean;
  operation: unknown;
  entireSubPath: PsPoint[];
}
export interface PsDocument {
  id: number;
  width: number;
  height: number;
  resolution: number;
  mode: unknown;
  activeLayers: PsLayer[];
  pathItems: { add: (name: string, paths: PsSubpath[]) => Promise<unknown> };
  createLayerGroup: (options: { name: string; fromLayers: PsLayer[] }) => Promise<PsLayer>;
}
export interface ModalContext {
  isCancelled: boolean;
  hostControl: {
    suspendHistory: (options: { documentID: number; name: string }) => Promise<number>;
    resumeHistory: (id: number, commit: boolean) => Promise<void>;
  };
}
export interface PhotoshopRuntime {
  app: {
    documents: PsDocument[];
    activeDocument: PsDocument;
    PathPointInfo: new () => PsPoint;
    SubPathInfo: new () => PsSubpath;
  };
  constants: {
    PointKind: { CORNERPOINT: unknown };
    ShapeOperation: { SHAPEADD: unknown; SHAPESUBTRACT: unknown; SHAPEXOR: unknown };
    DocumentMode: { RGB: unknown; CMYK: unknown };
  };
  action: {
    batchPlay: (
      commands: Record<string, unknown>[],
      options: Record<string, unknown>,
    ) => Promise<Record<string, unknown>[]>;
    addNotificationListener?: (events: string[], listener: () => void) => Promise<void>;
    removeNotificationListener?: (events: string[], listener: () => void) => Promise<void>;
  };
  core: {
    executeAsModal: <T>(
      callback: (context: ModalContext) => Promise<T>,
      options: { commandName: string },
    ) => Promise<T>;
  };
}
