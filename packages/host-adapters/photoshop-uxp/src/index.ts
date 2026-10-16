/* oxlint-disable no-await-in-loop -- Host mutations are ordered within one modal/history boundary. */
import {
  HostError,
  emptyHostSnapshot,
  validateEnvelope,
  validateMetadata,
} from '@astmatrix/host-contract';
import type {
  HostAdapter,
  HostEnvelope,
  HostResponse,
  InsertOptions,
  InsertResult,
} from '@astmatrix/host-contract';
import { deepFreeze, errorMessage, stableStringify } from '@astmatrix/shared';
import { validateScene } from '@astmatrix/vector-ir';
import type { Color, VectorScene } from '@astmatrix/vector-ir';
import { geometryContours } from './shape';
import type { Contour } from './shape';
import type { ModalContext, PhotoshopRuntime, PsDocument, PsLayer } from './runtime';
export type { PhotoshopRuntime } from './runtime';
export { geometryContours } from './shape';
const PREFIX = 'AstMatrix v1 ';
const EVENTS = ['open', 'close', 'select', 'make', 'set', 'delete'];
export class PhotoshopAdapter implements HostAdapter {
  readonly id = 'photoshop-uxp';
  private readonly ps: PhotoshopRuntime;
  private readonly hostVersion: string;
  private snapshot = emptyHostSnapshot();
  private key = '';
  private listeners = new Set<() => void>();
  private busy = false;
  private disposed = false;
  private sequence = 0;
  constructor(ps: PhotoshopRuntime, hostVersion: string) {
    this.ps = ps;
    this.hostVersion = hostVersion;
    this.refresh();
  }
  getSnapshot = () => {
    this.refresh();
    return this.snapshot;
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  refresh = () => {
    const doc = this.ps.app.documents.length ? this.ps.app.activeDocument : null;
    const supported =
      Number.parseInt(this.hostVersion, 10) >= 24 &&
      Number.parseInt(this.hostVersion, 10) <= 27 &&
      typeof this.ps.app.PathPointInfo === 'function' &&
      typeof this.ps.app.SubPathInfo === 'function';
    const mode =
      !!doc &&
      (doc.mode === this.ps.constants.DocumentMode.RGB ||
        doc.mode === this.ps.constants.DocumentMode.CMYK);
    const key = `${doc?.id ?? ''}/${doc?.resolution}/${doc?.width}/${doc?.height}/${String(doc?.mode)}/${supported}`;
    if (key === this.key || this.disposed) return;
    this.key = key;
    this.snapshot = deepFreeze({
      documentId: doc ? String(doc.id) : null,
      revision: this.snapshot.revision + 1,
      capabilities: {
        documentOpen: !!doc,
        canInsertNativeVector: supported && mode,
        canUpdatePlacedObject: false,
        canPersistMetadata: supported,
        supportsEditableText: false,
        supportsCompoundShapes: true,
      },
    });
    this.listeners.forEach((l) => l());
  };
  async start(): Promise<void> {
    await this.ps.action.addNotificationListener?.(EVENTS, this.refresh);
  }
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    void this.ps.action.removeNotificationListener?.(EVENTS, this.refresh);
  }
  private guard(options: InsertOptions, context?: ModalContext): PsDocument {
    if (this.disposed || context?.isCancelled)
      throw new HostError('CANCELLED', '插入已取消或输入已变化');
    const current = this.getSnapshot();
    if (!current.documentId) throw new HostError('NO_DOCUMENT', '请先打开文档');
    if (current.documentId !== options.documentId || current.revision !== options.documentRevision)
      throw new HostError('DOCUMENT_CHANGED', '文档、尺寸或 DPI 已变化');
    if (!options.isCurrent()) throw new HostError('CANCELLED', '输入已变化');
    if (!current.capabilities.canInsertNativeVector)
      throw new HostError(
        'UNSUPPORTED_FEATURE',
        '当前版本或文档模式不支持 Shape Layer（仅 RGB / CMYK）',
      );
    return this.ps.app.activeDocument;
  }
  private async batch(
    commands: Record<string, unknown>[],
    allowMissing = false,
  ): Promise<Record<string, unknown>[]> {
    const result = await this.ps.action.batchPlay(
      commands.map((c) => ({ ...c, _options: { dialogOptions: 'dontDisplay' } })),
      {},
    );
    const failure = result.find((r) => r._obj === 'error');
    if (!allowMissing && failure?.result === -128)
      throw new HostError('CANCELLED', 'Photoshop 操作已取消');
    if (!result.length || (failure && !allowMissing))
      throw new HostError('UNKNOWN_HOST_ERROR', `Photoshop 操作失败：${stableStringify(result)}`);
    return result;
  }
  private async shape(
    doc: PsDocument,
    name: string,
    contours: Contour[],
    fill: Color,
    offset: { x: number; y: number },
    transparent = false,
  ): Promise<PsLayer> {
    const factor = doc.resolution / 25.4,
      operations = this.ps.constants.ShapeOperation;
    const convert = (p: number[]) => [(p[0]! + offset.x) * factor, (p[1]! + offset.y) * factor];
    const paths = contours.map((c) => {
      const path = new this.ps.app.SubPathInfo();
      path.closed = true;
      path.operation =
        c.operation === 'xor'
          ? operations.SHAPEXOR
          : c.operation === 'subtract'
            ? operations.SHAPESUBTRACT
            : operations.SHAPEADD;
      path.entireSubPath = c.points.map((v) => {
        const p = new this.ps.app.PathPointInfo();
        p.anchor = convert(v.anchor);
        p.leftDirection = convert(v.left);
        p.rightDirection = convert(v.right);
        p.kind = this.ps.constants.PointKind.CORNERPOINT;
        return p;
      });
      return path;
    });
    const pathName = `AstMatrix-temp-${Date.now()}-${++this.sequence}`;
    await doc.pathItems.add(pathName, paths);
    const pathTarget = [
      { _ref: 'path', _name: pathName },
      { _ref: 'document', _id: doc.id },
    ];
    await this.batch([{ _obj: 'select', _target: pathTarget }]);
    const color =
      fill.space === 'RGB'
        ? {
            _obj: 'RGBColor',
            red: parseInt(fill.hex.slice(0, 2), 16),
            grain: parseInt(fill.hex.slice(2, 4), 16),
            blue: parseInt(fill.hex.slice(4, 6), 16),
          }
        : { _obj: 'CMYKColor', cyan: fill.c, magenta: fill.m, yellowColor: fill.y, black: fill.k };
    await this.batch([
      {
        _obj: 'make',
        _target: [{ _ref: 'contentLayer' }],
        using: { _obj: 'contentLayer', type: { _obj: 'solidColorLayer', color } },
      },
    ]);
    const layer = doc.activeLayers[0];
    if (!layer) throw new HostError('UNKNOWN_HOST_ERROR', 'Shape Layer 未创建');
    const maskTarget = [
      { _ref: 'path', _enum: 'path', _value: 'vectorMask' },
      { _ref: 'layer', _id: layer.id },
      { _ref: 'document', _id: doc.id },
    ];
    const [mask] = await this.batch([{ _obj: 'get', _target: maskTarget }], true);
    if (mask!._obj === 'error')
      await this.batch([
        {
          _obj: 'make',
          _target: [
            { _ref: 'path' },
            { _ref: 'layer', _id: layer.id },
            { _ref: 'document', _id: doc.id },
          ],
          at: { _ref: 'path', _enum: 'path', _value: 'vectorMask' },
          using: { _ref: 'path', _name: pathName },
        },
      ]);
    const [remaining] = await this.batch([{ _obj: 'get', _target: pathTarget }], true);
    if (remaining!._obj !== 'error') await this.batch([{ _obj: 'delete', _target: pathTarget }]);
    const [finalMask] = await this.batch([{ _obj: 'get', _target: maskTarget }]);
    const contents = finalMask!.pathContents as { pathComponents?: unknown[] } | undefined;
    if (!contents?.pathComponents?.length)
      throw new HostError('UNKNOWN_HOST_ERROR', 'Shape 缺少矢量路径');
    layer.name = name;
    if (transparent) layer.opacity = 0;
    if (transparent && layer.opacity !== 0)
      throw new HostError('UNKNOWN_HOST_ERROR', '静区包络透明度设置失败');
    return layer;
  }
  async insert(scene: VectorScene, options: InsertOptions): Promise<InsertResult> {
    if (this.busy) throw new HostError('HOST_BUSY', '已有插入任务');
    validateScene(scene);
    validateMetadata(scene.metadata);
    const stored = PREFIX + stableStringify(scene.metadata);
    if (stored.length > 65536) throw new HostError('INVALID_INPUT', '参数超过 64 KiB 存储上限');
    // Geometry preflight happens before any document mutation.
    const nodes = scene.nodes
      .filter((n) => n.role !== 'quiet-zone')
      .map((n) => ({
        name: n.id,
        contours: geometryContours(n.geometry),
        fill: n.fill ?? scene.foreground,
      }));
    if (nodes.length > 512 || nodes.reduce((sum, n) => sum + n.contours.length, 0) > 20000)
      throw new HostError(
        'UNSUPPORTED_FEATURE',
        'Scene 超过开发预算（512 图层 / 20000 子路径）；请启用合并路径',
      );
    const initial = this.guard(options),
      selected = initial.activeLayers.map((l) => l.id).join(',');
    this.busy = true;
    try {
      return await this.ps.core.executeAsModal(
        async (context) => {
          const doc = this.guard(options, context),
            dpi = doc.resolution;
          if (!Number.isFinite(dpi) || dpi <= 0)
            throw new HostError('INVALID_INPUT', '无效文档 DPI');
          const factor = dpi / 25.4;
          let offset = {
            x: (doc.width / factor - scene.widthMm) / 2,
            y: (doc.height / factor - scene.heightMm) / 2,
          };
          if (options.placement === 'selection') {
            if (doc.activeLayers.map((l) => l.id).join(',') !== selected)
              throw new HostError('DOCUMENT_CHANGED', '定位选择已变化');
            if (!doc.activeLayers.length) throw new HostError('INVALID_INPUT', '请先选择定位图层');
            const bounds = doc.activeLayers.map((l) => l.boundsNoEffects);
            offset = {
              x:
                (Math.min(...bounds.map((b) => b.left)) + Math.max(...bounds.map((b) => b.right))) /
                  2 /
                  factor -
                scene.widthMm / 2,
              y:
                (Math.min(...bounds.map((b) => b.top)) + Math.max(...bounds.map((b) => b.bottom))) /
                  2 /
                  factor -
                scene.heightMm / 2,
            };
          }
          if (
            !Number.isFinite(offset.x) ||
            !Number.isFinite(offset.y) ||
            offset.x < 0 ||
            offset.y < 0 ||
            (offset.x + scene.widthMm) * factor > doc.width ||
            (offset.y + scene.heightMm) * factor > doc.height
          )
            throw new HostError('INVALID_INPUT', '包含静区的条码尺寸超出文档画布');
          const suspension = await context.hostControl.suspendHistory({
            documentID: doc.id,
            name: 'AstMatrix 插入条码',
          });
          let committed = false;
          try {
            const layers: PsLayer[] = [];
            // Envelope exists even for transparent backgrounds; never substitutes for visible bars.
            const envelope = geometryContours({
              kind: 'rect',
              x: 0,
              y: 0,
              w: scene.widthMm,
              h: scene.heightMm,
            });
            layers.push(
              await this.shape(
                doc,
                'AstMatrix quiet-zone envelope',
                envelope,
                scene.background ?? scene.foreground,
                offset,
                !scene.background,
              ),
            );
            for (const node of nodes) {
              this.guard(options, context);
              layers.push(await this.shape(doc, node.name, node.contours, node.fill, offset));
            }
            this.guard(options, context);
            const group = await doc.createLayerGroup({ name: stored, fromLayers: layers });
            if (group.name !== stored)
              throw new HostError('UNKNOWN_HOST_ERROR', 'Photoshop 截断恢复参数，插入已取消');
            await this.batch([
              {
                _obj: 'select',
                _target: [
                  { _ref: 'layer', _id: group.id },
                  { _ref: 'document', _id: doc.id },
                ],
              },
            ]);
            this.guard(options, context);
            await context.hostControl.resumeHistory(suspension, true);
            committed = true;
            return { objectId: String(group.id), documentId: String(doc.id) };
          } catch (error) {
            if (!committed) {
              try {
                await context.hostControl.resumeHistory(suspension, false);
              } catch (cleanup) {
                throw new HostError('ROLLBACK_FAILED', '插入失败且历史回滚失败', {
                  originalError: errorMessage(error),
                  cleanupError: errorMessage(cleanup),
                });
              }
              if (
                error instanceof HostError &&
                ['CANCELLED', 'DOCUMENT_CHANGED'].includes(error.code)
              )
                throw error;
              throw new HostError('PARTIAL_INSERT_ROLLED_BACK', '插入失败，已回滚本次历史', {
                originalError: errorMessage(error),
              });
            }
            throw error;
          }
        },
        { commandName: 'AstMatrix 插入原生矢量' },
      );
    } catch (error) {
      if (error instanceof HostError) throw error;
      const number = (error as { number?: number })?.number;
      throw new HostError(
        number === 9 ? 'HOST_BUSY' : number === -128 ? 'CANCELLED' : 'UNKNOWN_HOST_ERROR',
        errorMessage(error),
      );
    } finally {
      this.busy = false;
    }
  }
  async readSelectedMetadata(): Promise<VectorScene['metadata'] | null> {
    if (!this.ps.app.documents.length) throw new HostError('NO_DOCUMENT', '请先打开文档');
    const doc = this.ps.app.activeDocument;
    if (doc.activeLayers.length !== 1) return null;
    let layer: PsLayer | undefined = doc.activeLayers[0];
    while (layer) {
      if (layer.name.startsWith(PREFIX)) {
        const value: unknown = JSON.parse(layer.name.slice(PREFIX.length));
        validateMetadata(value);
        return value;
      }
      layer = layer.parent;
    }
    return null;
  }
  async dispatch(envelope: HostEnvelope, isCurrent: () => boolean): Promise<HostResponse<unknown>> {
    try {
      validateEnvelope(envelope);
      let result: unknown;
      if (envelope.operation === 'capabilities') result = this.getSnapshot();
      else if (envelope.operation === 'readSelectedMetadata')
        result = await this.readSelectedMetadata();
      else if (envelope.operation === 'insert')
        result = await this.insert(envelope.payload.scene as unknown as VectorScene, {
          documentId: String(envelope.payload.documentId),
          documentRevision: Number(envelope.payload.documentRevision),
          placement: envelope.payload.placement as InsertOptions['placement'],
          isCurrent,
        });
      else throw new HostError('UNSUPPORTED_FEATURE', '暂不支持替换已有对象；请读取参数后重新插入');
      return { requestId: envelope.requestId, ok: true, result };
    } catch (error) {
      const e =
        error instanceof HostError
          ? error
          : new HostError('UNKNOWN_HOST_ERROR', errorMessage(error));
      return {
        requestId: envelope.requestId,
        ok: false,
        error: {
          code: e.code,
          message: e.message,
          ...(e.originalError ? { originalError: e.originalError } : {}),
          ...(e.cleanupError ? { cleanupError: e.cleanupError } : {}),
        },
      };
    }
  }
}
