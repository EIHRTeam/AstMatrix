import { HostError, validateEnvelope, validateMetadata, validateResponse } from './contracts';
import type {
  HostAdapter,
  HostEnvelope,
  HostSnapshot,
  InsertOptions,
  InsertResult,
  HostErrorCode,
} from './contracts';
import { deepFreeze, stableStringify } from '@astmatrix/shared';
import type { VectorScene } from '@astmatrix/vector-ir';
export interface HostTransport {
  request: (
    envelope: HostEnvelope,
    isCurrent?: () => boolean,
    subscribeCurrent?: (listener: () => void) => () => void,
  ) => Promise<unknown>;
  dispose?: () => void;
}
export const emptyHostSnapshot = (): HostSnapshot =>
  deepFreeze({
    documentId: null,
    revision: 0,
    capabilities: {
      documentOpen: false,
      canInsertNativeVector: false,
      canUpdatePlacedObject: false,
      canPersistMetadata: false,
      supportsEditableText: false,
      supportsCompoundShapes: false,
    },
  });
export function validateSnapshot(value: unknown): HostSnapshot {
  const s = value as HostSnapshot;
  if (
    !s ||
    (s.documentId !== null && (typeof s.documentId !== 'string' || !s.documentId)) ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    !s.capabilities ||
    Object.keys(emptyHostSnapshot().capabilities).some(
      (k) => typeof s.capabilities[k as keyof HostSnapshot['capabilities']] !== 'boolean',
    ) ||
    s.capabilities.documentOpen !== !!s.documentId
  )
    throw new HostError('INVALID_INPUT', '无效宿主状态');
  stableStringify(s);
  return deepFreeze(s);
}
/** Read-only refreshes and mutations use the same versioned, validated protocol. */
export class RemoteHostAdapter implements HostAdapter {
  readonly id: string;
  private readonly transport: HostTransport;
  private snapshot = emptyHostSnapshot();
  private listeners = new Set<() => void>();
  private sequence = 0;
  private disposed = false;
  private busy = false;
  private refreshing: Promise<void> | null = null;
  readonly session = Date.now().toString(36) + Math.random().toString(36).slice(2);
  constructor(id: string, transport: HostTransport) {
    this.id = id;
    this.transport = transport;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private async call<T>(
    operation: HostEnvelope['operation'],
    payload: HostEnvelope['payload'],
    isCurrent?: () => boolean,
    subscribeCurrent?: (listener: () => void) => () => void,
  ): Promise<T> {
    if (this.disposed) throw new HostError('CANCELLED', '面板已关闭');
    const envelope: HostEnvelope = {
      requestId: `${this.session}-${++this.sequence}`,
      operation,
      payloadVersion: 1,
      payload,
    };
    validateEnvelope(envelope);
    const response = validateResponse<T>(
      await this.transport.request(envelope, isCurrent, subscribeCurrent),
      envelope.requestId,
    );
    if (!response.ok)
      throw new HostError(
        response.error.code as HostErrorCode,
        response.error.message,
        response.error,
      );
    return response.result;
  }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const run = async () => {
      const previous = this.snapshot;
      const next = validateSnapshot(await this.call<unknown>('capabilities', {}));
      // An unsolicited host event may have delivered a newer snapshot while awaiting RPC.
      if (this.snapshot === previous) this.acceptSnapshot(next);
    };
    this.refreshing = run().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
  protected acceptSnapshot(value: unknown): void {
    const next = validateSnapshot(value);
    if (!this.disposed && stableStringify(next) !== stableStringify(this.snapshot)) {
      this.snapshot = next;
      this.listeners.forEach((l) => l());
    }
  }
  async insert(scene: VectorScene, options: InsertOptions): Promise<InsertResult> {
    if (this.busy) throw new HostError('HOST_BUSY', '已有插入任务');
    this.busy = true;
    try {
      await this.refresh();
      if (
        this.snapshot.documentId !== options.documentId ||
        this.snapshot.revision !== options.documentRevision
      )
        throw new HostError('DOCUMENT_CHANGED', '文档已变化');
      if (!options.isCurrent()) throw new HostError('CANCELLED', '输入已变化');
      const result = await this.call<InsertResult>(
        'insert',
        {
          scene,
          documentId: options.documentId,
          documentRevision: options.documentRevision,
          placement: options.placement,
        },
        () => !this.disposed && options.isCurrent(),
        options.subscribeCurrent,
      );
      if (
        !result ||
        result.documentId !== options.documentId ||
        typeof result.objectId !== 'string' ||
        !result.objectId
      )
        throw new HostError('INVALID_INPUT', '无效插入回包');
      return result;
    } finally {
      this.busy = false;
    }
  }
  async readSelectedMetadata(): Promise<VectorScene['metadata'] | null> {
    const value = await this.call<unknown>('readSelectedMetadata', {});
    if (value === null) return null;
    validateMetadata(value);
    return value;
  }
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.transport.dispose?.();
  }
}
