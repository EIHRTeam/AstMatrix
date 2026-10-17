import { expect, it, vi } from 'vitest';
import { LICENSE_URL, PROJECT_URL } from '@astmatrix/shared';
import { WebviewHostBridge } from '../../apps/photoshop-uxp/src/webview-host';
import { WEBVIEW_CHANNEL, WebviewTransport } from '../../apps/photoshop-uxp/src/webview-client';
import type { WebviewClientWindow } from '../../apps/photoshop-uxp/src/webview-client';
import type { HostEnvelope, HostResponse } from '@astmatrix/host-contract';
import { localWebviewUnavailableReason } from '../../apps/photoshop-uxp/src/webview-support';
it.each(['uxp-9.3.0-uxp', 'uxp-9.3.0', '9.3.0', 'uxp-8.0.0', 'uxp-9.3.0-beta.1'])(
  'accepts the documented UXP version format %s on Photoshop 27.8.0',
  (version) => {
    expect(localWebviewUnavailableReason('27.8.0', version, () => {})).toBeNull();
  },
);
it.each([
  ['25.12.0', 'uxp-9.3.0', '需要 Photoshop 26+ / UXP 8+'],
  ['27.8.0', 'uxp-7.4.0', '需要 Photoshop 26+ / UXP 8+'],
  ['27.8.0', 'unknown', '无法识别宿主版本'],
  ['unknown', 'uxp-9.3.0', '无法识别宿主版本'],
  ['27.8.0', 'invalid-9.3.0', '无法识别宿主版本'],
])('keeps native fallback for %s / %s with a specific reason', (ps, uxp, reason) => {
  expect(localWebviewUnavailableReason(ps, uxp, () => {})).toBe(reason);
});
it('accepts the minimum local rendering versions but still requires a message bridge', () => {
  expect(localWebviewUnavailableReason('26.0.0', 'uxp-8.0.0', () => {})).toBeNull();
  expect(localWebviewUnavailableReason('27.8.0', 'uxp-9.3.0', undefined)).toBe(
    'WebView 消息桥不可用',
  );
});
const envelope: HostEnvelope = {
  requestId: 'test-1',
  payloadVersion: 1,
  operation: 'capabilities',
  payload: {},
};
it('local WebView handshake matches source/session/request, rejects descriptor injection and stops replay', async () => {
  const messages: unknown[] = [];
  const dispatch = vi.fn<
    (
      request: HostEnvelope,
    ) => Promise<{ requestId: string; ok: true; result: { documentId: string } }>
  >(async (request: HostEnvelope) => ({
    requestId: request.requestId,
    ok: true as const,
    result: { documentId: '1' },
  }));
  const bridge = new WebviewHostBridge(
    {
      postMessage: (message) => {
        messages.push(message);
      },
    },
    { dispatch },
    vi.fn<() => Promise<void>>(),
  );
  await bridge.receive({ channel: WEBVIEW_CHANNEL, type: 'hello' });
  const { session } = messages[0] as { session: string };
  const request = {
    channel: WEBVIEW_CHANNEL,
    session,
    type: 'request',
    requestId: envelope.requestId,
    envelope,
  };
  await bridge.receive({ ...request, session: 'forged' });
  expect(dispatch).not.toHaveBeenCalled();
  await bridge.receive(request);
  await bridge.receive(request);
  expect(dispatch).toHaveBeenCalledOnce();
  await bridge.receive({
    ...request,
    requestId: 'bad',
    envelope: {
      ...envelope,
      requestId: 'bad',
      operation: 'batchPlay',
      payload: { _obj: 'delete' },
    },
  });
  expect(messages.at(-1)).toMatchObject({
    response: { ok: false, error: { code: 'INVALID_INPUT' } },
  });
  expect(dispatch).toHaveBeenCalledOnce();
  bridge.reload();
  await bridge.receive({
    ...request,
    requestId: 'test-2',
    envelope: { ...envelope, requestId: 'test-2' },
  });
  expect(dispatch).toHaveBeenCalledOnce();
});
it('queued modal insertion observes client cancellation and panel hide', async () => {
  const output: unknown[] = [];
  let release = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bridge = new WebviewHostBridge(
    {
      postMessage: (m) => {
        output.push(m);
      },
    },
    {
      dispatch: async (request, isCurrent) => {
        await wait;
        return isCurrent()
          ? { requestId: request.requestId, ok: true, result: {} }
          : {
              requestId: request.requestId,
              ok: false,
              error: { code: 'CANCELLED', message: 'cancelled' },
            };
      },
    },
    vi.fn<() => Promise<void>>(),
  );
  bridge.initialize();
  const { session } = output[0] as { session: string };
  const run = bridge.receive({
    channel: WEBVIEW_CHANNEL,
    type: 'request',
    session,
    requestId: envelope.requestId,
    envelope,
  });
  await bridge.receive({
    channel: WEBVIEW_CHANNEL,
    type: 'cancel',
    session,
    requestId: envelope.requestId,
  });
  release();
  await run;
  expect(output.at(-1)).toMatchObject({ response: { ok: false, error: { code: 'CANCELLED' } } });
  bridge.pause();
  expect(output.at(-1)).toMatchObject({ type: 'suspend' });
  bridge.resume();
  expect(output.at(-1)).toMatchObject({ type: 'init' });
});
it('WebView client correlates replies and sends cancellation without prematurely timing out mutations', async () => {
  let listener: Parameters<WebviewClientWindow['addEventListener']>[1] = () => {};
  const outgoing: Record<string, unknown>[] = [];
  const uxpHost = {
    postMessage: (m: unknown) => {
      outgoing.push(m as Record<string, unknown>);
    },
  };
  const w: WebviewClientWindow = {
    uxpHost,
    addEventListener: (_name, l) => {
      listener = l;
    },
    removeEventListener: () => {},
  };
  const transport = new WebviewTransport(w);
  listener({
    source: {},
    origin: 'forged',
    data: { channel: WEBVIEW_CHANNEL, type: 'init', session: 'forged' },
  });
  listener({
    source: uxpHost,
    origin: 'plugin-id',
    data: { channel: WEBVIEW_CHANNEL, type: 'init', session: 'session' },
  });
  let current = true;
  let invalidate = () => {};
  const task = transport.request(
    envelope,
    () => current,
    (callback) => {
      invalidate = callback;
      return () => {};
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(outgoing.at(-1)).toMatchObject({ type: 'request', session: 'session' });
  current = false;
  invalidate();
  expect(outgoing.at(-1)).toMatchObject({ type: 'cancel' });
  listener({
    source: uxpHost,
    origin: 'plugin-id',
    data: {
      channel: WEBVIEW_CHANNEL,
      type: 'response',
      session: 'session',
      requestId: 'other',
      response: {},
    },
  });
  const response = {
    requestId: envelope.requestId,
    ok: false,
    error: { code: 'CANCELLED', message: 'cancelled' },
  };
  listener({
    source: uxpHost,
    origin: 'plugin-id',
    data: {
      channel: WEBVIEW_CHANNEL,
      type: 'response',
      session: 'session',
      requestId: envelope.requestId,
      response,
    },
  });
  expect(await task).toEqual(response);
  transport.dispose();
});

it('passes the host UI locale during initialization and opens only the configured project action', async () => {
  const messages: Record<string, unknown>[] = [];
  const openExternal = vi.fn<(url: string) => Promise<void>>(async () => {});
  const dispatch = vi.fn<() => Promise<{ requestId: string; ok: true; result: object }>>();
  const bridge = new WebviewHostBridge(
    {
      postMessage: (message) => {
        messages.push(message as Record<string, unknown>);
      },
    },
    { dispatch },
    async () => {},
    { locale: 'zh_CN', openExternal },
  );
  bridge.initialize();
  expect(messages[0]).toMatchObject({ type: 'init', locale: 'zh_CN' });
  const request = {
    channel: WEBVIEW_CHANNEL,
    type: 'openProject',
    requestId: 'project-1',
    session: messages[0]!.session,
  };
  await bridge.receive({ ...request, session: 'forged' });
  expect(openExternal).not.toHaveBeenCalled();
  await bridge.receive({ ...request, url: 'https://untrusted.example' });
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(PROJECT_URL);
  expect(dispatch).not.toHaveBeenCalled();
  expect(messages.at(-1)).toMatchObject({ response: { ok: true } });
  await bridge.receive(request);
  expect(openExternal).toHaveBeenCalledOnce();
});

it('accepts locale updates only from the actual UXP host message source', () => {
  let receive: Parameters<WebviewClientWindow['addEventListener']>[1] = () => {};
  const uxpHost = { postMessage: vi.fn<(message: unknown) => void>() };
  const transport = new WebviewTransport({
    uxpHost,
    addEventListener: (_name, listener) => {
      receive = listener;
    },
    removeEventListener: () => {},
  });
  const changed = vi.fn<() => void>();
  const unsubscribe = transport.subscribeLocale(changed);
  try {
    const data = { channel: WEBVIEW_CHANNEL, type: 'init', session: 'session-1', locale: 'zh_CN' };
    receive({ source: {}, origin: '', data });
    expect(transport.getLocale()).toBe('');
    expect(changed).not.toHaveBeenCalled();
    receive({ source: uxpHost, origin: '', data });
    expect(transport.getLocale()).toBe('zh_CN');
    expect(changed).toHaveBeenCalledOnce();
    receive({
      source: uxpHost,
      origin: '',
      data: { ...data, session: 'session-2', locale: 'en_US' },
    });
    expect(transport.getLocale()).toBe('en_US');
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
    transport.dispose();
  }
});

it.each([PROJECT_URL, LICENSE_URL])(
  'opens %s through the authenticated WebView transport and reports host failures',
  async (url) => {
    let receive: Parameters<WebviewClientWindow['addEventListener']>[1] = () => {};
    const openExternal = vi
      .fn<(url: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Browser launch failed'));
    const uxpHost = {
      postMessage: (message: unknown) => {
        void bridge.receive(message);
      },
    };
    const bridge = new WebviewHostBridge(
      { postMessage: (data) => receive({ source: uxpHost, origin: 'plugin-id', data }) },
      { dispatch: vi.fn<() => Promise<HostResponse<unknown>>>() },
      async () => {},
      { openExternal },
    );
    const transport = new WebviewTransport({
      uxpHost,
      addEventListener: (_name, listener) => {
        receive = listener;
      },
      removeEventListener: () => {},
    });
    try {
      await transport.openExternal(url);
      expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
      await expect(transport.openExternal(url)).rejects.toThrow('Browser launch failed');
      await expect(transport.openExternal('https://untrusted.example')).rejects.toThrow(
        '不支持的外部链接',
      );
      expect(openExternal).toHaveBeenCalledTimes(2);
    } finally {
      transport.dispose();
    }
  },
);

it('rejects forged sessions and unknown external destinations before calling the host', async () => {
  const messages: Record<string, unknown>[] = [];
  const openExternal = vi.fn<(url: string) => Promise<void>>();
  const bridge = new WebviewHostBridge(
    {
      postMessage: (message) => {
        messages.push(message as Record<string, unknown>);
      },
    },
    { dispatch: vi.fn<() => Promise<HostResponse<unknown>>>() },
    async () => {},
    { openExternal },
  );
  bridge.initialize();
  const request = {
    channel: WEBVIEW_CHANNEL,
    type: 'openExternal',
    requestId: 'external-1',
    session: messages[0]!.session,
    url: LICENSE_URL,
  };
  await bridge.receive({ ...request, session: 'forged' });
  expect(openExternal).not.toHaveBeenCalled();
  for (const url of ['https://untrusted.example', 'javascript:alert(1)', undefined]) {
    await bridge.receive({ ...request, requestId: `external-${messages.length}`, url });
    expect(messages.at(-1)).toMatchObject({
      response: { ok: false, error: { code: 'INVALID_INPUT' } },
    });
  }
  expect(openExternal).not.toHaveBeenCalled();
});
