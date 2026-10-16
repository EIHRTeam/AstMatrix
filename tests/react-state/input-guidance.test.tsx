import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { FakeHostAdapter } from '@astmatrix/host-contract';
import { getProfile, profiles } from '@astmatrix/profiles';
import { AstMatrixError } from '@astmatrix/shared';
import { AstMatrixPanel, AstMatrixProviders, useLocale } from '@astmatrix/ui-react';
import { contentPlaceholder } from '../../packages/ui-react/src/input-guidance';
import { engineErrorMessage } from '../../packages/ui-react/src/l10n/engine-errors';
import { translate } from '../../packages/ui-react/src/l10n/messages';
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
function EnglishButton() {
  const { setPreference } = useLocale();
  return <button onClick={() => setPreference('en')}>English test</button>;
}
async function mount(service = new AstMatrixApplicationService()) {
  await act(async () =>
    root.render(
      <AstMatrixProviders
        service={service}
        adapter={new FakeHostAdapter()}
        hostLocale="zh_CN"
        debounceMs={0}
      >
        <AstMatrixPanel />
        <EnglishButton />
      </AstMatrixProviders>,
    ),
  );
}
async function setValue(label: string, value: string) {
  const input = document.querySelector(`[aria-label="${label}"]`)! as
    | HTMLTextAreaElement
    | HTMLSelectElement;
  await act(async () => {
    const isSelect = input instanceof HTMLSelectElement;
    Object.getOwnPropertyDescriptor(
      isSelect ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event(isSelect ? 'change' : 'input', { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
it('provides translated placeholders for every profile and adapts to check digit and HRI policies', () => {
  for (const profile of profiles) {
    const hint = contentPlaceholder(profile);
    expect(hint.startsWith('请输入')).toBe(true);
    expect(translate('en', hint)).not.toMatch(/\p{Script=Han}/u);
  }
  expect(contentPlaceholder(getProfile('ean13-default'))).toContain('13');
  expect(contentPlaceholder(getProfile('ean13-default'), { checkDigit: 'generate' })).toContain(
    '12',
  );
  expect(contentPlaceholder(getProfile('upce-default'))).toContain('0 或 1');
  expect(contentPlaceholder(getProfile('code128-default'))).toContain('ABC_123');
  expect(contentPlaceholder(getProfile('code39-default'))).not.toContain('_');
  expect(contentPlaceholder(getProfile('telepen-default'), { hri: false })).toContain('控制字符');
  expect(contentPlaceholder(getProfile('qr-mobile'))).toContain('https://');
  expect(contentPlaceholder(getProfile('ntin'))).toContain('04150');
});
it('starts empty without validation errors and updates the placeholder when the selected format changes', async () => {
  await mount();
  const content = document.querySelector('textarea')!;
  expect(content.value).toBe('');
  expect(content.placeholder).toContain('13');
  expect(document.querySelector('.barcode-form .hint')).toBeNull();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector('.preview-stage img')).toBeNull();
  expect(document.querySelector('.preview .status')).toBeNull();
  expect(document.body.textContent).not.toContain('等待输入');
  expect(document.body.textContent).not.toContain('当前输入尚未生成有效预览');
  expect(document.querySelector<HTMLButtonElement>('.actions .primary')!.disabled).toBe(true);
  await act(async () => (document.querySelector('.settings input') as HTMLInputElement).click());
  await setValue('校验位策略', 'generate');
  expect(content.placeholder).toContain('12');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await setValue('编码格式', 'code39');
  expect(content.value).toBe('');
  expect(content.placeholder).toContain('大写字母');
  expect(content.placeholder).not.toContain('_');
  await setValue('编码格式', 'code128');
  expect(content.placeholder).toContain('ABC_123');
  await setValue('编码内容', 'USER_VALUE');
  await act(async () =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === 'English test')!
      .click(),
  );
  expect(content.placeholder).toBe('Enter printable ASCII characters, e.g. ABC_123');
  expect(content.value).toBe('USER_VALUE');
});
it.each([
  [
    'CAPACITY_EXCEEDED',
    'bwipp.qrcodeNoValidSymbol#27542: Maximum length exceeded or invalid content',
  ],
  ['MISSING_FONT', 'Font not found: secret-font'],
  ['PROVIDER_ERROR', 'bwipp.badInput: Invalid character in data'],
  ['PROVIDER_ERROR', 'bwipp.invalidOption: Invalid version'],
  ['PROVIDER_REQUEST_MISMATCH', 'internal scene mismatch'],
  ['PROVIDER_ERROR', 'unrecognized private engine traceback'],
])(
  'wraps engine error %s with Chinese and English guidance without exposing raw diagnostics',
  (code, message) => {
    const source = engineErrorMessage({ code, message });
    expect(source).not.toContain(message);
    expect(source).not.toContain('bwipp.');
    expect(source).not.toContain(code);
    expect(translate('en', source)).not.toMatch(/\p{Script=Han}/u);
    expect(translate('en', source)).not.toBe(source);
  },
);
it('localizes engine failures in the visible UI and never leaks provider field diagnostics', async () => {
  const raw = 'bwipp.qrcodeNoValidSymbol#27542: Maximum length exceeded or invalid content';
  const encode = vi.fn<() => never>(() => {
    throw new AstMatrixError('CAPACITY_EXCEEDED', raw, 'provider', { text: raw });
  });
  await mount(new AstMatrixApplicationService({ engineVersion: 'test', encode }));
  await setValue('编码内容', '6901234567892');
  expect(document.body.textContent).toContain('内容过长或不符合当前编码设置');
  expect(document.body.textContent).not.toContain('bwipp.');
  expect(document.body.textContent).not.toContain('CAPACITY_EXCEEDED');
  expect(document.querySelector('.field-error')).toBeNull();
  await act(async () =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === 'English test')!
      .click(),
  );
  expect(document.body.textContent).toContain(
    'The content is too long or cannot be encoded with the current settings',
  );
  expect(document.body.textContent).not.toContain(raw);
  expect(encode).toHaveBeenCalledOnce();
});
