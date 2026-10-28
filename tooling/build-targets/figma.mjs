import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';
import { parse } from 'acorn';

const root = fileURLToPath(new URL('../..', import.meta.url));
const app = path.join(root, 'apps/figma-plugin');
const sha = (value) => createHash('sha256').update(value).digest('hex');

/** Inline only locally produced assets; callbacks preserve literal replacement characters. */
export async function inlineFigmaUI(directory) {
  let html = await readFile(path.join(directory, 'index.html'), 'utf8');
  const scripts = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)) {
    const script = await localAsset(directory, match[1]);
    scripts.push(`<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`);
    html = html.replace(match[0], '');
  }
  for (const match of html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)) {
    const href = match[0].match(/href="([^"]+)"/)?.[1];
    if (!href) throw new Error('Figma stylesheet has no local href');
    const css = await localAsset(directory, href);
    html = html.replace(match[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
  }
  if (/<script\b[^>]*\bsrc=|<link\b|type="module"/i.test(html))
    throw new Error('Figma UI must be a single inline HTML document');
  // Vite hoists module scripts into <head>. Classic inline scripts must run after #root exists.
  if (!html.includes('</body>')) throw new Error('Figma UI requires a body element');
  html = html.replace('</body>', () => scripts.join('\n') + '</body>');
  return html;
}
async function localAsset(directory, resource) {
  if (!resource.startsWith('./assets/') || resource.includes('..'))
    throw new Error(`Unexpected Figma asset: ${resource}`);
  return readFile(path.join(directory, resource), 'utf8');
}
export async function buildFigma() {
  const manifest = JSON.parse(await readFile(path.join(app, 'manifest.json'), 'utf8'));
  if (typeof manifest.id !== 'string' || !/^\d{1,64}$/.test(manifest.id))
    throw new Error('Figma manifest must contain its assigned numeric plugin ID');
  const directory = path.join(app, 'dist');
  await rm(directory, { recursive: true, force: true });
  const ui = spawnSync('pnpm', ['--filter', '@astmatrix/figma-plugin', 'build:ui'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ASTMATRIX_COMPILER: 'on' },
  });
  if (ui.error) throw ui.error;
  if (ui.status !== 0) throw new Error('Figma UI build failed');
  await build({
    configFile: false,
    root,
    publicDir: false,
    build: {
      target: 'es2020',
      outDir: directory,
      emptyOutDir: false,
      license: true,
      lib: {
        entry: path.join(app, 'src/main.ts'),
        name: 'AstMatrixFigma',
        formats: ['iife'],
        fileName: () => 'code.js',
      },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  parse(await readFile(path.join(directory, 'code.js'), 'utf8'), {
    ecmaVersion: 2020,
    sourceType: 'script',
  });
  await writeFile(path.join(directory, 'ui.html'), await inlineFigmaUI(path.join(directory, 'ui')));
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await cp(path.join(root, 'LICENSE'), path.join(directory, 'LICENSE'));
  await cp(path.join(root, 'README.md'), path.join(directory, 'README.md'));
  await cp(path.join(directory, 'ui/licenses'), path.join(directory, 'licenses'), {
    recursive: true,
  });
  await cp(path.join(directory, 'ui/build-info.json'), path.join(directory, 'ui-build-info.json'));
  // Preserve all emitted third-party license notices, including Vite's bundle licenses.
  await mkdir(path.join(directory, 'licenses'), { recursive: true });
  await cp(
    path.join(directory, 'ui/.vite/license.md'),
    path.join(directory, 'licenses/UI-THIRD-PARTY.md'),
  );
  await cp(
    path.join(directory, '.vite/license.md'),
    path.join(directory, 'licenses/MAIN-THIRD-PARTY.md'),
  );
  await rm(path.join(directory, '.vite'), { recursive: true });
  await rm(path.join(directory, 'ui'), { recursive: true });
  const artifacts = [];
  async function visit(folder) {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(file);
      else
        artifacts.push({
          path: path.relative(directory, file).replace(/\\/g, '/'),
          sha256: sha(await readFile(file)),
        });
    }
  }
  await visit(directory);
  await writeFile(
    path.join(directory, 'host-build-info.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        target: 'figma-plugin',
        developmentBuild: false,
        diagnosticsVisible: false,
        actualHost: 'not-run',
        pluginIdConfigured: true,
        lockSha256: sha(await readFile(path.join(root, 'pnpm-lock.yaml'))),
        artifacts,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Figma plugin bundle: ${directory}`);
}
