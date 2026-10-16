import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { translate } from './messages';
import type { Locale } from './messages';
export type LanguagePreference = 'auto' | Locale;
export const LANGUAGE_STORAGE_KEY = 'astmatrix.language';
export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || value === 'zh-CN' || value === 'en';
}
export function resolveLocale(preference: LanguagePreference, hostLocale?: string): Locale {
  if (preference !== 'auto') return preference;
  const language = hostLocale || (typeof navigator === 'undefined' ? 'en' : navigator.language);
  return /^zh(?:[-_]|$)/i.test(language) ? 'zh-CN' : 'en';
}
function readPreference(): LanguagePreference {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguagePreference(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}
const LocaleContext = createContext({
  locale: 'zh-CN' as Locale,
  preference: 'auto' as LanguagePreference,
  setPreference: (_value: LanguagePreference) => {},
  t: (source: string) => source,
});
export function LocaleProvider({
  hostLocale,
  children,
}: {
  hostLocale?: string;
  children: ReactNode;
}) {
  const [preference, setLanguage] = useState(readPreference);
  const locale = resolveLocale(preference, hostLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setPreference = useCallback((value: LanguagePreference) => {
    setLanguage(value);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
    } catch {
      // The language still works for this panel when storage is unavailable.
    }
  }, []);
  const value = useMemo(
    () => ({
      locale,
      preference,
      setPreference,
      t: (source: string) => translate(locale, source),
    }),
    [locale, preference, setPreference],
  );
  return <LocaleContext value={value}>{children}</LocaleContext>;
}
export const useLocale = () => useContext(LocaleContext);
