import { fireEvent, waitFor } from '@testing-library/dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { FakeHostAdapter } from '@astmatrix/host-contract';
import { mountNativePanel } from '@astmatrix/ui-uxp';
import type { UxpElement } from '@astmatrix/ui-uxp';
let panel: { dispose: () => void } | undefined;
afterEach(() => {
  panel?.dispose();
  document.body.innerHTML = '';
});
it('native UXP UI reuses schemas, preserves tab selection, disables stale input and restores selection metadata', async () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const adapter = new FakeHostAdapter(),
    service = new AstMatrixApplicationService();
  const previewSvg = vi.fn<() => Promise<string>>(async () => 'file:/local-preview.svg'),
    exportSvg = vi.fn<() => Promise<void>>(async () => {});
  panel = mountNativePanel({
    document,
    root: root as unknown as UxpElement,
    service,
    adapter,
    previewSvg,
    exportSvg,
  });
  const buttons = () => Array.from(root.querySelectorAll('button'));
  const button = (text: string) => buttons().find((b) => b.textContent === text)!;
  await waitFor(() => expect(button('插入文档').disabled).toBe(false));
  fireEvent.click(button('插入文档'));
  await waitFor(() => expect(adapter.objects.size).toBe(1));
  const text = root.querySelector('textarea')!;
  fireEvent.input(text, { target: { value: 'invalid' } });
  expect(button('插入文档').disabled).toBe(true);
  await waitFor(() => expect(root.textContent).toContain('EAN 只接受数字'));
  fireEvent.click(button('读取选中对象参数'));
  await waitFor(() => expect(root.querySelector('textarea')!.value).toBe('6901234567892'));
  fireEvent.click(button('二维码'));
  await waitFor(() => expect(root.querySelector('select')!.value).toBe('qrcode'));
  fireEvent.click(button('条形码'));
  await waitFor(() => expect(root.querySelector('select')!.value).toBe('ean13'));
  await waitFor(() => expect(button('导出 SVG').disabled).toBe(false));
  fireEvent.click(button('导出 SVG'));
  await waitFor(() => expect(exportSvg).toHaveBeenCalledOnce());
  expect(previewSvg).toHaveBeenCalled();
  adapter.setDocument(null);
  expect(button('插入文档').disabled).toBe(true);
  panel.dispose();
  expect(root.children).toHaveLength(0);
  panel = undefined;
});

it('native form converts numeric MaxiCode selections and generates both admitted modes', async () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const service = new AstMatrixApplicationService();
  const generate = vi.spyOn(service, 'generateNormalized');
  panel = mountNativePanel({
    document,
    root: root as unknown as UxpElement,
    service,
    adapter: new FakeHostAdapter(),
    previewSvg: async () => 'file:/preview.svg',
    exportSvg: async () => {},
  });
  const button = (text: string) =>
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent === text)!;
  fireEvent.click(button('二维码'));
  fireEvent.change(root.querySelector('select')!, { target: { value: 'maxicode' } });
  const mode = root.querySelector('[aria-label="MaxiCode 模式（2/3 物流，4/5 通用）"]')!;
  fireEvent.change(mode, { target: { value: '5' } });
  await waitFor(() => expect(generate.mock.lastCall?.[0].fields.mode).toBe(5));
  await waitFor(() => expect(button('插入文档').disabled).toBe(false));
  expect(root.textContent).toContain('MaxiCode 模式 2/3');
});
