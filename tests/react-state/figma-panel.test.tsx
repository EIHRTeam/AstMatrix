import { StrictMode, act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { FigmaPluginAdapter, FigmaTransport } from '@astmatrix/host-adapter-figma-plugin';
import { FigmaPluginRuntime } from '@astmatrix/host-adapter-figma-plugin/runtime';
import { LICENSE_URL, PROJECT_URL } from '@astmatrix/shared';
import { FigmaPanel } from '../../apps/figma-plugin/ui/panel';
import { fakeFigma } from '../fixtures/figma';

let adapter: FigmaPluginAdapter | undefined;
let runtime: FigmaPluginRuntime | undefined;
let relayFrame: HTMLIFrameElement | undefined;
afterEach(() => {
  cleanup();
  adapter?.dispose();
  runtime?.dispose();
  adapter = undefined;
  runtime = undefined;
  relayFrame?.remove();
  relayFrame = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

function mountFigmaPanel(sourceKind: 'null' | 'other' = 'other', showDiagnostics = false) {
  const host = fakeFigma();
  if (sourceKind === 'other') {
    relayFrame = document.createElement('iframe');
    document.body.appendChild(relayFrame);
  }
  const source = relayFrame?.contentWindow ?? null;
  runtime = new FigmaPluginRuntime(host.api);
  const activeRuntime = runtime;
  vi.spyOn(window.parent, 'postMessage').mockImplementation((value: unknown) => {
    const packet = value as { pluginMessage: unknown };
    queueMicrotask(() => activeRuntime.receive(packet.pluginMessage));
  });
  host.mock.ui.postMessage.mockImplementation((message) => {
    // The real Figma relay need not be window.parent and can omit the source entirely.
    queueMicrotask(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { pluginMessage: message },
          source,
        }),
      ),
    );
  });
  const transport = new FigmaTransport(window);
  adapter = new FigmaPluginAdapter(transport);
  render(
    <StrictMode>
      <FigmaPanel
        service={new AstMatrixApplicationService()}
        adapter={adapter}
        hostLocale="zh_CN"
        debounceMs={0}
        transport={transport}
        showDiagnostics={showDiagnostics}
      />
    </StrictMode>,
  );
  return host;
}

it.each(['null', 'other'] as const)(
  'enables insertion when native-host event.source is %s',
  async (sourceKind) => {
    const host = mountFigmaPanel(sourceKind);
    await waitFor(() => expect(adapter!.getSnapshot().capabilities.documentOpen).toBe(true));
    fireEvent.input(screen.getByLabelText('编码内容'), { target: { value: '6901234567892' } });
    const insert = screen.getByRole<HTMLButtonElement>('button', { name: '插入文档' });
    await waitFor(() => expect(insert.disabled).toBe(false));
    fireEvent.click(insert);
    await waitFor(() =>
      expect(document.querySelector('.success')?.textContent).toContain('插入成功'),
    );
    expect(host.mock.currentPage.children).toHaveLength(1);
    expect(host.mock.commitUndo).toHaveBeenCalledOnce();
  },
);

it.each(['null', 'other'] as const)(
  'opens GitHub and Apache links when native-host event.source is %s',
  async (sourceKind) => {
    const host = mountFigmaPanel(sourceKind);
    // A click during startup should wait for the handshake, then reach figma.openExternal.
    fireEvent.click(screen.getByRole('link', { name: '打开 GitHub 仓库' }));
    await waitFor(() => expect(host.mock.openExternal).toHaveBeenCalledWith(PROJECT_URL));
    fireEvent.click(screen.getByRole('button', { name: '关于' }));
    fireEvent.click(screen.getByRole('link', { name: 'Apache License, Version 2.0' }));
    await waitFor(() => expect(host.mock.openExternal).toHaveBeenCalledWith(LICENSE_URL));
    expect(host.mock.openExternal).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  },
);

it('keeps a useful connection error but hides diagnostic details in the default release UI', async () => {
  vi.useFakeTimers();
  const host = mountFigmaPanel();
  host.mock.ui.postMessage.mockImplementation(() => {});
  expect(document.body.textContent).toContain('正在连接 Figma…');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(document.body.textContent).toContain('Figma 消息桥未连接，请重新运行插件');
  expect(document.body.textContent).not.toContain('请先打开文档');
  expect(document.querySelector('.figma-connection-diagnostic')).toBeNull();
  expect(document.body.textContent).not.toContain('AstMatrix UI bridge');
});

it('allows diagnostic details only when explicitly enabled for debugging', async () => {
  vi.useFakeTimers();
  const host = mountFigmaPanel('other', true);
  host.mock.ui.postMessage.mockImplementation(() => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(screen.getByRole('alert').textContent).toContain('AstMatrix UI bridge 4');
});
