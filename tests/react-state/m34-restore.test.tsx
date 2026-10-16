import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { FakeHostAdapter } from '@astmatrix/host-contract';
import type { HostAdapter } from '@astmatrix/host-contract';
import { AstMatrixPanel, AstMatrixProviders } from '@astmatrix/ui-react';
const service = new AstMatrixApplicationService();
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
async function mount(read: HostAdapter['readSelectedMetadata']) {
  const fake = new FakeHostAdapter();
  const adapter: HostAdapter = {
    id: 'illustrator-cep',
    getSnapshot: fake.getSnapshot,
    subscribe: fake.subscribe,
    insert: fake.insert.bind(fake),
    readSelectedMetadata: read,
  };
  await act(async () =>
    root.render(
      <AstMatrixProviders service={service} adapter={adapter} hostLocale="zh_CN" debounceMs={0}>
        <AstMatrixPanel />
      </AstMatrixProviders>,
    ),
  );
  await act(async () => {
    const input = document.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      '6901234567892',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}
it('Web host UI keeps generation and insertion available without the selection restore controls', async () => {
  const read = vi.fn<HostAdapter['readSelectedMetadata']>(async () => null);
  await mount(read);
  expect(read).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('读取选中对象参数');
  expect(document.body.textContent).not.toContain('Illustrator · CEP');
  expect(document.body.textContent).not.toContain('离线编码 · 可编辑矢量');
  expect(document.body.textContent).not.toContain('01 / 编码参数');
  expect(document.body.textContent).not.toContain('02 /');
  expect(document.body.textContent).not.toContain('切换预设时保留兼容字段');
  expect(document.body.textContent).not.toContain('默认校验完整 GTIN');
  expect(document.querySelector('.metrics')).toBeNull();
  expect(document.querySelector<HTMLImageElement>('.preview-stage img')).not.toBeNull();
  const insert = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === '插入文档',
  )!;
  expect(insert.disabled).toBe(false);
  await act(async () => insert.click());
  expect(document.body.textContent).toContain('插入成功');
  expect(document.body.textContent).not.toContain('模拟插入文档');
});
