import { afterEach, expect, it, vi } from 'vitest';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import { mockPhotoshop } from '../compatibility/ps-runtime';

let destroy: (() => void) | undefined;
afterEach(() => {
  destroy?.();
  destroy = undefined;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

it('boots enhanced WebUI using UXP host information without Photoshop app.version', async () => {
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
  vi.useFakeTimers();
  document.body.innerHTML = `
    <button id="use-webview">WebUI</button><button id="use-native">原生面板</button>
    <p id="webview-status"></p><webview id="astmatrix-webview"></webview>
    <div id="astmatrix-panel"></div>`;
  const webview = document.getElementById('astmatrix-webview')!;
  const postMessage = vi.fn<(message: unknown) => void>();
  Object.assign(webview, { postMessage });
  const env = mockPhotoshop();
  expect(env.ps.app).not.toHaveProperty('version');
  const uxp = {
    host: { ...env.host, uiLocale: 'zh_CN' },
    versions: { uxp: 'uxp-9.3.0-uxp' },
    entrypoints: {
      setup: (config: { panels: Record<string, { destroy: () => void }> }) => {
        destroy = config.panels['astmatrix.panel']!.destroy;
      },
    },
  };
  const requireHost = (id: string) => {
    if (id === 'photoshop') return env.ps;
    if (id === 'uxp') return uxp;
    throw new Error(`Unexpected host import ${id}`);
  };

  runInNewContext(bundle.code, {
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
  expect((document.getElementById('use-webview') as HTMLButtonElement).disabled).toBe(false);
  expect(document.getElementById('astmatrix-panel')!.style.display).toBe('none');
  expect(webview.style.display).toBe('block');
  webview.dispatchEvent(new Event('loadstop'));
  expect(document.getElementById('webview-status')!.textContent).toBe('本地 WebUI · 离线');
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'init', session: expect.any(String), locale: 'zh_CN' }),
  );
});
