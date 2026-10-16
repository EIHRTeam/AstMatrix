import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const run = (...args: string[]) =>
  execFileSync(process.execPath, ['tooling/build-targets/build.mjs', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
it('dry-run explicitly resolves pinned targets without invoking compilation', () => {
  expect(run('web', '--profile=cep11', '--dry-run')).toContain(
    'DRY RUN: pnpm --filter @astmatrix/illustrator-cep build:panels',
  );
  expect(run('web', '--profile=cep12', '--compiler=off', '--dry-run')).toContain('compiler=off');
  expect(run('web', '--profile=web-playground', '--dry-run')).toContain(
    '@astmatrix/playground-web',
  );
  expect(run('web', '--profile=uxp-webview', '--dry-run')).toContain('build:webview');
  for (const args of [
    ['web'],
    ['web', '--profile=unknown'],
    ['web', '--profile=cep11', '--compiler=bad'],
    ['web', '--profile=cep11', '--typo'],
  ])
    expect(() => run(...args)).toThrow(Error);
});
it('core and application imports remain framework/host/filesystem-free', () => {
  for (const file of [
    'shared',
    'vector-ir',
    'profiles',
    'symbology-catalog',
    'barcode-core',
    'renderers-svg',
    'application',
  ]) {
    const source = readFileSync('packages/' + file + '/src/index.ts', 'utf8');
    expect(source).not.toMatch(
      /from ['"](?:react|react-dom|node:|@astmatrix\/ui-|@astmatrix\/host-adapter)/,
    );
  }
  expect(readFileSync('packages/barcode-core/src/hri.ts', 'utf8')).toContain("'bwip-js/generic'");
});
