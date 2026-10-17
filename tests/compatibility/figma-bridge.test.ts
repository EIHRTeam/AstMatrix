import { afterEach, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { FigmaPluginRuntime, startFigmaPlugin } from '@astmatrix/host-adapter-figma-plugin/runtime';
import { FigmaPluginAdapter, FigmaTransport } from '@astmatrix/host-adapter-figma-plugin';
import type { FigmaClientWindow } from '@astmatrix/host-adapter-figma-plugin';
import type { HostEnvelope, HostSnapshot } from '@astmatrix/host-contract';
import {
  FIGMA_CHANNEL,
  normalizeFigmaMessage,
} from '../../packages/host-adapters/figma-plugin/src/protocol';
import { stableStringify } from '@astmatrix/shared';
import { fakeFigma, figmaScene } from '../fixtures/figma';

afterEach(() => vi.useRealTimers());
function runtimeFixture() {
  const host = fakeFigma();
  const runtime = new FigmaPluginRuntime(host.api);
  const send = (message: Record<string, unknown>) =>
    runtime.receive({ channel: FIGMA_CHANNEL, session: runtime.session, ...message });
  const request = (
    id = 'insert-1',
    operation: HostEnvelope['operation'] = 'insert',
  ): HostEnvelope => ({
    requestId: id,
    operation,
    payloadVersion: 1,
    payload:
      operation === 'insert'
        ? {
            scene: figmaScene(),
            documentId: runtime.snapshot().documentId,
            documentRevision: runtime.snapshot().revision,
            placement: 'center',
          }
        : {},
  });
  return { host, runtime, send, request };
}
it('handshakes, waits for commit authorization, replays duplicate results and isolates old sessions', () => {
  const { host, runtime, send, request } = runtimeFixture();
  send({ type: 'hello' });
  expect(host.mock.ui.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'init', snapshot: runtime.snapshot() }),
  );
  const envelope = request();
  send({ type: 'request', requestId: envelope.requestId, envelope });
  expect(host.created).toHaveLength(0);
  expect(host.mock.ui.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'commit-request' }),
  );
  send({ type: 'commit', requestId: envelope.requestId, session: 'old-session' });
  expect(host.created).toHaveLength(0);
  send({ type: 'commit', requestId: envelope.requestId });
  const result = host.mock.ui.postMessage.mock.lastCall![0];
  expect(result.response as Record<string, unknown>).toMatchObject({
    ok: true,
    result: { objectId: 'node-0' },
  });
  const count = host.created.length;
  send({ type: 'request', requestId: envelope.requestId, envelope });
  send({ type: 'commit', requestId: envelope.requestId });
  expect(host.mock.ui.postMessage).toHaveBeenLastCalledWith(result);
  expect(host.created).toHaveLength(count);
  expect(runtime.snapshot().revision).toBe(0);
});
it('rejects concurrent inserts, cancels stale previews and invalidates pending work on page change', () => {
  const { host, runtime, send, request } = runtimeFixture();
  send({ type: 'request', requestId: 'insert-1', envelope: request() });
  send({ type: 'request', requestId: 'insert-2', envelope: request('insert-2') });
  expect(
    (host.mock.ui.postMessage.mock.lastCall![0].response as { error: { code: string } }).error.code,
  ).toBe('HOST_BUSY');
  send({ type: 'cancel', requestId: 'insert-1' });
  send({ type: 'commit', requestId: 'insert-1' });
  expect(host.created).toHaveLength(0);
  send({ type: 'request', requestId: 'insert-3', envelope: request('insert-3') });
  const document = runtime.snapshot().documentId;
  host.changePage();
  expect(runtime.snapshot().documentId).not.toBe(document);
  expect(runtime.snapshot().revision).toBe(1);
  expect(host.mock.ui.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'state', snapshot: runtime.snapshot() }),
  );
  send({ type: 'commit', requestId: 'insert-3' });
  expect(host.created).toHaveLength(0);
});
it('validates unsupported operations, identity, placement and malformed requests', () => {
  const { host, send, request } = runtimeFixture();
  const cases = [
    { ...request('bad-1'), requestId: 'other' },
    { ...request('bad-2'), payloadVersion: 2 },
    { ...request('bad-3'), payload: { ...request().payload, placement: 'selection' } },
    { ...request('bad-4'), payload: { ...request().payload, documentId: 'old-document' } },
    request('bad-5', 'readSelectedMetadata'),
  ];
  for (const [index, envelope] of cases.entries()) {
    send({ type: 'request', requestId: `bad-${index + 1}`, envelope });
    expect((host.mock.ui.postMessage.mock.lastCall![0].response as { ok: boolean }).ok).toBe(false);
  }
  expect(host.created).toHaveLength(0);
});
it('closes pending work without mutation and unregisters host events', () => {
  const { host, runtime, send, request } = runtimeFixture();
  send({ type: 'request', requestId: 'insert-1', envelope: request() });
  host.emit('close');
  send({ type: 'commit', requestId: 'insert-1' });
  expect(host.created).toHaveLength(0);
  expect(runtime.snapshot().documentId).toBeNull();
  expect(host.mock.ui.onmessage).toBeUndefined();
  expect(host.mock.off).toHaveBeenCalledTimes(2);
});

it('keeps a committed success for replay if delivering its first response fails', () => {
  const { host, send, request } = runtimeFixture();
  send({ type: 'request', requestId: 'insert-1', envelope: request() });
  host.mock.ui.postMessage.mockImplementationOnce(() => {
    throw new Error('UI disconnected');
  });
  send({ type: 'commit', requestId: 'insert-1' });
  const count = host.created.length;
  send({ type: 'request', requestId: 'insert-1', envelope: request() });
  expect(host.mock.ui.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      response: expect.objectContaining({ ok: true }),
    }),
  );
  expect(host.created).toHaveLength(count);
  expect(host.mock.commitUndo).toHaveBeenCalledOnce();
});

function connectedFixture(
  relayRealm: 'local' | 'foreign' | 'null-prototype' = 'local',
  sourceKind: 'parent' | 'other' = 'parent',
) {
  const f = runtimeFixture();
  const relay = (value: unknown): unknown => {
    if (relayRealm === 'foreign')
      return runInNewContext('JSON.parse(payload)', { payload: JSON.stringify(value) });
    if (relayRealm === 'null-prototype') {
      const strip = (item: unknown): unknown => {
        if (Array.isArray(item)) return item.map(strip);
        if (item && typeof item === 'object')
          return Object.assign(
            Object.create(null),
            Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, strip(entry)])),
          );
        return item;
      };
      return strip(value);
    }
    return value;
  };
  let receive: (event: MessageEvent) => void = () => {};
  const messages: Record<string, unknown>[] = [];
  const parent = {
    postMessage: vi.fn<(value: unknown) => void>((value) => {
      const packet = value as { pluginMessage: Record<string, unknown> };
      messages.push(packet.pluginMessage);
      queueMicrotask(() => f.runtime.receive(relay(packet.pluginMessage)));
    }),
  };
  const window: FigmaClientWindow = {
    parent,
    addEventListener: (_type, listener) => {
      receive = listener;
    },
    removeEventListener: vi.fn<() => void>(),
  };
  const nativeRelay = {};
  const deliver = (
    message: unknown,
    source: unknown = sourceKind === 'other' ? nativeRelay : parent,
  ) => receive({ source, data: { pluginMessage: relay(message) } } as MessageEvent);
  f.host.mock.ui.postMessage.mockImplementation((message) => {
    queueMicrotask(() => deliver(message));
  });
  const transport = new FigmaTransport(window);
  const adapter = new FigmaPluginAdapter(transport);
  return { ...f, transport, adapter, messages, deliver, window };
}
it('connects the actual client and runtime, preserves success on self-selection, and pushes page state', async () => {
  const f = connectedFixture();
  try {
    await f.adapter.refresh();
    const snapshot = f.adapter.getSnapshot();
    expect(snapshot.capabilities.canUpdatePlacedObject).toBe(false);
    expect(snapshot.capabilities.supportsEditableText).toBe(false);
    const result = await f.adapter.insert(figmaScene(), {
      documentId: snapshot.documentId!,
      documentRevision: snapshot.revision,
      placement: 'center',
      isCurrent: () => true,
    });
    expect(result.objectId).toBe('node-0');
    expect(f.messages.some((m) => m.type === 'commit')).toBe(true);
    expect(await f.adapter.readSelectedMetadata()).toBeNull();
    f.host.changePage();
    await Promise.resolve();
    expect(f.adapter.getSnapshot().revision).toBe(1);
  } finally {
    f.adapter.dispose();
  }
});

it.each(['foreign', 'null-prototype'] as const)(
  'accepts %s objects from a non-parent relay for initialization, insertion and external links',
  async (realm) => {
    const f = connectedFixture(realm, 'other');
    try {
      await f.adapter.refresh();
      expect(f.transport.getConnectionSnapshot().status).toBe('connected');
      const snapshot = f.adapter.getSnapshot();
      const result = await f.adapter.insert(figmaScene(), {
        documentId: snapshot.documentId!,
        documentRevision: snapshot.revision,
        placement: 'center',
        isCurrent: () => true,
      });
      expect(result.objectId).toBe('node-0');
      await f.transport.openExternal('https://github.com/EIHRTeam/AstMatrix');
      expect(f.host.mock.openExternal).toHaveBeenCalledOnce();
    } finally {
      f.adapter.dispose();
    }
  },
);

it('normalizes plain containers without silently dropping invalid wire values', () => {
  const value = runInNewContext(
    '({ nested: { value: 1 }, invalid: undefined, date: new Date(0) })',
  ) as Record<string, unknown>;
  const normalized = normalizeFigmaMessage(value) as Record<string, unknown>;
  expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(normalized.nested)).toBe(Object.prototype);
  expect(normalized).toHaveProperty('invalid', undefined);
  expect(normalized.date).toBe(value.date);
  expect(() => stableStringify(normalized)).toThrow('Expected plain JSON data');
});

it('reports initialization validation errors instead of silently keeping an empty document snapshot', async () => {
  const f = connectedFixture();
  try {
    await f.adapter.refresh();
    f.deliver({
      channel: FIGMA_CHANNEL,
      session: f.runtime.session,
      type: 'init',
      snapshot: { ...f.runtime.snapshot(), revision: 'invalid' },
    });
    expect(f.transport.getConnectionSnapshot()).toMatchObject({
      status: 'error',
      details: expect.stringContaining('无效宿主状态'),
    });
  } finally {
    f.adapter.dispose();
  }
});

it('reports a bridge timeout even before the first insertion or link click', async () => {
  vi.useFakeTimers();
  const f = connectedFixture();
  f.host.mock.ui.postMessage.mockImplementation(() => {});
  try {
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.transport.getConnectionSnapshot()).toMatchObject({
      status: 'error',
      details: expect.stringContaining('No valid init'),
    });
  } finally {
    f.adapter.dispose();
  }
});

it('proactively initializes the UI and exposes startup errors', () => {
  const host = fakeFigma();
  const api = Object.assign(host.api, {
    showUI: vi.fn<(html: string, options: { width: number; height: number }) => void>(),
  });
  const runtime = startFigmaPlugin(api, '<html></html>');
  expect(host.mock.ui.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'init', bridgeVersion: '4' }),
  );
  runtime?.dispose();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    host.mock.on.mockImplementationOnce(() => {
      throw new Error('Host initialization failed');
    });
    expect(startFigmaPlugin(api, '<html></html>')).toBeNull();
    expect(log).toHaveBeenCalledWith(
      '[AstMatrix] Figma startup failed:',
      'Host initialization failed',
    );
    expect(host.mock.ui.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'startup-error', message: 'Host initialization failed' }),
    );
  } finally {
    log.mockRestore();
  }
});
it('checks preview freshness again at the commit handshake and rejects unrelated channels and old sessions', async () => {
  const f = connectedFixture();
  try {
    await f.adapter.refresh();
    const envelope = f.request();
    let current = true;
    const pending = f.transport.request(envelope, () => current);
    current = false;
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    const snapshot = f.adapter.getSnapshot();
    f.deliver(
      {
        channel: 'unrelated-plugin-channel',
        session: f.runtime.session,
        type: 'state',
        snapshot: { ...snapshot, revision: 99 },
      },
      {},
    );
    f.deliver({
      channel: FIGMA_CHANNEL,
      session: 'old',
      type: 'state',
      snapshot: { ...snapshot, revision: 99 },
    });
    expect(f.adapter.getSnapshot()).toBe(snapshot);
    expect(f.host.created).toHaveLength(0);
  } finally {
    f.adapter.dispose();
  }
});
it('returns cancellation when the preview changes after preparation but before commit', async () => {
  const f = connectedFixture();
  try {
    await f.adapter.refresh();
    let current = true;
    f.host.mock.ui.postMessage.mockImplementation((message) => {
      if (message.type === 'commit-request') current = false;
      queueMicrotask(() => f.deliver(message));
    });
    const result = await f.transport.request(f.request(), () => current);
    expect(result).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(f.messages.some((m) => m.type === 'cancel')).toBe(true);
    expect(f.host.created).toHaveLength(0);
  } finally {
    f.adapter.dispose();
  }
});
it('rejects pending calls on close and cleans up transport listeners', async () => {
  const f = connectedFixture();
  await f.adapter.refresh();
  f.host.mock.ui.postMessage.mockImplementation(() => {});
  const pending = f.transport.request(f.request());
  await Promise.resolve();
  f.adapter.dispose();
  await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(f.window.removeEventListener).toHaveBeenCalledOnce();
});
it('does not overwrite a pushed page snapshot with an older capabilities response', async () => {
  const f = connectedFixture();
  try {
    await f.adapter.refresh();
    const previous = f.runtime.snapshot();
    f.host.mock.ui.postMessage.mockImplementation((message) => {
      if (message.type !== 'response') return;
      f.deliver({
        channel: FIGMA_CHANNEL,
        session: f.runtime.session,
        type: 'state',
        snapshot: { ...previous, revision: 2 } satisfies HostSnapshot,
      });
      queueMicrotask(() => f.deliver(message));
    });
    await f.adapter.refresh();
    expect(f.adapter.getSnapshot().revision).toBe(2);
  } finally {
    f.adapter.dispose();
  }
});
