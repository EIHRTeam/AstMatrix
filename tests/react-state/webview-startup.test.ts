import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import { mockPhotoshop } from '../compatibility/ps-runtime';
import { LICENSE_URL } from '@astmatrix/shared';
import { WEBVIEW_CHANNEL } from '../../apps/photoshop-uxp/src/webview-client';

interface PanelLifecycle {
  create: () => void;
  show: () => void;
  hide: () => void;
  destroy: () => void;
}
let panel: PanelLifecycle | undefined;
let startupCode = '';
afterEach(() => {
  panel?.destroy();
  panel = undefined;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

beforeAll(async () => {
  // Exercise the same CommonJS entry loaded by UXP, with only Adobe modules injected.
  const result = await build({
    configFile: false,
    root: process.cwd(),
    logLevel: 'silent',
    build: {
      target: 'es2020',
      write: false,
      minify: false,
      lib: {
        entry: path.resolve('apps/photoshop-uxp/src/index.ts'),
        formats: ['cjs'],
      },
      rolldownOptions: { external: ['photoshop', 'uxp'] },
    },
    ssr: { noExternal: true },
  });
  if ('close' in result) throw new Error('Unexpected build watcher');
  const bundle = (Array.isArray(result) ? result : [result])
    .flatMap((output) => output.output)
    .find((output) => output.type === 'chunk' && output.isEntry);
  if (!bundle || bundle.type !== 'chunk') throw new Error('Missing CommonJS startup bundle');
  startupCode = bundle.code;
});

function boot({
  photoshopVersion = '27.8.0',
  uxpVersion = 'uxp-9.3.0-uxp',
  messageBridge = true,
  enhanced = true,
  browserError = '',
} = {}) {
  vi.useFakeTimers();
  document.body.innerHTML = `${enhanced ? '<p id="webview-status" style="display: none"></p><webview id="astmatrix-webview" style="display: none"></webview>' : ''}
    <div id="astmatrix-panel"></div>`;
  const webview = document.getElementById('astmatrix-webview');
  const postMessage = vi.fn<(message: unknown) => void>();
  if (webview && messageBridge) Object.assign(webview, { postMessage });
  const env = mockPhotoshop();
  expect(env.ps.app).not.toHaveProperty('version');
  const openExternal = vi.fn<(url: string, text: string) => Promise<string>>(
    async () => browserError,
  );
  const uxp = {
    shell: { openExternal },
    host: { ...env.host, version: photoshopVersion, uiLocale: 'zh_CN' },
    versions: { uxp: uxpVersion },
    entrypoints: {
      setup: (config: { panels: Record<string, PanelLifecycle> }) => {
        panel = config.panels['astmatrix.panel']!;
      },
    },
  };
  const requireHost = (id: string) => {
    if (id === 'photoshop') return env.ps;
    if (id === 'uxp') return uxp;
    throw new Error(`Unexpected host import ${id}`);
  };

  runInNewContext(startupCode, {
    require: requireHost,
    document,
    window,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    TextEncoder,
    TextDecoder,
  });
  return { webview, postMessage, openExternal, root: document.getElementById('astmatrix-panel')! };
}

it.each([
  ['26.0.0', 'uxp-8.0.0'],
  ['27.8.0', 'uxp-9.3.0-uxp'],
])(
  'directly boots WebUI on Photoshop %s / %s without mounting the native UI',
  (photoshopVersion, uxpVersion) => {
    const { webview, postMessage, root } = boot({ photoshopVersion, uxpVersion });
    expect(document.getElementById('use-webview')).toBeNull();
    expect(document.getElementById('use-native')).toBeNull();
    expect(root.style.display).toBe('none');
    expect(root.childElementCount).toBe(0);
    expect(webview!.style.display).toBe('block');
    expect(webview!.getAttribute('src')).toBe('plugin:/webview/index.html');
    webview!.dispatchEvent(new Event('loadstop'));
    expect(document.getElementById('webview-status')!.style.display).toBe('none');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'init', session: expect.any(String), locale: 'zh_CN' }),
    );
    panel!.hide();
    postMessage.mockClear();
    webview!.dispatchEvent(new Event('loadstop'));
    expect(postMessage).not.toHaveBeenCalled();
    panel!.show();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'init' }));
    expect(root.childElementCount).toBe(0);
    expect(root.style.display).toBe('none');
  },
);

it.each([
  { photoshopVersion: '24.0.0' },
  { photoshopVersion: '25.12.0' },
  { uxpVersion: 'uxp-7.4.0' },
  { photoshopVersion: 'unknown' },
  { uxpVersion: 'unknown' },
  { messageBridge: false },
])('automatically uses native UI when local WebView is unavailable: %j', (options) => {
  const { webview, postMessage, root } = boot(options);
  expect(root.style.display).toBe('block');
  expect(root.querySelector('select')).not.toBeNull();
  expect(webview!.style.display).toBe('none');
  expect(webview!.hasAttribute('src')).toBe(false);
  expect(postMessage).not.toHaveBeenCalled();
  expect(document.getElementById('webview-status')!.style.display).toBe('block');
  panel!.hide();
  panel!.show();
  expect(root.querySelector('select')).not.toBeNull();
  expect(postMessage).not.toHaveBeenCalled();
});

it('falls back on load failure and keeps native UI after late load events and panel reopen', () => {
  const { webview, postMessage, root } = boot();
  webview!.dispatchEvent(Object.assign(new Event('loaderror'), { message: 'failed', code: -1 }));
  expect(root.style.display).toBe('block');
  expect(root.querySelector('select')).not.toBeNull();
  expect(webview!.style.display).toBe('none');
  expect(document.getElementById('webview-status')!.textContent).toContain('已回退原生面板');
  postMessage.mockClear();
  webview!.dispatchEvent(new Event('loadstart'));
  webview!.dispatchEvent(new Event('loadstop'));
  panel!.hide();
  panel!.show();
  expect(root.style.display).toBe('block');
  expect(root.querySelector('select')).not.toBeNull();
  expect(
    postMessage.mock.calls.some(([message]) => (message as { type: string }).type === 'init'),
  ).toBe(false);
});

it('defers fallback mounting while hidden until the panel is shown', () => {
  const { webview, root } = boot();
  panel!.hide();
  webview!.dispatchEvent(new Event('loaderror'));
  expect(root.childElementCount).toBe(0);
  panel!.show();
  expect(root.querySelector('select')).not.toBeNull();
  expect(webview!.style.display).toBe('none');
});

it('keeps the legacy native-only package functional without a WebView element', () => {
  const { webview, root } = boot({ enhanced: false, photoshopVersion: '24.0.0' });
  expect(webview).toBeNull();
  expect(root.querySelector('select')).not.toBeNull();
  panel!.hide();
  panel!.show();
  expect(root.querySelector('select')).not.toBeNull();
});

it.each([
  '',
  'null',
  'https://example.com',
  'plugin:/',
  'plugin:/other.html',
  'plugin:/webview/index.html.evil',
  'plugin:/webview/index.html?untrusted=1',
  'plugin:/webview/index.html#untrusted',
  'plugin:/webview/%69ndex.html',
  'plugin-data:/webview/index.html',
  'plugin-temp:/webview/index.html',
  'file:///webview/index.html',
])('rejects WebView messages from origin %j before handling their payload', async (origin) => {
  const { postMessage, openExternal } = boot();
  const session = (postMessage.mock.calls[0]![0] as { session: string }).session;
  const request = {
    channel: WEBVIEW_CHANNEL,
    type: 'openExternal',
    requestId: 'external-license',
    session,
    url: LICENSE_URL,
  };
  postMessage.mockClear();
  window.dispatchEvent(
    new MessageEvent('message', {
      origin,
      data: { channel: WEBVIEW_CHANNEL, type: 'hello' },
    }),
  );
  window.dispatchEvent(new MessageEvent('message', { origin, data: request }));
  await vi.advanceTimersByTimeAsync(0);
  expect(openExternal).not.toHaveBeenCalled();
  expect(postMessage).not.toHaveBeenCalled();

  // A rejected sender must not consume the legitimate client's request ID.
  window.dispatchEvent(
    new MessageEvent('message', { origin: 'plugin:/webview/index.html', data: request }),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(LICENSE_URL, expect.any(String));
  expect(postMessage).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ type: 'response', response: expect.objectContaining({ ok: true }) }),
  );
});

it('accepts the bundled WebView handshake and stops receiving messages after destruction', () => {
  const { postMessage } = boot();
  const hello = () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'plugin:/webview/index.html',
        data: { channel: WEBVIEW_CHANNEL, type: 'hello' },
      }),
    );
  postMessage.mockClear();
  hello();
  expect(postMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'init' }));
  panel!.destroy();
  panel = undefined;
  postMessage.mockClear();
  hello();
  expect(postMessage).not.toHaveBeenCalled();
});

it.each(['', 'Browser launch failed'])(
  'opens the license in the host browser without falling back when the host returns %j',
  async (browserError) => {
    const { webview, postMessage, openExternal, root } = boot({ browserError });
    const session = (postMessage.mock.calls[0]![0] as { session: string }).session;
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'plugin:/webview/index.html',
        data: {
          channel: WEBVIEW_CHANNEL,
          type: 'openExternal',
          requestId: 'external-license',
          session,
          url: LICENSE_URL,
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(LICENSE_URL, expect.any(String));
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'response',
        response: expect.objectContaining({ ok: !browserError }),
      }),
    );
    expect(root.style.display).toBe('none');
    expect(root.childElementCount).toBe(0);
    expect(webview!.style.display).toBe('block');
  },
);
