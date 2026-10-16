import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';
import { selectCepProfile } from '@astmatrix/host-adapter-illustrator-cep';

const vendor = readFileSync('apps/illustrator-cep/vendor/CSInterface.js', 'utf8');
const bootstrap = readFileSync('apps/illustrator-cep/bootstrap/index.js', 'utf8');
function start(host: { appId: string; appVersion: string }, major: number | string) {
  const replace = vi.fn<(url: string) => void>();
  const status = { textContent: '' };
  const context = vm.createContext({
    window: {
      __adobe_cep__: {
        getHostEnvironment: () => JSON.stringify(host),
        getCurrentApiVersion: () => JSON.stringify({ major, minor: '1', micro: '0' }),
      },
      location: { replace },
    },
    document: { getElementById: () => status },
    navigator: { userAgent: 'CEP regression test', appVersion: 'Macintosh' },
    URL,
  });
  vm.runInContext(vendor, context);
  vm.runInContext(bootstrap, context);
  return { replace, status };
}

it('reproduces native string version fields from the existing Illustrator host report', () => {
  const report = JSON.parse(
    readFileSync('docs/plan/evidence/M0/2026-10-14-hotfix-02/user-report.json', 'utf8'),
  ) as { illustrator: { host: string; cep: { major: string } } };
  const { replace, status } = start(
    { appId: 'ILST', appVersion: report.illustrator.host },
    report.illustrator.cep.major,
  );
  expect(replace).toHaveBeenCalledWith('../web/cep12/index.html');
  expect(status.textContent).toBe('');
});

it.each([
  ['27.0.0', 11],
  ['27.0.0', '11'],
  ['29.5.0', '11'],
  ['29.5.1', '12'],
  ['30.6.0', 12],
  ['30.6.0', '12'],
] as const)('bootstrap and transport agree on Illustrator %s / CEP %s', (version, major) => {
  const host = { appId: 'ILST', appVersion: version };
  expect(start(host, major).replace).toHaveBeenCalledWith(
    `../web/${selectCepProfile(host, { major })}/index.html`,
  );
});

it.each([
  ['ILST', '30.6.0', '11'],
  ['ILST', '27.0.0', '12'],
  ['ILST', '31.0.0', '12'],
  ['PHXS', '30.6.0', '12'],
  ['ILST', 'unknown', '11'],
  ['ILST', '30.6.0', '12junk'],
  ['ILST', '30.6.0', '12.0'],
  ['ILST', '30.6.0', ''],
] as const)('rejects unsupported or malformed %s / %s / CEP %s', (appId, version, major) => {
  const host = { appId, appVersion: version };
  const { replace, status } = start(host, major);
  expect(replace).not.toHaveBeenCalled();
  expect(status.textContent).toContain('AstMatrix 无法启动');
  expect(() => selectCepProfile(host, { major })).toThrow(Error);
});
