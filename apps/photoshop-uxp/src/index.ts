import { AstMatrixApplicationService } from '@astmatrix/application';
import { PhotoshopAdapter } from '@astmatrix/host-adapter-photoshop-uxp';
import type { PhotoshopRuntime } from '@astmatrix/host-adapter-photoshop-uxp';
import { HostError } from '@astmatrix/host-contract';
import { errorMessage } from '@astmatrix/shared';
import { mountNativePanel } from '@astmatrix/ui-uxp';
import type { UxpElement } from '@astmatrix/ui-uxp';
import { WebviewHostBridge } from './webview-host';
import { localWebviewUnavailableReason } from './webview-support';
interface Entry {
  url: string;
  write: (data: string) => Promise<void>;
  delete: () => Promise<void>;
}
interface Folder {
  createFile: (name: string, options: { overwrite: boolean }) => Promise<Entry>;
}
interface UxpRuntime {
  host: { version: string; uiLocale?: string };
  shell?: { openExternal: (url: string, developerText: string) => Promise<string> };
  versions: { uxp: string };
  storage: {
    localFileSystem: {
      getTemporaryFolder: () => Promise<Folder>;
      getFileForSaving: (name: string, options: { types: string[] }) => Promise<Entry | null>;
    };
  };
  entrypoints: {
    setup: (config: {
      panels: Record<
        string,
        { create: () => void; show: () => void; hide: () => void; destroy: () => void }
      >;
    }) => void;
  };
}
declare const require: (id: string) => unknown;
const ps = require('photoshop') as PhotoshopRuntime,
  uxp = require('uxp') as UxpRuntime;
const service = new AstMatrixApplicationService();
const adapter = new PhotoshopAdapter(ps, uxp.host.version);
const root = document.getElementById('astmatrix-panel');
if (!root) throw new Error('Missing native panel root');
let native: { dispose: () => void } | null = null,
  timer: ReturnType<typeof setInterval> | undefined;
let previewCounter = 0,
  previewFile: Entry | null = null,
  previewChain: Promise<unknown> = Promise.resolve(),
  lastSvg = '',
  lastUrl = '';
const retiredPreviews = new Set<Entry>();
const exportSvg = async (svg: string, name: string) => {
  if (
    svg.length > 8 * 1024 * 1024 ||
    !svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') ||
    !/^[a-z0-9-]+\.svg$/i.test(name)
  )
    throw new HostError('INVALID_INPUT', '无效 SVG 导出参数');
  const file = await uxp.storage.localFileSystem.getFileForSaving(name, { types: ['svg'] });
  if (file) await file.write(svg);
};
const previewSvg = (svg: string, isCurrent: () => boolean): Promise<string> => {
  const task = previewChain.then(async () => {
    if (!isCurrent()) return '';
    if (svg === lastSvg && lastUrl) return lastUrl;
    const folder = await uxp.storage.localFileSystem.getTemporaryFolder();
    const file = await folder.createFile(`astmatrix-preview-${++previewCounter}.svg`, {
      overwrite: true,
    });
    try {
      await file.write(svg);
      if (!isCurrent()) {
        await file.delete();
        return '';
      }
      const previous = previewFile;
      previewFile = file;
      lastSvg = svg;
      lastUrl = file.url;
      if (previous) {
        try {
          await previous.delete();
        } catch (error) {
          retiredPreviews.add(previous);
          console.warn('旧预览清理失败，销毁时重试', errorMessage(error));
        }
      }
      return file.url;
    } catch (error) {
      await file.delete();
      throw error;
    }
  });
  previewChain = task.catch(() => {});
  return task;
};
const startNative = () => {
  if (!native)
    native = mountNativePanel({
      document,
      root: root as unknown as UxpElement,
      service,
      adapter,
      previewSvg,
      exportSvg,
    });
};
const webviewUrl = 'plugin:/webview/index.html';
const status = document.getElementById('webview-status'),
  webview = document.getElementById('astmatrix-webview') as
    | (HTMLElement & { postMessage: (message: unknown) => void })
    | null;
const unavailableReason = webview
  ? localWebviewUnavailableReason(uxp.host.version, uxp.versions.uxp, webview.postMessage)
  : '未配置 WebView';
let useWeb = !unavailableReason,
  visible = true;
const bridge =
  webview && useWeb
    ? new WebviewHostBridge(webview, adapter, exportSvg, {
        locale: uxp.host.uiLocale,
        openExternal: async (url) => {
          if (!uxp.shell) throw new HostError('UNSUPPORTED_FEATURE', '无法打开外部链接');
          const message = /^zh/i.test(uxp.host.uiLocale ?? '')
            ? '在默认浏览器中打开 AstMatrix 外部链接。'
            : 'Open the AstMatrix external link in your default browser.';
          const error = await uxp.shell.openExternal(url, message);
          if (error) throw new HostError('UNKNOWN_HOST_ERROR', error);
        },
      })
    : null;
const showNative = () => {
  useWeb = false;
  root.style.display = 'block';
  if (webview) webview.style.display = 'none';
  bridge?.pause();
  if (visible) startNative();
};
const showWeb = () => {
  if (webview) {
    root.style.display = 'none';
    webview.style.display = 'block';
  }
};
const receiveMessage = (event: MessageEvent) => {
  // UXP reports the content URL as origin; only the bundled UI may invoke host operations.
  if (!useWeb || event.origin !== webviewUrl) return;
  void bridge?.receive(event.data);
};
if (webview) {
  if (unavailableReason) {
    const diagnostic = `${unavailableReason}（Photoshop ${uxp.host.version} / ${uxp.versions.uxp}），使用原生面板`;
    if (status) {
      status.textContent = diagnostic;
      status.style.display = 'block';
    }
    console.warn('AstMatrix WebView:', diagnostic);
    showNative();
  } else {
    webview.addEventListener('loadstart', () => {
      if (!useWeb) return;
      bridge?.reload();
    });
    webview.addEventListener('loadstop', () => {
      if (useWeb && visible) bridge?.initialize();
    });
    webview.addEventListener('loaderror', (event) => {
      if (!useWeb) return;
      const failure = event as Event & { url?: string; code?: number; message?: string };
      const detail = `${failure.message ?? '未知加载错误'}（${failure.code ?? '无错误码'} / ${failure.url ?? webviewUrl}）`;
      if (status) {
        status.textContent = `WebUI 加载失败：${detail}，已回退原生面板`;
        status.style.display = 'block';
      }
      console.warn('AstMatrix WebView:', detail);
      showNative();
    });
    window.addEventListener('message', receiveMessage);
    showWeb();
    // Start navigation only after checking support and registering failure handlers.
    webview.setAttribute('src', webviewUrl);
  }
}
const start = () => {
  visible = true;
  if (useWeb) bridge?.resume();
  else showNative();
  adapter.refresh();
  if (!timer) timer = setInterval(adapter.refresh, 750);
};
const stop = () => {
  visible = false;
  bridge?.pause();
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  native?.dispose();
  native = null;
};
const destroy = () => {
  stop();
  useWeb = false;
  window.removeEventListener('message', receiveMessage);
  adapter.dispose();
  void previewChain.finally(async () => {
    const files = [...retiredPreviews, ...(previewFile ? [previewFile] : [])];
    const results = await Promise.allSettled(files.map((file) => file.delete()));
    results.forEach((result) => {
      if (result.status === 'rejected')
        console.warn('预览资源清理失败', errorMessage(result.reason));
    });
    retiredPreviews.clear();
  });
};
uxp.entrypoints.setup({
  panels: { 'astmatrix.panel': { create: start, show: start, hide: stop, destroy } },
});
void adapter.start().catch((error) => {
  if (status) status.textContent = errorMessage(error);
});
start();
