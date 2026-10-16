import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { afterPanelPaint, startHostRefresh } from '../../apps/illustrator-cep/panel/host-refresh';
import type { CSInterfaceLike } from '@astmatrix/host-adapter-illustrator-cep';

afterEach(() => vi.useRealTimers());

function setup(refresh = vi.fn<() => Promise<void>>(() => Promise.resolve())) {
  vi.useFakeTimers();
  const dom = new JSDOM('', { pretendToBeVisual: true });
  const page = dom.window.document;
  let visible = true;
  Object.defineProperty(page, 'hidden', { get: () => !visible });
  const cs: CSInterfaceLike = {
    evalScript: vi.fn<CSInterfaceLike['evalScript']>(),
    getHostEnvironment: () => ({ appId: 'ILST', appVersion: '30.6.0' }),
    getCurrentApiVersion: () => ({ major: 12, minor: 1, micro: 0 }),
    isWindowVisible: vi.fn<() => boolean>(() => {
      throw new Error('Synchronous native visibility queries must not run');
    }),
    addEventListener: vi.fn<NonNullable<CSInterfaceLike['addEventListener']>>(),
    removeEventListener: vi.fn<NonNullable<CSInterfaceLike['removeEventListener']>>(),
  };
  const onError = vi.fn<(error: unknown) => void>();
  const stop = startHostRefresh({ refresh }, cs, page, dom.window as unknown as Window, onError);
  expect(cs.isWindowVisible).not.toHaveBeenCalled();
  return {
    dom,
    page,
    cs,
    refresh,
    onError,
    stop: () => {
      stop();
      dom.window.close();
    },
    hide: (hidden: boolean) => {
      visible = !hidden;
      page.dispatchEvent(new dom.window.Event('visibilitychange'));
    },
  };
}

it('polls only once every 2.5 seconds after completion and suspends while hidden', async () => {
  const env = setup();
  await vi.advanceTimersByTimeAsync(0);
  expect(env.refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2499);
  expect(env.refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(env.refresh).toHaveBeenCalledTimes(2);
  env.hide(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(env.refresh).toHaveBeenCalledTimes(2);
  env.hide(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(env.refresh).toHaveBeenCalledTimes(3);
  env.stop();
  await vi.advanceTimersByTimeAsync(10000);
  expect(env.refresh).toHaveBeenCalledTimes(3);
});

it('defers background host reads while typing or moving the pointer', async () => {
  const env = setup();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2400);
  env.page.dispatchEvent(new env.dom.window.Event('input'));
  await vi.advanceTimersByTimeAsync(300);
  expect(env.refresh).toHaveBeenCalledTimes(1);
  env.page.dispatchEvent(new env.dom.window.Event('pointermove'));
  await vi.advanceTimersByTimeAsync(499);
  expect(env.refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(env.refresh).toHaveBeenCalledTimes(2);
  env.stop();
});

it('never queues more polls behind a slow host request and ignores late errors on disposal', async () => {
  let reject: ((reason: Error) => void) | undefined;
  const refresh = vi.fn<() => Promise<void>>(
    () =>
      new Promise<void>((_resolve, rejectRequest) => {
        reject = rejectRequest;
      }),
  );
  const env = setup(refresh);
  await vi.advanceTimersByTimeAsync(15000);
  env.hide(true);
  env.hide(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledTimes(1);
  env.stop();
  reject!(new Error('Late bridge callback'));
  await vi.advanceTimersByTimeAsync(10000);
  expect(env.onError).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('handles CEP panel visibility events and removes the native listener on disposal', async () => {
  const env = setup();
  const add = vi.mocked(env.cs.addEventListener!);
  const [type, listener] = add.mock.calls[0]!;
  expect(type).toBe('com.adobe.csxs.events.panelWindowStatusChanged');
  listener({ data: 'false' });
  await vi.advanceTimersByTimeAsync(10000);
  expect(env.refresh).not.toHaveBeenCalled();
  listener({ data: 'true' });
  await vi.advanceTimersByTimeAsync(0);
  expect(env.refresh).toHaveBeenCalledTimes(1);
  env.stop();
  expect(env.cs.removeEventListener).toHaveBeenCalledWith(type, listener);
});

it('waits for a UI paint before native work and cancels startup if the panel closes', async () => {
  vi.useFakeTimers();
  const dom = new JSDOM('', { pretendToBeVisual: true });
  const stop = vi.fn<() => void>();
  const start = vi.fn<() => () => void>(() => stop);
  const view = dom.window as unknown as Window;
  const cancel = afterPanelPaint(view, start);
  expect(start).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(17);
  expect(start).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(17);
  expect(start).toHaveBeenCalledOnce();
  cancel();
  expect(stop).toHaveBeenCalledOnce();
  const cancelBeforePaint = afterPanelPaint(view, start);
  cancelBeforePaint();
  await vi.advanceTimersByTimeAsync(100);
  expect(start).toHaveBeenCalledOnce();
  dom.window.close();
});
