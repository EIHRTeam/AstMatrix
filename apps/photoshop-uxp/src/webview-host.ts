import { HostError, validateEnvelope } from '@astmatrix/host-contract';
import type { HostEnvelope, HostResponse } from '@astmatrix/host-contract';
import { errorMessage, stableStringify } from '@astmatrix/shared';
import { WEBVIEW_CHANNEL } from './webview-client';
interface Peer {
  postMessage: (message: unknown) => void;
}
interface WebviewEnvironment {
  locale?: string;
  openProject?: () => Promise<void>;
}
interface Dispatcher {
  dispatch: (envelope: HostEnvelope, isCurrent: () => boolean) => Promise<HostResponse<unknown>>;
}
/** One localOnly WebView. A nonce isolates reloads; the client never supplies Action Descriptors. */
export class WebviewHostBridge {
  private readonly peer: Peer;
  private readonly adapter: Dispatcher;
  private readonly exportSvg: (svg: string, name: string) => Promise<void>;
  private readonly environment: WebviewEnvironment;
  private session = '';
  private active = true;
  private pending = new Map<string, { cancelled: boolean }>();
  private completed = new Set<string>();
  constructor(
    peer: Peer,
    adapter: Dispatcher,
    exportSvg: (svg: string, name: string) => Promise<void>,
    environment: WebviewEnvironment = {},
  ) {
    this.peer = peer;
    this.adapter = adapter;
    this.exportSvg = exportSvg;
    this.environment = environment;
    this.reload();
  }
  private post(message: Record<string, unknown>): void {
    this.peer.postMessage({ channel: WEBVIEW_CHANNEL, session: this.session, ...message });
  }
  initialize(): void {
    this.post({ type: 'init', locale: this.environment.locale ?? '' });
  }
  reload(): void {
    this.pending.forEach((task) => {
      task.cancelled = true;
    });
    this.session = Date.now().toString(36) + Math.random().toString(36).slice(2);
    this.completed.clear();
  }
  pause(): void {
    this.active = false;
    this.pending.forEach((task) => {
      task.cancelled = true;
    });
    this.post({ type: 'suspend' });
  }
  resume(): void {
    this.active = true;
    this.initialize();
  }
  async receive(value: unknown): Promise<void> {
    const m = value as {
      channel?: string;
      session?: string;
      type?: string;
      requestId?: string;
      envelope?: HostEnvelope;
      svg?: string;
      name?: string;
    };
    if (!m || m.channel !== WEBVIEW_CHANNEL) return;
    if (m.type === 'hello') {
      if (this.active) this.initialize();
      return;
    }
    if (m.session !== this.session || !m.requestId || !/^[a-z0-9-]{1,256}$/i.test(m.requestId))
      return;
    if (m.type === 'cancel') {
      const task = this.pending.get(m.requestId);
      if (task) task.cancelled = true;
      return;
    }
    if (this.pending.has(m.requestId) || this.completed.has(m.requestId)) return;
    if (!this.active || this.pending.size >= 32 || this.completed.size >= 10000) {
      this.post({
        type: 'response',
        requestId: m.requestId,
        response: {
          requestId: m.requestId,
          ok: false,
          error: { code: 'HOST_BUSY', message: '面板不可用或消息预算已满，请重新加载 WebUI' },
        },
      });
      return;
    }
    const id = m.requestId,
      session = this.session,
      task = { cancelled: false };
    this.pending.set(id, task);
    const isCurrent = () => this.active && !task.cancelled && session === this.session;
    try {
      let response: unknown;
      if (m.type === 'request') {
        if (
          !m.envelope ||
          m.envelope.requestId !== id ||
          stableStringify(m.envelope).length > 8 * 1024 * 1024
        )
          throw new HostError('INVALID_INPUT', '无效消息信封');
        validateEnvelope(m.envelope);
        response = await this.adapter.dispatch(m.envelope, isCurrent);
      } else if (m.type === 'openProject') {
        if (!this.environment.openProject)
          throw new HostError('UNSUPPORTED_FEATURE', '无法打开 GitHub');
        if (!isCurrent()) throw new HostError('CANCELLED', '操作已取消');
        await this.environment.openProject();
        response = { ok: true };
      } else if (m.type === 'export' && typeof m.svg === 'string' && typeof m.name === 'string') {
        if (
          m.svg.length > 8 * 1024 * 1024 ||
          !m.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') ||
          !/^[a-z0-9-]+\.svg$/i.test(m.name)
        )
          throw new HostError('INVALID_INPUT', '无效 SVG 导出参数');
        if (!isCurrent()) throw new HostError('CANCELLED', '导出已取消');
        await this.exportSvg(m.svg, m.name);
        response = { ok: true };
      } else throw new HostError('INVALID_INPUT', '未知 WebView 操作');
      if (session === this.session) this.post({ type: 'response', requestId: id, response });
    } catch (error) {
      if (session === this.session)
        this.post({
          type: 'response',
          requestId: id,
          response: {
            requestId: id,
            ok: false,
            error: {
              code: error instanceof HostError ? error.code : 'UNKNOWN_HOST_ERROR',
              message: errorMessage(error),
            },
          },
        });
    } finally {
      this.pending.delete(id);
      if (session === this.session) this.completed.add(id);
    }
  }
}
