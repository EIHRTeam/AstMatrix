import { AstMatrixError, deepFreeze, errorMessage, stableStringify } from '@astmatrix/shared';
import { validateScene } from '@astmatrix/vector-ir';
import type { VectorScene } from '@astmatrix/vector-ir';
export const HOST_PROTOCOL_VERSION = 1;
export type HostErrorCode =
  | 'NO_DOCUMENT'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_FEATURE'
  | 'UNSUPPORTED_HOST_VERSION'
  | 'HOST_BUSY'
  | 'PERMISSION_DENIED'
  | 'PARTIAL_INSERT_ROLLED_BACK'
  | 'ROLLBACK_FAILED'
  | 'CANCELLED'
  | 'DOCUMENT_CHANGED'
  | 'UNKNOWN_HOST_ERROR';
export class HostError extends AstMatrixError {
  readonly originalError?: string;
  readonly cleanupError?: string;
  constructor(
    code: HostErrorCode,
    message: string,
    details: { originalError?: string; cleanupError?: string } = {},
  ) {
    super(code, message, 'host');
    this.originalError = details.originalError;
    this.cleanupError = details.cleanupError;
  }
}
export interface HostCapabilities {
  documentOpen: boolean;
  canInsertNativeVector: boolean;
  canUpdatePlacedObject: boolean;
  canPersistMetadata: boolean;
  supportsEditableText: boolean;
  supportsCompoundShapes: boolean;
}
export interface HostSnapshot {
  documentId: string | null;
  revision: number;
  capabilities: HostCapabilities;
}
export interface InsertOptions {
  documentId: string;
  documentRevision: number;
  placement: 'center' | 'selection';
  /** Adapter must check immediately before any mutation, including inside a modal queue. */
  isCurrent: () => boolean;
  /** Push invalidation across asynchronous UI/host bridges without waiting for polling. */
  subscribeCurrent?: (listener: () => void) => () => void;
}
export interface InsertResult {
  objectId: string;
  documentId: string;
}
export interface HostAdapter {
  readonly id: string;
  getSnapshot: () => HostSnapshot;
  subscribe: (listener: () => void) => () => void;
  insert: (scene: VectorScene, options: InsertOptions) => Promise<InsertResult>;
  update?: (objectId: string, scene: VectorScene, options: InsertOptions) => Promise<void>;
  readSelectedMetadata: () => Promise<VectorScene['metadata'] | null>;
}
export function insertionReason(snapshot: HostSnapshot, scene?: VectorScene): string | null {
  if (!snapshot.documentId || !snapshot.capabilities.documentOpen) return '请先打开文档';
  if (!snapshot.capabilities.canInsertNativeVector) return '当前宿主不支持原生矢量插入';
  if (
    scene &&
    !snapshot.capabilities.supportsCompoundShapes &&
    scene.nodes.some((n) => n.geometry.kind === 'path')
  )
    return '当前宿主不支持复合路径';
  if (
    scene &&
    !snapshot.capabilities.supportsEditableText &&
    scene.nodes.some((n) => n.geometry.kind === 'text')
  )
    return '当前宿主不支持可编辑文本';
  if (scene && !snapshot.capabilities.canPersistMetadata) return '当前宿主无法保存可恢复参数';
  return null;
}
export async function updatePlacedObject(
  adapter: HostAdapter,
  id: string,
  scene: VectorScene,
  options: InsertOptions,
): Promise<void> {
  if (!adapter.getSnapshot().capabilities.canUpdatePlacedObject || !adapter.update)
    throw new HostError('UNSUPPORTED_FEATURE', '当前宿主不支持更新对象');
  validateScene(scene);
  await adapter.update(id, scene, options);
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
export type HostOperation = 'capabilities' | 'insert' | 'update' | 'readSelectedMetadata';
export interface HostEnvelope {
  requestId: string;
  operation: HostOperation;
  payloadVersion: 1;
  payload: Record<string, unknown>;
}
export type HostResponse<T> =
  | { requestId: string; ok: true; result: T }
  | {
      requestId: string;
      ok: false;
      error: { code: string; message: string; originalError?: string; cleanupError?: string };
    };
export function validateMetadata(value: unknown): asserts value is VectorScene['metadata'] {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !identifier(value.symbologyId) ||
    !identifier(value.profileId) ||
    typeof value.sourceValue !== 'string' ||
    !isRecord(value.options) ||
    !identifier(value.engineVersion) ||
    !identifier(value.layoutVersion) ||
    !isRecord(value.request) ||
    value.request.symbologyId !== value.symbologyId ||
    value.request.profileId !== value.profileId ||
    !isRecord(value.request.fields) ||
    !isRecord(value.style) ||
    !isRecord(value.dimensions)
  )
    throw new HostError('INVALID_INPUT', '无效或不完整的可恢复参数');
  const dimensions = value.dimensions,
    style = value.style;
  if (
    typeof dimensions.moduleMm !== 'number' ||
    !Number.isFinite(dimensions.moduleMm) ||
    dimensions.moduleMm <= 0 ||
    typeof dimensions.heightMm !== 'number' ||
    !Number.isFinite(dimensions.heightMm) ||
    dimensions.heightMm < 0 ||
    typeof style.foreground !== 'string' ||
    !/^[0-9a-fA-F]{6}$/.test(style.foreground) ||
    typeof style.background !== 'string' ||
    (style.background !== 'transparent' && !/^[0-9a-fA-F]{6}$/.test(style.background)) ||
    typeof style.hri !== 'boolean' ||
    style.font !== 'OCR-B'
  )
    throw new HostError('INVALID_INPUT', '无效尺寸或样式元数据');
  stableStringify(value);
}
export function validateEnvelope(value: unknown): asserts value is HostEnvelope {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (k) => !['requestId', 'operation', 'payloadVersion', 'payload'].includes(k),
    ) ||
    !identifier(value.requestId) ||
    value.payloadVersion !== HOST_PROTOCOL_VERSION ||
    !['capabilities', 'insert', 'update', 'readSelectedMetadata'].includes(
      String(value.operation),
    ) ||
    !isRecord(value.payload)
  )
    throw new HostError('INVALID_INPUT', '无效请求信封或操作');
  const payload = value.payload;
  if (value.operation === 'insert' || value.operation === 'update') {
    const keys =
      value.operation === 'update'
        ? ['scene', 'documentId', 'documentRevision', 'placement', 'objectId']
        : ['scene', 'documentId', 'documentRevision', 'placement'];
    if (
      Object.keys(payload).some((k) => !keys.includes(k)) ||
      !identifier(payload.documentId) ||
      !Number.isSafeInteger(payload.documentRevision) ||
      Number(payload.documentRevision) < 0 ||
      !['center', 'selection'].includes(String(payload.placement)) ||
      !isRecord(payload.scene) ||
      (value.operation === 'update' && !identifier(payload.objectId))
    )
      throw new HostError('INVALID_INPUT', '无效插入参数');
    try {
      validateScene(payload.scene as unknown as VectorScene);
      validateMetadata(payload.scene.metadata);
    } catch (error) {
      throw new HostError('INVALID_INPUT', errorMessage(error));
    }
  } else if (Object.keys(payload).length) throw new HostError('INVALID_INPUT', '该操作不接受参数');
}
export const HOST_ERROR_CODES: readonly HostErrorCode[] = [
  'NO_DOCUMENT',
  'INVALID_INPUT',
  'UNSUPPORTED_FEATURE',
  'UNSUPPORTED_HOST_VERSION',
  'HOST_BUSY',
  'PERMISSION_DENIED',
  'PARTIAL_INSERT_ROLLED_BACK',
  'ROLLBACK_FAILED',
  'CANCELLED',
  'DOCUMENT_CHANGED',
  'UNKNOWN_HOST_ERROR',
];
export function validateResponse<T>(value: unknown, requestId: string): HostResponse<T> {
  if (!isRecord(value) || value.requestId !== requestId || typeof value.ok !== 'boolean')
    throw new HostError('INVALID_INPUT', '宿主回包 requestId 不匹配或结构无效');
  if (value.ok) {
    if (
      !('result' in value) ||
      Object.keys(value).some((k) => !['requestId', 'ok', 'result'].includes(k))
    )
      throw new HostError('INVALID_INPUT', '无效成功回包');
  } else if (
    !isRecord(value.error) ||
    !HOST_ERROR_CODES.includes(value.error.code as HostErrorCode) ||
    typeof value.error.message !== 'string' ||
    Object.keys(value).some((k) => !['requestId', 'ok', 'error'].includes(k)) ||
    Object.keys(value.error).some(
      (k) => !['code', 'message', 'originalError', 'cleanupError'].includes(k),
    ) ||
    ['originalError', 'cleanupError'].some(
      (k) =>
        k in (value.error as Record<string, unknown>) &&
        typeof (value.error as Record<string, unknown>)[k] !== 'string',
    )
  )
    throw new HostError('INVALID_INPUT', '无效错误回包');
  stableStringify(value);
  return value as HostResponse<T>;
}
export type FakeFailure =
  | 'none'
  | 'provider-independent-host'
  | 'partial-rollback'
  | 'rollback-failed';
/** Development adapter. Guards the document and current request at the actual commit point. */
export class FakeHostAdapter implements HostAdapter {
  readonly id = 'development-fake';
  constructor() {
    deepFreeze(this.snapshot);
  }
  private snapshot: HostSnapshot = {
    documentId: 'demo-document',
    revision: 0,
    capabilities: {
      documentOpen: true,
      canInsertNativeVector: true,
      canUpdatePlacedObject: false,
      canPersistMetadata: true,
      supportsEditableText: false,
      supportsCompoundShapes: true,
    },
  };
  private listeners = new Set<() => void>();
  readonly objects = new Map<string, { documentId: string; scene: VectorScene }>();
  failure: FakeFailure = 'none';
  waitBeforeCommit: () => Promise<void> = () => Promise.resolve();
  private sequence = 0;
  insertCalls = 0;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setDocument(documentId: string | null): void {
    if (documentId !== null && !identifier(documentId))
      throw new HostError('INVALID_INPUT', '无效文档标识');
    this.snapshot = {
      ...this.snapshot,
      documentId,
      revision: this.snapshot.revision + 1,
      capabilities: { ...this.snapshot.capabilities, documentOpen: !!documentId },
    };
    deepFreeze(this.snapshot);
    this.listeners.forEach((l) => l());
  }
  setCapabilities(capabilities: Partial<HostCapabilities>): void {
    this.snapshot = {
      ...this.snapshot,
      revision: this.snapshot.revision + 1,
      capabilities: { ...this.snapshot.capabilities, ...capabilities },
    };
    deepFreeze(this.snapshot);
    this.listeners.forEach((l) => l());
  }
  async insert(scene: VectorScene, options: InsertOptions): Promise<InsertResult> {
    this.insertCalls++;
    validateScene(scene);
    validateMetadata(scene.metadata);
    await this.waitBeforeCommit();
    if (
      this.snapshot.documentId !== options.documentId ||
      this.snapshot.revision !== options.documentRevision
    )
      throw new HostError('DOCUMENT_CHANGED', '文档已切换或关闭，请在当前文档重试');
    if (!options.isCurrent()) throw new HostError('CANCELLED', '输入已变化，已取消插入');
    const reason = insertionReason(this.snapshot, scene);
    if (reason)
      throw new HostError(this.snapshot.documentId ? 'UNSUPPORTED_FEATURE' : 'NO_DOCUMENT', reason);
    if (this.failure === 'provider-independent-host')
      throw new HostError('PERMISSION_DENIED', '模拟宿主拒绝写入');
    const objectId = `fake-object-${++this.sequence}`;
    this.objects.set(objectId, { documentId: options.documentId, scene });
    if (this.failure === 'partial-rollback' || this.failure === 'rollback-failed') {
      const originalError = '模拟创建图元中途失败';
      if (this.failure === 'rollback-failed')
        throw new HostError('ROLLBACK_FAILED', '插入失败，清理也失败；文档中可能残留对象', {
          originalError,
          cleanupError: '模拟删除对象失败',
        });
      this.objects.delete(objectId);
      throw new HostError('PARTIAL_INSERT_ROLLED_BACK', '插入失败，已清理本次对象', {
        originalError,
      });
    }
    return { objectId, documentId: options.documentId };
  }
  async readSelectedMetadata(): Promise<VectorScene['metadata'] | null> {
    const objects = [...this.objects.values()].filter(
      (o) => o.documentId === this.snapshot.documentId,
    );
    return objects[objects.length - 1]?.scene.metadata ?? null;
  }
}
