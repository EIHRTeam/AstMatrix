import { bwipProvider } from '@astmatrix/barcode-core';
import type { EncodeProvider } from '@astmatrix/barcode-core';
import { normalizeRequest } from '@astmatrix/profiles';
import type { GenerateRequest, NormalizedRequest } from '@astmatrix/profiles';
import { renderSvg } from '@astmatrix/renderers-svg';
import { AstMatrixError, deepFreeze, errorMessage, stableStringify } from '@astmatrix/shared';
import { LAYOUT_VERSION, validateScene } from '@astmatrix/vector-ir';
import type { VectorScene } from '@astmatrix/vector-ir';
import { HostError, insertionReason, validateMetadata } from '@astmatrix/host-contract';
import type { HostAdapter, InsertResult } from '@astmatrix/host-contract';
export interface GeneratedBarcode {
  key: string;
  request: NormalizedRequest;
  scene: VectorScene;
  svg: string;
}
export function asApplicationError(error: unknown): AstMatrixError {
  return error instanceof AstMatrixError
    ? error
    : new AstMatrixError('PROVIDER_ERROR', errorMessage(error), 'provider');
}
export class AstMatrixApplicationService {
  private readonly provider: EncodeProvider;
  private readonly cache = new Map<string, GeneratedBarcode>();
  private readonly pending = new Map<string, Promise<GeneratedBarcode>>();
  private readonly capacity: number;
  constructor(provider: EncodeProvider = bwipProvider, capacity = 32) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid cache capacity');
    this.provider = provider;
    this.capacity = capacity;
  }
  key(request: NormalizedRequest): string {
    return stableStringify({
      request,
      engineVersion: this.provider.engineVersion,
      layoutVersion: LAYOUT_VERSION,
    });
  }
  generate(input: GenerateRequest): Promise<GeneratedBarcode> {
    try {
      return this.generateNormalized(normalizeRequest(input));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  generateNormalized(request: NormalizedRequest): Promise<GeneratedBarcode> {
    const key = this.key(request),
      cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    // Async boundary admits same-request deduplication even for synchronous Providers.
    const task = Promise.resolve()
      .then(() => this.provider.encode(request))
      .then((scene) => {
        validateScene(scene);
        validateMetadata(scene.metadata);
        if (
          scene.metadata.sourceValue !== request.text ||
          stableStringify(normalizeRequest(scene.metadata.request!)) !== stableStringify(request)
        )
          throw new AstMatrixError(
            'PROVIDER_REQUEST_MISMATCH',
            'Provider 返回的 Scene 与请求不一致',
            'provider',
          );
        if (scene.metadata.engineVersion !== this.provider.engineVersion)
          throw new AstMatrixError(
            'PROVIDER_VERSION_MISMATCH',
            'Provider 版本与 Scene 不匹配',
            'provider',
          );
        const result = deepFreeze({ key, request, scene, svg: renderSvg(scene) });
        this.cache.set(key, result);
        if (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value!);
        return result;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, task);
    return task;
  }
  restore(metadata: unknown): GenerateRequest {
    validateMetadata(metadata);
    if (
      metadata.layoutVersion !== LAYOUT_VERSION ||
      !(this.provider.restorableEngineVersions ?? [this.provider.engineVersion]).includes(
        metadata.engineVersion,
      )
    )
      throw new AstMatrixError(
        'UNSUPPORTED_METADATA_VERSION',
        '参数来自不同的编码引擎或布局版本，无法按原版本恢复',
      );
    normalizeRequest(metadata.request!);
    return deepFreeze({ ...metadata.request!, fields: { ...metadata.request!.fields } });
  }
  clearCache(): void {
    this.cache.clear();
  }
  get cacheSize(): number {
    return this.cache.size;
  }
}
export type PreviewState =
  | { status: 'idle'; revision: number }
  | { status: 'pending'; revision: number; key: string }
  | { status: 'ready'; revision: number; barcode: GeneratedBarcode }
  | { status: 'error'; revision: number; error: AstMatrixError };
export interface PreviewScheduler {
  schedule: (callback: () => void) => () => void;
}
export class PreviewController {
  private state: PreviewState = { status: 'idle', revision: 0 };
  private listeners = new Set<() => void>();
  private disposed = false;
  private lastInput: GenerateRequest | null = null;
  private cancel: () => void = () => {};
  private readonly service: AstMatrixApplicationService;
  private readonly scheduler: PreviewScheduler;
  constructor(
    service: AstMatrixApplicationService,
    scheduler: PreviewScheduler = {
      schedule: (callback) => {
        callback();
        return () => {};
      },
    },
  ) {
    this.service = service;
    this.scheduler = scheduler;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: PreviewState): void {
    if (!this.disposed) {
      this.state = state;
      this.listeners.forEach((l) => l());
    }
  }
  invalidate(): void {
    this.lastInput = null;
    this.cancel();
    this.publish({ status: 'idle', revision: this.state.revision + 1 });
  }
  request(input: GenerateRequest): void {
    this.lastInput = { ...input, fields: { ...input.fields } };
    if (this.disposed) return;
    this.cancel();
    const revision = this.state.revision + 1;
    let request: NormalizedRequest;
    try {
      request = normalizeRequest(input);
    } catch (error) {
      this.publish({ status: 'error', revision, error: asApplicationError(error) });
      return;
    }
    this.publish({ status: 'pending', revision, key: this.service.key(request) });
    this.cancel = this.scheduler.schedule(() => {
      void this.service.generateNormalized(request).then(
        (barcode) => {
          if (!this.disposed && this.state.revision === revision)
            this.publish({ status: 'ready', revision, barcode });
        },
        (error) => {
          if (!this.disposed && this.state.revision === revision)
            this.publish({ status: 'error', revision, error: asApplicationError(error) });
        },
      );
    });
  }
  /** Reconnect after a development StrictMode effect cycle; old generations stay invalid. */
  activate(): void {
    if (this.disposed) {
      this.disposed = false;
      if (this.lastInput) this.request(this.lastInput);
    }
  }
  dispose(): void {
    this.cancel();
    this.disposed = true;
    this.state = { status: 'idle', revision: this.state.revision + 1 };
    this.listeners.clear();
  }
}
export type InsertState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; result: InsertResult }
  | { status: 'error'; error: AstMatrixError };
export class InsertController {
  private invalidations = new Set<() => void>();
  private state: InsertState = { status: 'idle' };
  private listeners = new Set<() => void>();
  private busy = false;
  private lifecycle = 0;
  private disposed = false;
  private readonly adapter: HostAdapter;
  private readonly preview: PreviewController;
  constructor(adapter: HostAdapter, preview: PreviewController) {
    this.adapter = adapter;
    this.preview = preview;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: InsertState): void {
    if (!this.disposed) {
      this.state = state;
      this.listeners.forEach((l) => l());
    }
  }
  reason(): string | null {
    if (this.busy) return '正在插入，请稍候';
    const state = this.preview.getSnapshot();
    if (state.status !== 'ready') return '当前输入尚未生成有效预览';
    return insertionReason(this.adapter.getSnapshot(), state.barcode.scene);
  }
  async insert(placement: 'center' | 'selection' = 'center'): Promise<InsertResult> {
    if (this.disposed) throw new HostError('CANCELLED', '控制器已释放');
    if (this.busy) throw new HostError('HOST_BUSY', '已有插入任务');
    const preview = this.preview.getSnapshot();
    if (preview.status !== 'ready')
      throw new AstMatrixError('INVALID_INPUT', '只允许插入当前有效预览');
    const host = this.adapter.getSnapshot(),
      scene = preview.barcode.scene;
    const reason = insertionReason(host, scene);
    if (reason)
      throw new HostError(host.documentId ? 'UNSUPPORTED_FEATURE' : 'NO_DOCUMENT', reason);
    const lifecycle = this.lifecycle;
    const isCurrent = () =>
      lifecycle === this.lifecycle &&
      !this.disposed &&
      this.preview.getSnapshot() === preview &&
      this.adapter.getSnapshot().documentId === host.documentId &&
      this.adapter.getSnapshot().revision === host.revision;
    this.busy = true;
    this.publish({ status: 'pending' });
    try {
      const result = await this.adapter.insert(scene, {
        documentId: host.documentId!,
        documentRevision: host.revision,
        placement,
        isCurrent,
        subscribeCurrent: (listener) => {
          const unsubPreview = this.preview.subscribe(listener),
            unsubHost = this.adapter.subscribe(listener);
          this.invalidations.add(listener);
          return () => {
            unsubPreview();
            unsubHost();
            this.invalidations.delete(listener);
          };
        },
      });
      if (result.documentId !== host.documentId || !result.objectId)
        throw new HostError('UNKNOWN_HOST_ERROR', '宿主返回了错误的文档或对象标识');
      if (lifecycle === this.lifecycle) this.publish({ status: 'success', result });
      return result;
    } catch (error) {
      const mapped =
        error instanceof AstMatrixError
          ? error
          : new HostError('UNKNOWN_HOST_ERROR', errorMessage(error));
      if (lifecycle === this.lifecycle) this.publish({ status: 'error', error: mapped });
      throw mapped;
    } finally {
      this.busy = false;
    }
  }
  activate(): void {
    this.disposed = false;
  }
  dispose(): void {
    this.disposed = true;
    this.lifecycle++;
    this.invalidations.forEach((listener) => listener());
    this.invalidations.clear();
    this.listeners.clear();
  }
}
