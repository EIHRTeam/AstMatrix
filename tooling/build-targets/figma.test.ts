import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it('inlines local UI scripts and styles without interpreting literal replacement sequences', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'astmatrix-figma-ui-'));
  try {
    mkdirSync(path.join(directory, 'assets'));
    writeFileSync(
      path.join(directory, 'index.html'),
      '<html><head><link rel="stylesheet" href="./assets/style.css"><script src="./assets/app.js"></script></head><body><div id="root"></div></body></html>',
    );
    writeFileSync(path.join(directory, 'assets/app.js'), 'const text = "$& </script>";');
    writeFileSync(path.join(directory, 'assets/style.css'), 'body{color:red}');
    const script =
      'import {inlineFigmaUI} from "./tooling/build-targets/figma.mjs"; process.stdout.write(await inlineFigmaUI(process.argv[1]));';
    const result = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script, directory],
      { encoding: 'utf8' },
    );
    expect(result).toContain('<style>body{color:red}</style>');
    expect(result).toContain('const text = "$& <\\/script>";');
    expect(result).not.toContain('src=');
    expect(result.indexOf('id="root"')).toBeLessThan(result.indexOf('<script>'));
    writeFileSync(
      path.join(directory, 'index.html'),
      '<script src="https://example.com/app.js"></script>',
    );
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', script, directory], {
        stdio: 'pipe',
      }),
    ).toThrow(/Command failed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps the Figma manifest offline, Design-only and pinned to the assigned plugin identity', () => {
  const manifest = JSON.parse(readFileSync('apps/figma-plugin/manifest.json', 'utf8'));
  expect(manifest).toMatchObject({
    name: 'AstMatrix',
    id: '1693350407249302347',
    api: '1.0.0',
    editorType: ['figma'],
    documentAccess: 'dynamic-page',
    networkAccess: { allowedDomains: ['none'] },
    main: 'code.js',
    ui: 'ui.html',
  });
  expect(manifest).not.toHaveProperty('permissions');
});
