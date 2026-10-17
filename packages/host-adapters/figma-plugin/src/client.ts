import {
  HostError,
  RemoteHostAdapter,
  validateEnvelope,
  validateResponse,
  validateSnapshot,
} from '@astmatrix/host-contract';
import type { HostEnvelope, HostSnapshot, HostTransport } from '@astmatrix/host-contract';
import { errorMessage, LICENSE_URL, PROJECT_URL, stableStringify } from '@astmatrix/shared';
import {
  FIGMA_BRIDGE_VERSION,
  FIGMA_CHANNEL,
  FIGMA_MESSAGE_LIMIT,
  messageId,
  normalizeFigmaMessage,
  record,
} from './protocol';

export interface FigmaConnectionState {
  status: 'connecting' | 'connected' | 'error' | 'closed';
  message?: string;
  details?: string;
}

export interface FigmaClientWindow {
  parent: { postMessage: (message: unknown, origin: string) => void };
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
}
interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  isCurrent: () => boolean;
  stop: () => void;
}
export class FigmaTransport implements HostTransport {
  private session = '';
  private closed = false;
  private sequence = 0;
  private pending = new Map<string, Pending>();
  private listeners = new Set<(snapshot: HostSnapshot) => void>();
  private connection: FigmaConnectionState = { status: 'connecting', message: '正在连接 Figma…' };
  private connectionListeners = new Set<() => void>();
  private lastRelayDiagnostic = 'No messages on the AstMatrix channel.';
  private connectionTimer: ReturnType<typeof setTimeout>;
  private ready: Promise<void>;
  private accept: () => void = () => {};
  private helloTimer: ReturnType<typeof setInterval>;
  private readonly window: FigmaClientWindow;
  constructor(window: FigmaClientWindow) {
    this.window = window;
    this.ready = new Promise((resolve) => {
      this.accept = resolve;
    });
    window.addEventListener('message', this.receive);
    this.connectionTimer = setTimeout(() => {
      if (this.connection.status === 'connecting')
        this.connectionError(
          'Figma 消息桥未连接，请重新运行插件',
          `No valid init received from plugin main thread.\n${this.lastRelayDiagnostic}`,
        );
    }, 10000);
    this.helloTimer = setInterval(() => this.post({ type: 'hello' }), 500);
    this.post({ type: 'hello' });
  }
  getConnectionSnapshot = (): FigmaConnectionState => this.connection;
  subscribeConnection = (listener: () => void): (() => void) => {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  };
  private setConnection(state: FigmaConnectionState): void {
    this.connection = state;
    this.connectionListeners.forEach((listener) => listener());
  }
  private connectionError(message: string, detail: string): void {
    this.setConnection({
      status: 'error',
      message,
      details: `AstMatrix UI bridge ${FIGMA_BRIDGE_VERSION}\n${detail}`,
    });
  }
  subscribeSnapshot(listener: (snapshot: HostSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private post(value: Record<string, unknown>): void {
    this.window.parent.postMessage(
      { pluginMessage: { channel: FIGMA_CHANNEL, session: this.session, ...value } },
      '*',
    );
  }
  private receive = (event: MessageEvent): void => {
    // Figma may relay messages through a different window or inject events without a source.
    // WindowProxy identity is not the bridge contract; validate the protocol fields below.
    if (this.closed || !record(event.data)) return;
    const incoming = event.data.pluginMessage;
    if (!record(incoming) || incoming.channel !== FIGMA_CHANNEL) return;
    const source =
      event.source === null ? 'null' : event.source === this.window.parent ? 'parent' : 'other';
    this.lastRelayDiagnostic = `Last message: ${String(incoming.type)}; source: ${source}.`;
    try {
      const m = normalizeFigmaMessage(incoming) as Record<string, unknown>;
      if (m.type === 'startup-error') {
        this.connectionError('Figma 主线程启动失败，请重新运行插件', String(m.message));
        return;
      }
      if (m.type === 'init' && messageId(m.session)) {
        const snapshot = validateSnapshot(m.snapshot);
        if (this.session && this.session !== m.session)
          this.rejectAll(new HostError('CANCELLED', '插件会话已变化'));
        this.session = m.session;
        clearInterval(this.helloTimer);
        clearTimeout(this.connectionTimer);
        this.listeners.forEach((listener) => listener(snapshot));
        this.setConnection({ status: 'connected' });
        this.accept();
        return;
      }
      if (m.session !== this.session) return;
      if (m.type === 'state') {
        const snapshot = validateSnapshot(m.snapshot);
        this.listeners.forEach((listener) => listener(snapshot));
      } else if (m.type === 'closed') {
        const snapshot = validateSnapshot(m.snapshot);
        this.listeners.forEach((listener) => listener(snapshot));
        this.dispose();
      } else if (messageId(m.requestId)) {
        const task = this.pending.get(m.requestId);
        if (!task) return;
        if (m.type === 'commit-request') {
          this.post({ type: task.isCurrent() ? 'commit' : 'cancel', requestId: m.requestId });
        } else if (m.type === 'response') {
          const response = validateResponse(m.response, m.requestId);
          this.pending.delete(m.requestId);
          task.stop();
          task.resolve(response);
        }
      }
    } catch (error) {
      if (incoming.type === 'init' || incoming.type === 'state')
        this.connectionError('Figma 初始化失败，请重新运行插件', errorMessage(error));
      if (messageId(incoming.requestId)) {
        const task = this.pending.get(incoming.requestId);
        if (task) {
          this.pending.delete(incoming.requestId);
          task.stop();
          task.reject(error);
        }
      }
    }
  };
  private async send(
    id: string,
    message: Record<string, unknown>,
    isCurrent = () => true,
    subscribeCurrent?: (listener: () => void) => () => void,
  ): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.ready,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(new HostError('UNSUPPORTED_FEATURE', 'Figma 消息桥未连接，请从插件打开面板')),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (this.closed || !isCurrent()) throw new HostError('CANCELLED', '面板已关闭或输入已变化');
    return new Promise((resolve, reject) => {
      let cancelled = false;
      const cancel = () => {
        if (!cancelled && !isCurrent()) {
          cancelled = true;
          this.post({ type: 'cancel', requestId: id });
        }
      };
      const poll = setInterval(cancel, 50);
      const unsubscribe = subscribeCurrent?.(cancel);
      const stop = () => {
        clearInterval(poll);
        unsubscribe?.();
      };
      this.pending.set(id, { resolve, reject, isCurrent, stop });
      try {
        this.post({ type: 'request', requestId: id, ...message });
      } catch (error) {
        stop();
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  request(
    envelope: HostEnvelope,
    isCurrent?: () => boolean,
    subscribeCurrent?: (listener: () => void) => () => void,
  ): Promise<unknown> {
    validateEnvelope(envelope);
    if (stableStringify(envelope).length > FIGMA_MESSAGE_LIMIT)
      return Promise.reject(new HostError('INVALID_INPUT', 'Scene 超过 8 MiB 消息上限'));
    return this.send(envelope.requestId, { envelope }, isCurrent, subscribeCurrent);
  }
  async openExternal(url: string): Promise<void> {
    if (url !== PROJECT_URL && url !== LICENSE_URL)
      throw new HostError('INVALID_INPUT', '不支持的外部链接');
    const id = `external-${++this.sequence}`;
    const response = validateResponse(await this.send(id, { type: 'openExternal', url }), id);
    if (!response.ok) throw new HostError('UNKNOWN_HOST_ERROR', response.error.message);
  }
  private rejectAll(error: HostError): void {
    this.pending.forEach((task) => {
      task.stop();
      task.reject(error);
    });
    this.pending.clear();
  }
  dispose(): void {
    if (this.closed) return;
    this.pending.forEach((_task, id) => this.post({ type: 'cancel', requestId: id }));
    this.closed = true;
    clearInterval(this.helloTimer);
    clearTimeout(this.connectionTimer);
    this.accept();
    this.window.removeEventListener('message', this.receive);
    this.rejectAll(new HostError('CANCELLED', 'Figma 面板已关闭'));
    this.listeners.clear();
    this.setConnection({ status: 'closed', message: 'Figma 面板已关闭' });
    this.connectionListeners.clear();
  }
}
export class FigmaPluginAdapter extends RemoteHostAdapter {
  private readonly unsubscribe: () => void;
  constructor(transport: FigmaTransport) {
    super('figma-plugin', transport);
    this.unsubscribe = transport.subscribeSnapshot((snapshot) => this.acceptSnapshot(snapshot));
  }
  override async readSelectedMetadata(): Promise<null> {
    return null;
  }
  override dispose(): void {
    this.unsubscribe();
    super.dispose();
  }
}
