import { createContext, useContext, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import * as Dialog from 'radix-ui/dialog';
import * as Popover from 'radix-ui/popover';
import { LICENSE_URL, PROJECT_URL, PROJECT_VERSION } from '@astmatrix/shared';
import { useLocale } from './l10n';
import type { LanguagePreference } from './l10n';

export const ProjectLinkContext = createContext<(() => void | Promise<void>) | undefined>(
  undefined,
);
export const ExternalLinkContext = createContext<
  ((url: string) => void | Promise<void>) | undefined
>(undefined);
const githubIcon = new URL('./assets/GitHub_Invertocat_Black.svg', import.meta.url).href;
function LanguageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18" />
    </svg>
  );
}
function AboutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v7M12 7v1" />
    </svg>
  );
}
function ExternalLink({
  href,
  label,
  title,
  children,
  className,
  onError,
}: {
  href: string;
  label?: string;
  title?: string;
  children: ReactNode;
  className?: string;
  onError: (url: string | null) => void;
}) {
  const openExternal = useContext(ExternalLinkContext);
  const openProject = useContext(ProjectLinkContext);
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    onError(null);
    const callback = openExternal
      ? () => openExternal(href)
      : href === PROJECT_URL
        ? openProject
        : undefined;
    if (!callback) return;
    event.preventDefault();
    try {
      void Promise.resolve(callback()).catch(() => onError(href));
    } catch {
      onError(href);
    }
  };
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={title}
      onClick={open}
    >
      {children}
    </a>
  );
}
const languages: { value: LanguagePreference; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];
function LanguageMenu() {
  const { preference, setPreference, t } = useLocale();
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tabExit = useRef(false);
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      tabExit.current = true;
      trigger.current?.focus();
      setOpen(false);
      return;
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % items.length
            : event.key === 'ArrowUp'
              ? (current + items.length - 1) % items.length
              : event.key.length === 1
                ? languages.findIndex((item) =>
                    item.label.toLowerCase().startsWith(event.key.toLowerCase()),
                  )
                : -1;
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        ref={trigger}
        className="icon-button"
        aria-haspopup="menu"
        aria-label={t('语言')}
        title={t('语言')}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <LanguageIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={content}
          className="language-menu"
          role="menu"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label={t('语言')}
          onKeyDown={navigate}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            content.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (tabExit.current) {
              event.preventDefault();
              tabExit.current = false;
            }
          }}
        >
          {languages.map((language) => (
            <button
              key={language.value}
              type="button"
              className="language-option"
              role="menuitemradio"
              aria-checked={preference === language.value}
              onClick={() => {
                setPreference(language.value);
                setOpen(false);
              }}
            >
              <span>{language.label}</span>
              {preference === language.value ? <span aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function HeaderActions() {
  const { t } = useLocale();
  const [linkError, setLinkError] = useState<string | null>(null);
  return (
    <div className="header-actions">
      <LanguageMenu />
      <ExternalLink
        href={PROJECT_URL}
        label={t('打开 GitHub 仓库')}
        title="GitHub"
        className="icon-button"
        onError={setLinkError}
      >
        <img src={githubIcon} className="github-icon" alt="" />
      </ExternalLink>
      <Dialog.Root>
        <Dialog.Trigger className="icon-button" aria-label={t('关于')} title={t('关于')}>
          <AboutIcon />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="about-overlay" />
          <Dialog.Content className="about-dialog">
            <Dialog.Title>{t('关于 AstMatrix')}</Dialog.Title>
            <Dialog.Description>
              {t('轻量而强大的多编码格式条形码与二维码生成器')}
            </Dialog.Description>
            <p>
              {t('版本')} v{PROJECT_VERSION}
            </p>
            <p>
              Copyright © 2026 Endfield Industries Human Resource Team,
              <br />
              Licensed under the{' '}
              <ExternalLink className="license-link" href={LICENSE_URL} onError={setLinkError}>
                Apache License, Version 2.0
              </ExternalLink>
              .
            </p>
            {linkError === LICENSE_URL ? (
              <div className="error" role="alert">
                {t('无法打开许可证链接，请在浏览器中访问：')} {LICENSE_URL}
              </div>
            ) : null}
            <ExternalLink
              href={PROJECT_URL}
              label={t('打开 GitHub 仓库')}
              title="GitHub"
              onError={setLinkError}
            >
              GitHub
            </ExternalLink>
            <Dialog.Close className="about-close">{t('关闭')}</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {linkError === PROJECT_URL ? (
        <p className="header-error" role="alert">
          {t('无法打开 GitHub，请在浏览器中访问：')} {PROJECT_URL}
        </p>
      ) : null}
    </div>
  );
}
