import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

async function catalogs() {
  const text = await readFile(new URL('./messages.iss', import.meta.url), 'utf8');
  const result = {
    english: new Map<string, string>(),
    chinesesimplified: new Map<string, string>(),
  };
  for (const [, language = '', key = '', value = ''] of text.matchAll(
    /^(english|chinesesimplified)\.(\w+)=(.*)$/gm,
  )) {
    const catalog = result[language as keyof typeof result];
    expect(catalog.has(key), `duplicate ${language}.${key}`).toBe(false);
    catalog.set(key, value.trim());
  }
  return result;
}

it('provides both translations with matching interpolation placeholders', async () => {
  const { english, chinesesimplified } = await catalogs();
  expect(english.size).toBeGreaterThan(0);
  expect([...english.keys()].sort()).toEqual([...chinesesimplified.keys()].sort());
  for (const [key, value] of english) {
    const chinese = chinesesimplified.get(key)!;
    expect(value, `english.${key}`).not.toBe('');
    expect(chinese, `chinesesimplified.${key}`).not.toBe('');
    // Paragraph breaks may differ by language; substitution arguments must match.
    expect(chinese.match(/%\d+/g)?.sort() ?? [], `placeholders: ${key}`).toEqual(
      value.match(/%\d+/g)?.sort() ?? [],
    );
  }
});

it('translates every referenced UI message and controller error key', async () => {
  const { english, chinesesimplified } = await catalogs();
  const [setup, controller] = await Promise.all([
    readFile(new URL('./shared.iss', import.meta.url), 'utf8'),
    readFile(new URL('./runtime.ps1', import.meta.url), 'utf8'),
  ]);
  const keys = new Set([
    ...[...setup.matchAll(/(?:CustomMessage|ControllerFailure)\('([^']+)'\)/g)].map(
      (match) => match[1]!,
    ),
    ...[...setup.matchAll(/\{cm:(\w+)/g)].map((match) => match[1]!),
    ...[...controller.matchAll(/Stop-Installer '(\w+)'/g)].map((match) => match[1]!),
  ]);
  for (const key of keys) {
    expect(english.has(key), `missing english.${key}`).toBe(true);
    expect(chinesesimplified.has(key), `missing chinesesimplified.${key}`).toBe(true);
  }
});

it('uses the opposite localized shortcut name when cleaning up after a language switch', async () => {
  const { english, chinesesimplified } = await catalogs();
  expect(english.get('OtherUninstallShortcut')).toBe(chinesesimplified.get('UninstallShortcut'));
  expect(chinesesimplified.get('OtherUninstallShortcut')).toBe(english.get('UninstallShortcut'));
  expect(english.get('PluginUninstallShortcut')).toBe('Uninstall AstMatrix.lnk');
  expect(chinesesimplified.get('PluginUninstallShortcut')).toBe('卸载 AstMatrix.lnk');
});
