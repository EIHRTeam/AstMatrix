import { HostError, RemoteHostAdapter, validateEnvelope } from '@astmatrix/host-contract';
import type { HostEnvelope, HostTransport } from '@astmatrix/host-contract';
import { LICENSE_URL, PROJECT_URL, stableStringify } from '@astmatrix/shared';
export const WEBVIEW_CHANNEL = 'astmatrix-webview-v1';
export interface WebviewClientWindow {
  uxpHost?: { postMessage: (message: unknown) => void };
  addEventListener: (
    name: 'message',
    callback: (event: { data: unknown; origin: string; source: unknown }) => void,
  ) => void;
  removeEventListener: (
    name: 'message',
    callback: (event: { data: unknown; origin: string; source: unknown }) => void,
  ) => void;
}
export class WebviewTransport implements HostTransport {
  private readonly window: WebviewClientWindow;
  private locale = '';
  private localeListeners = new Set<() => void>();
  getLocale = () => this.locale;
  subscribeLocale = (listener: () => void) => {
    this.localeListeners.add(listener);
    return () => {
      this.localeListeners.delete(listener);
    };
  };
  private session = '';
  private closed = false;
  private paused = false;
  private helloTimer: ReturnType<typeof setInterval> | undefined;
  private sequence = 0;
  private ready: Promise<void>;
  private accept: () => void = () => {};
  private pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void; stop: () => void }
  >();
  constructor(window: WebviewClientWindow) {
    this.window = window;
    this.ready = new Promise((resolve) => {
      this.accept = resolve;
    });
    if (!window.uxpHost)
      throw new HostError('UNSUPPORTED_FEATURE', '请从 Photoshop WebView 增强包打开本页面');
    window.addEventListener('message', this.receive);
    window.uxpHost.postMessage({ channel: WEBVIEW_CHANNEL, type: 'hello' });
    this.helloTimer = setInterval(
      () => window.uxpHost?.postMessage({ channel: WEBVIEW_CHANNEL, type: 'hello' }),
      500,
    );
  }
  private receive = (event: { data: unknown; origin: string; source: unknown }) => {
    if (event.source !== this.window.uxpHost) return;
    const m = event.data as {
      channel?: string;
      type?: string;
      session?: string;
      requestId?: string;
      response?: unknown;
      locale?: unknown;
    };
    if (!m || m.channel !== WEBVIEW_CHANNEL) return;
    if (m.type === 'suspend' && m.session === this.session) {
      this.paused = true;
      return;
    }
    if (m.type === 'init' && typeof m.session === 'string') {
      if (this.session && m.session !== this.session) {
        this.pending.forEach((task) => {
          task.stop();
          task.reject(new HostError('CANCELLED', 'WebView 已重载'));
        });
        this.pending.clear();
      }
      const locale = typeof m.locale === 'string' && m.locale.length <= 35 ? m.locale : '';
      if (locale !== this.locale) {
        this.locale = locale;
        this.localeListeners.forEach((listener) => listener());
      }
      this.paused = false;
      if (this.helloTimer) {
        clearInterval(this.helloTimer);
        this.helloTimer = undefined;
      }
      this.session = m.session;
      this.accept();
      return;
    }
    if (m.session !== this.session || m.type !== 'response' || !m.requestId) return;
    const task = this.pending.get(m.requestId);
    if (!task) return;
    this.pending.delete(m.requestId);
    task.stop();
    task.resolve(m.response);
  };
  private async send(
    requestId: string,
    message: Record<string, unknown>,
    isCurrent = () => true,
    subscribeCurrent?: (listener: () => void) => () => void,
  ): Promise<unknown> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.ready,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new HostError('UNSUPPORTED_FEATURE', 'Photoshop WebView 消息桥未连接')),
            10000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (this.closed || this.paused || !isCurrent())
      throw new HostError('CANCELLED', '面板已关闭或输入已变化');
    return new Promise((resolve, reject) => {
      let cancelled = false;
      const cancel = () => {
        if (!cancelled && (this.closed || !isCurrent())) {
          cancelled = true;
          this.window.uxpHost?.postMessage({
            channel: WEBVIEW_CHANNEL,
            type: 'cancel',
            session: this.session,
            requestId,
          });
        }
      };
      const poll = setInterval(cancel, 50);
      const unsubscribe = subscribeCurrent?.(cancel);
      const stop = () => {
        clearInterval(poll);
        unsubscribe?.();
      };
      this.pending.set(requestId, { resolve, reject, stop });
      try {
        this.window.uxpHost!.postMessage({
          channel: WEBVIEW_CHANNEL,
          session: this.session,
          requestId,
          ...message,
        });
      } catch (error) {
        stop();
        this.pending.delete(requestId);
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
    if (stableStringify(envelope).length > 8 * 1024 * 1024)
      return Promise.reject(new HostError('INVALID_INPUT', 'Scene 超过 8 MiB 消息上限'));
    return this.send(
      envelope.requestId,
      { type: 'request', envelope },
      isCurrent,
      subscribeCurrent,
    );
  }
  async exportSvg(svg: string, name: string): Promise<void> {
    const id = `export-${++this.sequence}`;
    const result = (await this.send(id, { type: 'export', svg, name })) as {
      ok: boolean;
      error?: { message: string };
    };
    if (!result.ok)
      throw new HostError('UNKNOWN_HOST_ERROR', result.error?.message ?? 'SVG 导出失败');
  }
  async openProject(): Promise<void> {
    return this.openExternal(PROJECT_URL);
  }
  async openExternal(url: string): Promise<void> {
    if (url !== PROJECT_URL && url !== LICENSE_URL)
      throw new HostError('INVALID_INPUT', '不支持的外部链接');
    const id = `external-${++this.sequence}`;
    const result = (await this.send(id, { type: 'openExternal', url })) as {
      ok: boolean;
      error?: { message: string };
    };
    if (!result.ok)
      throw new HostError('UNKNOWN_HOST_ERROR', result.error?.message ?? '无法打开外部链接');
  }
  dispose(): void {
    this.closed = true;
    this.localeListeners.clear();
    this.accept();
    if (this.helloTimer) clearInterval(this.helloTimer);
    this.window.removeEventListener('message', this.receive);
    this.pending.forEach((task, requestId) => {
      this.window.uxpHost?.postMessage({
        channel: WEBVIEW_CHANNEL,
        type: 'cancel',
        session: this.session,
        requestId,
      });
      task.stop();
      task.reject(new HostError('CANCELLED', 'WebView 已关闭'));
    });
    this.pending.clear();
  }
}
export function createWebviewAdapter(window: WebviewClientWindow) {
  const transport = new WebviewTransport(window);
  return { adapter: new RemoteHostAdapter('photoshop-webview', transport), transport };
}
