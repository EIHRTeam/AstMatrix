import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((path) => path && existsSync(path));
const scanned = tracked.filter(
  (path) =>
    !path.startsWith('docs/') &&
    path !== 'tooling/decoupling.test.ts' &&
    path !== '.prettierignore' &&
    (/^(?:apps|packages|tests|tooling|\.github)\//.test(path) ||
      ['package.json', 'AGENTS.md'].includes(path)),
);
const textExtensions = /\.(?:ts|tsx|js|mjs|json|yml|yaml|md|xml|html|css)$/;
const forbidden = [
  ['plan docs', /docs\/plan/],
  ['spike fixtures', /tests\/compatibility\/spikes/],
  ['evidence environment', /ASTMATRIX_(?:M7_)?EVIDENCE_DIR/],
  ['old spike command', /spike:m0/],
  ['old benchmark command', /benchmark:m1/],
  ['old decode command', /decode:m1/],
] as const;

it('keeps tracked code independent of historical planning and evidence paths', () => {
  expect(tracked.filter((path) => /(?:^|\/)m\d+[-_.]/.test(path))).toEqual([]);
  const failures: string[] = [];
  for (const path of scanned) {
    if (!textExtensions.test(path)) continue;
    const source = readFileSync(path, 'utf8');
    for (const [label, pattern] of forbidden) {
      if (pattern.test(source)) failures.push(`${path}: ${label}`);
    }
  }
  expect(failures).toEqual([]);
});
