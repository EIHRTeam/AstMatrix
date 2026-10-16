import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { FakeHostAdapter } from '@astmatrix/host-contract';
import { LICENSE_URL, PROJECT_URL } from '@astmatrix/shared';
import { AstMatrixProviders } from '@astmatrix/ui-react';
import { HeaderActions } from '../../packages/ui-react/src/header-actions';
import { createCepLinkOpener } from '../../apps/illustrator-cep/panel/external-links';

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

async function renderLinks(
  openExternal?: (url: string) => void | Promise<void>,
  openProject?: () => void | Promise<void>,
  hostLocale = 'zh_CN',
) {
  await act(async () =>
    root.render(
      <AstMatrixProviders
        service={new AstMatrixApplicationService()}
        adapter={new FakeHostAdapter()}
        hostLocale={hostLocale}
        openExternal={openExternal}
        openProject={openProject}
      >
        <HeaderActions />
      </AstMatrixProviders>,
    ),
  );
}
async function openAbout() {
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('.icon-button[title="关于"], .icon-button[title="About"]')!
      .click(),
  );
}
async function click(link: HTMLAnchorElement) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  await act(async () => {
    link.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

it('routes both GitHub links and the license link through the same CEP browser API', async () => {
  const open = vi.fn<(url: string) => number>(() => 0);
  await renderLinks(createCepLinkOpener({ openURLInDefaultBrowser: open }));
  expect(await click(document.querySelector<HTMLAnchorElement>(`a[href="${PROJECT_URL}"]`)!)).toBe(
    true,
  );
  await openAbout();
  expect(
    await click(
      document.querySelector<HTMLAnchorElement>(`.about-dialog a[href="${PROJECT_URL}"]`)!,
    ),
  ).toBe(true);
  const license = document.querySelector<HTMLAnchorElement>('.license-link')!;
  expect(license.href).toBe(LICENSE_URL);
  expect(license.textContent).toBe('Apache License, Version 2.0');
  expect(await click(license)).toBe(true);
  expect(open.mock.calls).toEqual([[PROJECT_URL], [PROJECT_URL], [LICENSE_URL]]);
});

it.each(['zh_CN', 'en_US'])(
  'shows license open failures inside the dialog in %s',
  async (locale) => {
    const open = vi
      .fn<(url: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Native failure'))
      .mockResolvedValue(undefined);
    await renderLinks(open, undefined, locale);
    await openAbout();
    await click(document.querySelector<HTMLAnchorElement>('.license-link')!);
    const error = document.querySelector('.about-dialog [role="alert"]')!;
    expect(error.textContent).toContain(LICENSE_URL);
    expect(error.textContent).toContain(
      locale === 'zh_CN' ? '无法打开许可证链接' : 'Unable to open the license link',
    );
    expect(document.querySelector('.header-error')).toBeNull();
    await click(document.querySelector<HTMLAnchorElement>('.license-link')!);
    expect(document.querySelector('.about-dialog [role="alert"]')).toBeNull();
  },
);

it('retains normal browser links and the existing project-only host callback', async () => {
  const openProject = vi.fn<() => void>();
  await renderLinks(undefined, openProject);
  expect(await click(document.querySelector<HTMLAnchorElement>(`a[href="${PROJECT_URL}"]`)!)).toBe(
    true,
  );
  expect(openProject).toHaveBeenCalledOnce();
  await openAbout();
  const license = document.querySelector<HTMLAnchorElement>('.license-link')!;
  expect(await click(license)).toBe(false);
  expect(license.target).toBe('_blank');
  expect(license.rel).toBe('noopener noreferrer');
  expect(openProject).toHaveBeenCalledOnce();
});

it('reports unavailable or failed native URL opening and rejects unknown destinations', () => {
  const open = vi.fn<(url: string) => number>(() => 201);
  const opener = createCepLinkOpener({ openURLInDefaultBrowser: open });
  expect(() => opener(LICENSE_URL)).toThrow('Unable to open external link');
  expect(() => createCepLinkOpener({})(LICENSE_URL)).toThrow('Unable to open external link');
  expect(() => opener('https://untrusted.example')).toThrow('Unsupported external link');
  expect(open).toHaveBeenCalledExactlyOnceWith(LICENSE_URL);
});
