import { HostError, validateEnvelope } from '@astmatrix/host-contract';
import type { HostEnvelope, HostResponse, HostSnapshot } from '@astmatrix/host-contract';
import {
  errorMessage,
  ISSUES_URL,
  LICENSE_URL,
  PROJECT_URL,
  stableStringify,
} from '@astmatrix/shared';
import type { VectorScene } from '@astmatrix/vector-ir';
import {
  FIGMA_BRIDGE_VERSION,
  FIGMA_CHANNEL,
  FIGMA_MESSAGE_LIMIT,
  messageId,
  normalizeFigmaMessage,
  record,
} from './protocol';
import { insertScene } from './renderer';
import type { FigmaDrawingAPI } from './renderer';

export type FigmaRuntimeAPI = FigmaDrawingAPI &
  Pick<PluginAPI, 'root' | 'ui' | 'on' | 'off' | 'commitUndo' | 'openExternal'>;
export function startFigmaPlugin(
  api: FigmaRuntimeAPI & Pick<PluginAPI, 'showUI'>,
  html: string,
): FigmaPluginRuntime | null {
  api.showUI(html, { width: 520, height: 720 });
  try {
    const runtime = new FigmaPluginRuntime(api);
    // Figma queues main-to-UI messages until the iframe has loaded.
    runtime.initialize();
    return runtime;
  } catch (error) {
    console.error('[AstMatrix] Figma startup failed:', errorMessage(error));
    api.ui.postMessage({
      channel: FIGMA_CHANNEL,
      type: 'startup-error',
      bridgeVersion: FIGMA_BRIDGE_VERSION,
      message: errorMessage(error),
    });
    return null;
  }
}
/** A persistent plugin session; only page changes invalidate insertion, not its own selection. */
export class FigmaPluginRuntime {
  readonly session = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  private revision = 0;
  private closed = false;
  private pending: HostEnvelope | null = null;
  private completed = new Map<string, HostResponse<unknown>>();
  private readonly api: FigmaRuntimeAPI;
  constructor(api: FigmaRuntimeAPI) {
    this.api = api;
    api.ui.onmessage = this.receive;
    api.on('currentpagechange', this.pageChanged);
    api.on('close', this.dispose);
  }
  initialize(): void {
    this.post({ type: 'init', bridgeVersion: FIGMA_BRIDGE_VERSION, snapshot: this.snapshot() });
  }
  snapshot(): HostSnapshot {
    return {
      documentId: this.closed
        ? null
        : `${this.session}:${this.api.root.id}:${this.api.currentPage.id}`,
      revision: this.revision,
      capabilities: {
        documentOpen: !this.closed,
        canInsertNativeVector: !this.closed,
        canUpdatePlacedObject: false,
        canPersistMetadata: true,
        supportsEditableText: false,
        supportsCompoundShapes: true,
      },
    };
  }
  private post(message: Record<string, unknown>): void {
    this.api.ui.postMessage({ channel: FIGMA_CHANNEL, session: this.session, ...message });
  }
  private reply(response: HostResponse<unknown>): void {
    this.completed.set(response.requestId, response);
    // A closed UI must not turn an already committed insertion into a failed operation.
    try {
      this.post({ type: 'response', requestId: response.requestId, response });
    } catch {
      // Keep the result for a duplicate request if the UI reconnects in this session.
    }
  }
  private fail(id: string, error: unknown): void {
    this.reply({
      requestId: id,
      ok: false,
      error: {
        code: error instanceof HostError ? error.code : 'UNKNOWN_HOST_ERROR',
        message: errorMessage(error),
        ...(error instanceof HostError && error.originalError
          ? { originalError: error.originalError }
          : {}),
        ...(error instanceof HostError && error.cleanupError
          ? { cleanupError: error.cleanupError }
          : {}),
      },
    });
  }
  private pageChanged = (): void => {
    this.revision++;
    if (this.pending)
      this.fail(this.pending.requestId, new HostError('DOCUMENT_CHANGED', '页面已切换'));
    this.pending = null;
    this.post({ type: 'state', snapshot: this.snapshot() });
  };
  receive = (value: unknown): void => {
    if (this.closed || !record(value) || value.channel !== FIGMA_CHANNEL) return;
    const incoming = normalizeFigmaMessage(value);
    if (!record(incoming)) return;
    this.dispatch(incoming);
  };
  private dispatch(value: Record<string, unknown>): void {
    if (value.type === 'hello') {
      this.initialize();
      return;
    }
    if (value.session !== this.session || !messageId(value.requestId)) return;
    const id = value.requestId;
    const completed = this.completed.get(id);
    if (completed) {
      this.post({ type: 'response', requestId: id, response: completed });
      return;
    }
    if (value.type === 'cancel') {
      if (this.pending?.requestId === id) {
        this.pending = null;
        this.fail(id, new HostError('CANCELLED', '输入已变化，已取消插入'));
      }
      return;
    }
    try {
      if (value.type === 'commit') {
        if (this.pending?.requestId !== id) return;
        const envelope = this.pending;
        this.pending = null;
        const p = envelope.payload;
        const current = () =>
          !this.closed &&
          p.documentId === this.snapshot().documentId &&
          p.documentRevision === this.revision;
        if (!current()) throw new HostError('DOCUMENT_CHANGED', '页面已变化');
        const node = insertScene(this.api, p.scene as unknown as VectorScene, current);
        this.reply({
          requestId: id,
          ok: true,
          result: { objectId: node.id, documentId: p.documentId },
        });
        return;
      }
      if (this.completed.size >= 10000) {
        this.post({
          type: 'response',
          requestId: id,
          response: {
            requestId: id,
            ok: false,
            error: { code: 'HOST_BUSY', message: '消息预算已满，请重新打开插件' },
          },
        });
        return;
      }
      if (value.type === 'openExternal') {
        if (value.url !== PROJECT_URL && value.url !== LICENSE_URL && value.url !== ISSUES_URL)
          throw new HostError('INVALID_INPUT', '不支持的外部链接');
        this.api.openExternal(value.url);
        this.reply({ requestId: id, ok: true, result: null });
        return;
      }
      if (value.type !== 'request') throw new HostError('INVALID_INPUT', '未知 Figma 消息');
      validateEnvelope(value.envelope);
      const envelope = value.envelope;
      if (envelope.requestId !== id || stableStringify(envelope).length > FIGMA_MESSAGE_LIMIT)
        throw new HostError('INVALID_INPUT', '无效消息信封或消息过大');
      if (envelope.operation === 'capabilities') {
        this.reply({ requestId: id, ok: true, result: this.snapshot() });
      } else if (envelope.operation === 'insert') {
        if (this.pending?.requestId === id) return;
        if (this.pending) throw new HostError('HOST_BUSY', '已有插入任务');
        const p = envelope.payload;
        if (p.placement !== 'center')
          throw new HostError('UNSUPPORTED_FEATURE', 'Figma 首版仅支持视口中心定位');
        if (p.documentId !== this.snapshot().documentId || p.documentRevision !== this.revision)
          throw new HostError('DOCUMENT_CHANGED', '页面已变化');
        this.pending = envelope;
        // Ask the UI to recheck its preview immediately before the synchronous mutation.
        this.post({ type: 'commit-request', requestId: id });
      } else throw new HostError('UNSUPPORTED_FEATURE', 'Figma 首版不支持回读或更新');
    } catch (error) {
      this.fail(id, error);
    }
  }
  dispose = (): void => {
    if (this.closed) return;
    this.closed = true;
    this.pending = null;
    this.post({ type: 'closed', snapshot: this.snapshot() });
    this.api.off('currentpagechange', this.pageChanged);
    this.api.off('close', this.dispose);
    this.api.ui.onmessage = undefined;
    this.completed.clear();
  };
}
