import { expect, it, vi } from 'vitest';
import { AstMatrixApplicationService, PreviewController, InsertController } from './index';
import { ENGINE_VERSION, encodeNormalized } from '@astmatrix/barcode-core';
import {
  FakeHostAdapter,
  validateEnvelope,
  validateResponse,
  updatePlacedObject,
} from '@astmatrix/host-contract';
import { basicSamples } from '../../../tests/fixtures/core-samples';
import type { NormalizedRequest } from '@astmatrix/profiles';
import type { VectorScene } from '@astmatrix/vector-ir';
const input = (text: string) => ({ ...basicSamples[3]!, fields: { text } });
const flush = () =>
  Array.from({ length: 12 }).reduce<Promise<void>>(
    (promise) => promise.then(() => {}),
    Promise.resolve(),
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function delayed() {
  const tasks = new Map<
    string,
    { request: NormalizedRequest; task: ReturnType<typeof deferred<VectorScene>> }
  >();
  const encode = vi.fn<(request: NormalizedRequest) => Promise<VectorScene>>(
    (request: NormalizedRequest) => {
      const task = deferred<VectorScene>();
      tasks.set(request.text, { request, task });
      return task.promise;
    },
  );
  const service = new AstMatrixApplicationService({ engineVersion: ENGINE_VERSION, encode });
  return {
    service,
    tasks,
    encode,
    complete: (text: string) => {
      const t = tasks.get(text)!;
      t.task.resolve(encodeNormalized(t.request));
    },
  };
}
it('deduplicates full normalized requests, isolates style/size/profile, freezes cached Scenes and bounds LRU', async () => {
  const encode = vi.fn<typeof encodeNormalized>(encodeNormalized),
    service = new AstMatrixApplicationService({ engineVersion: ENGINE_VERSION, encode }, 2);
  const a = service.generate(input('A')),
    b = service.generate(input('A'));
  expect(a).toBe(b);
  expect((await a).scene).toBe((await b).scene);
  expect(encode).toHaveBeenCalledTimes(1);
  const first = await a;
  expect(Object.isFrozen(first.scene.nodes[0]!.geometry)).toBe(true);
  for (const fields of [
    { text: 'A', moduleMm: 0.5 },
    { text: 'A', foreground: 'FF0000' },
    { text: 'A', ecc: 'H' },
  ])
    await service.generate({ ...input('A'), fields });
  expect(service.cacheSize).toBe(2);
  expect(encode).toHaveBeenCalledTimes(4);
  expect(service.key(first.request)).not.toBe(
    new AstMatrixApplicationService({ engineVersion: 'different', encode }).key(first.request),
  );
  expect(service.restore(first.scene.metadata)).toEqual(first.scene.metadata.request);
});
it('failed generations are evicted and may be retried', async () => {
  const encode = vi.fn<typeof encodeNormalized>(encodeNormalized).mockImplementationOnce(() => {
    throw new Error('boom');
  });
  const service = new AstMatrixApplicationService({ engineVersion: ENGINE_VERSION, encode });
  await expect(service.generate(input('A'))).rejects.toThrow('boom');
  await expect(service.generate(input('A'))).resolves.toHaveProperty('svg');
  expect(encode).toHaveBeenCalledTimes(2);
});
for (const outcome of ['success', 'failure'])
  it(`rejects stale ${outcome}, immediately invalidates ready, and releases subscriptions`, async () => {
    const d = delayed(),
      preview = new PreviewController(d.service),
      listener = vi.fn<() => void>();
    const unsubscribe = preview.subscribe(listener);
    preview.request(input('A'));
    preview.request(input('B'));
    await flush();
    d.complete('B');
    await flush();
    expect(preview.getSnapshot().status).toBe('ready');
    if (outcome === 'success') d.complete('A');
    else d.tasks.get('A')!.task.reject(new Error('late error'));
    await flush();
    const state = preview.getSnapshot();
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' ? state.barcode.request.text : null).toBe('B');
    preview.request(input(''));
    expect(preview.getSnapshot().status).toBe('error');
    unsubscribe();
    const calls = listener.mock.calls.length;
    preview.request(input('C'));
    await flush();
    preview.dispose();
    d.complete('C');
    await flush();
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(preview.getSnapshot().status).toBe('idle');
  });
it('debounce cancels scheduled jobs before they reach the encoder', async () => {
  const callbacks = new Set<() => void>(),
    d = delayed();
  const preview = new PreviewController(d.service, {
    schedule: (fn) => {
      callbacks.add(fn);
      return () => {
        callbacks.delete(fn);
      };
    },
  });
  preview.request(input('A'));
  preview.request(input('B'));
  expect(callbacks.size).toBe(1);
  callbacks.forEach((fn) => fn());
  await flush();
  expect(d.encode).toHaveBeenCalledTimes(1);
  expect(d.tasks.has('B')).toBe(true);
  preview.dispose();
});
async function ready() {
  const service = new AstMatrixApplicationService(),
    preview = new PreviewController(service),
    adapter = new FakeHostAdapter();
  preview.request(basicSamples[0]!);
  await flush();
  return { service, preview, adapter, insert: new InsertController(adapter, preview) };
}
it('inserts the frozen ready Scene once, rejects double click and guards switched document', async () => {
  const r = await ready(),
    gate = deferred<void>();
  r.adapter.waitBeforeCommit = () => gate.promise;
  const state = r.preview.getSnapshot();
  expect(state.status).toBe('ready');
  const task = r.insert.insert();
  await expect(r.insert.insert()).rejects.toMatchObject({ code: 'HOST_BUSY' });
  expect(r.adapter.insertCalls).toBe(1);
  r.adapter.setDocument('other');
  gate.resolve();
  await expect(task).rejects.toMatchObject({ code: 'DOCUMENT_CHANGED' });
  expect(r.adapter.objects.size).toBe(0);
  r.adapter.waitBeforeCommit = () => Promise.resolve();
  const result = await r.insert.insert();
  expect(r.adapter.objects.get(result.objectId)?.scene).toBe(
    state.status === 'ready' ? state.barcode.scene : null,
  );
  expect(result.documentId).toBe('other');
});
for (const change of ['input', 'dispose', 'close', 'switch-back'])
  it(`protects commit against ${change}`, async () => {
    const r = await ready(),
      gate = deferred<void>();
    r.adapter.waitBeforeCommit = () => gate.promise;
    const task = r.insert.insert();
    if (change === 'input') r.preview.request(input('new'));
    else if (change === 'dispose') r.insert.dispose();
    else if (change === 'close') r.adapter.setDocument(null);
    else {
      r.adapter.setDocument('other');
      r.adapter.setDocument('demo-document');
    }
    gate.resolve();
    await expect(task).rejects.toMatchObject({
      code: change === 'input' || change === 'dispose' ? 'CANCELLED' : 'DOCUMENT_CHANGED',
    });
    expect(r.adapter.objects.size).toBe(0);
  });
for (const failure of ['provider-independent-host', 'partial-rollback', 'rollback-failed'] as const)
  it(`reports truthful ${failure} with retry`, async () => {
    const r = await ready();
    r.adapter.failure = failure;
    const code =
      failure === 'provider-independent-host'
        ? 'PERMISSION_DENIED'
        : failure === 'partial-rollback'
          ? 'PARTIAL_INSERT_ROLLED_BACK'
          : 'ROLLBACK_FAILED';
    await expect(r.insert.insert()).rejects.toMatchObject({ code });
    expect(r.adapter.objects.size).toBe(failure === 'rollback-failed' ? 1 : 0);
    const state = r.insert.getSnapshot();
    expect(
      state.status === 'error' && 'cleanupError' in state.error
        ? state.error.cleanupError
        : undefined,
    ).toBe(failure === 'rollback-failed' ? '模拟删除对象失败' : undefined);
    r.adapter.failure = 'none';
    await expect(r.insert.insert()).resolves.toHaveProperty('objectId');
  });
it('capability and protocol validation fail closed, including unsupported update and metadata', async () => {
  const r = await ready();
  r.adapter.setDocument(null);
  expect(r.insert.reason()).toContain('文档');
  await expect(r.insert.insert()).rejects.toMatchObject({ code: 'NO_DOCUMENT' });
  r.adapter.setDocument('demo');
  r.adapter.setCapabilities({ canInsertNativeVector: false });
  await expect(r.insert.insert()).rejects.toMatchObject({ code: 'UNSUPPORTED_FEATURE' });
  const scene = (await r.service.generate(basicSamples[0]!)).scene;
  await expect(
    updatePlacedObject(r.adapter, 'object', scene, {
      documentId: 'demo',
      documentRevision: 1,
      placement: 'center',
      isCurrent: () => true,
    }),
  ).rejects.toMatchObject({ code: 'UNSUPPORTED_FEATURE' });
  const envelope = {
    requestId: 'req-1',
    operation: 'insert',
    payloadVersion: 1,
    payload: { scene, documentId: 'demo', documentRevision: 1, placement: 'center' },
  };
  expect(() => validateEnvelope(envelope)).not.toThrow(Error);
  for (const invalid of [
    { ...envelope, operation: 'eval' },
    { ...envelope, payloadVersion: 2 },
    {
      ...envelope,
      payload: { ...envelope.payload, scene: { ...scene, metadata: { schemaVersion: 1 } } },
    },
    { ...envelope, payload: { ...envelope.payload, objectId: 'extra' } },
  ])
    expect(() => validateEnvelope(invalid)).toThrow(Error);
  expect(() => validateResponse({ requestId: 'other', ok: true, result: {} }, 'req-1')).toThrow(
    Error,
  );
});

it('restores earlier pre-release metadata from the same locked engine while rejecting unknown versions', async () => {
  const service = new AstMatrixApplicationService();
  const generated = await service.generate(basicSamples[0]!);
  const legacy = {
    ...generated.scene.metadata,
    engineVersion: ENGINE_VERSION.replace('provider:m7-v1', 'provider:m1-v1'),
  };
  expect(service.restore(legacy)).toEqual(generated.scene.metadata.request);
  expect((await service.generate(service.restore(legacy))).svg).toBe(generated.svg);
  expect(() => service.restore({ ...legacy, engineVersion: 'different-engine' })).toThrow('不同');
});
