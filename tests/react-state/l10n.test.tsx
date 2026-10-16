import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { FakeHostAdapter } from '@astmatrix/host-contract';
import { profiles, profileHint } from '@astmatrix/profiles';
import { AstMatrixPanel, AstMatrixProviders, useLocale } from '@astmatrix/ui-react';
import { LANGUAGE_STORAGE_KEY, resolveLocale } from '../../packages/ui-react/src/l10n';
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('follows the host UI locale in Auto and gives explicit language choices priority', () => {
  expect(resolveLocale('auto', 'zh_CN')).toBe('zh-CN');
  expect(resolveLocale('auto', 'en_US')).toBe('en');
  expect(resolveLocale('auto', 'ja_JP')).toBe('en');
  expect(resolveLocale('en', 'zh_CN')).toBe('en');
  expect(resolveLocale('zh-CN', 'en_US')).toBe('zh-CN');
  expect(resolveLocale('auto')).toBe(/^zh/i.test(navigator.language) ? 'zh-CN' : 'en');
});
it('covers all preset names, dynamic field labels and input guidance in English', () => {
  for (const profile of profiles) {
    for (const source of [
      profile.label,
      profileHint(profile),
      ...profile.fields.map((f) => f.label),
    ]) {
      expect(translate('en', source)).not.toMatch(/\p{Script=Han}/u);
      expect(translate('zh-CN', source)).toBe(source);
    }
  }
  expect(translate('en', '需要 12 位数字')).toBe('Enter 12 digits');
  expect(translate('en', '数值范围为 3–131070')).toBe('The value must be between 3 and 131070');
  expect(translate('en', '需要 13 位数字且校验位正确')).toBe(
    'Enter 13 digits with a valid check digit',
  );
});
function LocaleControls() {
  const { setPreference } = useLocale();
  return (
    <>
      <button onClick={() => setPreference('en')}>English test</button>
      <button onClick={() => setPreference('auto')}>Auto test</button>
    </>
  );
}
it('persists a manual choice, follows updated host locale in Auto and preserves edited content', async () => {
  const service = new AstMatrixApplicationService();
  const adapter = new FakeHostAdapter();
  const render = async (hostLocale: string) => {
    await act(async () =>
      root.render(
        <AstMatrixProviders
          service={service}
          adapter={adapter}
          hostLocale={hostLocale}
          debounceMs={0}
        >
          <AstMatrixPanel />
          <LocaleControls />
        </AstMatrixProviders>,
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  };
  await render('zh_CN');
  const content = document.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      content,
      '4006381333931',
    );
    content.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const svg = document.querySelector('.preview-stage img')!.getAttribute('src');
  await act(async () =>
    document.querySelectorAll('button').forEach((button) => {
      if (button.textContent === 'English test') button.click();
    }),
  );
  expect(document.documentElement.lang).toBe('en');
  expect(content.value).toBe('4006381333931');
  expect(document.querySelector('.preview-stage img')!.getAttribute('src')).toBe(svg);
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  await render('zh_CN');
  expect(document.documentElement.lang).toBe('en');
  await act(async () =>
    document.querySelectorAll('button').forEach((button) => {
      if (button.textContent === 'Auto test') button.click();
    }),
  );
  expect(document.documentElement.lang).toBe('zh-CN');
  await render('en_US');
  expect(document.documentElement.lang).toBe('en');
  expect(content.value).toBe('4006381333931');
});
it('allows language changes when local storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  await act(async () =>
    root.render(
      <AstMatrixProviders
        service={new AstMatrixApplicationService()}
        adapter={new FakeHostAdapter()}
        hostLocale="zh_CN"
      >
        <LocaleControls />
      </AstMatrixProviders>,
    ),
  );
  await act(async () => (document.querySelector('button') as HTMLButtonElement).click());
  expect(document.documentElement.lang).toBe('en');
});

it('navigates the fixed language menu by keyboard and closes it after selection', async () => {
  await act(async () =>
    root.render(
      <AstMatrixProviders
        service={new AstMatrixApplicationService()}
        adapter={new FakeHostAdapter()}
        hostLocale="zh_CN"
      >
        <AstMatrixPanel />
      </AstMatrixProviders>,
    ),
  );
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="语言"]')!;
  await act(async () => trigger.click());
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  const labels = Array.from(menu.querySelectorAll('[role="menuitemradio"]'), (item) =>
    item.textContent!.replace('✓', ''),
  );
  await act(async () =>
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })),
  );
  expect(document.activeElement?.textContent).toBe('English');
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(document.documentElement.lang).toBe('en');
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await act(async () =>
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  const reopened = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(
    Array.from(reopened.querySelectorAll('[role="menuitemradio"]'), (item) =>
      item.textContent!.replace('✓', ''),
    ),
  ).toEqual(labels);
  await act(async () =>
    reopened.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })),
  );
  expect(document.activeElement?.textContent).toContain('Auto');
  await act(async () =>
    reopened.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  expect(document.activeElement?.textContent).toBe('简体中文');
});
