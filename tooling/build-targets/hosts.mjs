/* oxlint-disable no-await-in-loop -- Each host/profile writes its own deterministic bundle. */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';
import { parse } from 'acorn';
const root = fileURLToPath(new URL('../..', import.meta.url));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const invoke = (args, env = {}) => {
  const result = spawnSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Build subprocess failed');
};
async function notices(directory) {
  await mkdir(path.join(directory, 'licenses'), { recursive: true });
  const resolver = createRequire(path.join(root, 'packages/barcode-core/package.json'));
  const engine = path.dirname(path.dirname(resolver.resolve('bwip-js')));
  await cp(path.join(engine, 'LICENSE'), path.join(directory, 'licenses/BWIP-JS-MIT.txt'));
  for (const font of ['OCR-A', 'OCR-B'])
    await cp(
      path.join(root, `licenses/${font}-NOTICE.txt`),
      path.join(directory, `licenses/${font}-NOTICE.txt`),
    );
}
async function report(directory, target) {
  const artifacts = [];
  async function visit(folder) {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name !== 'host-build-info.json')
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
        target,
        developmentBuild: true,
        actualHost: 'not-run',
        lockSha256: sha(await readFile(path.join(root, 'pnpm-lock.yaml'))),
        artifacts,
      },
      null,
      2,
    ) + '\n',
  );
}
export async function buildIllustrator() {
  const app = path.join(root, 'apps/illustrator-cep'),
    directory = path.join(app, 'dist');
  // A host directory contains only its production resources; comparison builds are separate invocations.
  await rm(directory, { recursive: true, force: true });
  for (const profile of ['cep11', 'cep12'])
    invoke(['--filter', '@astmatrix/illustrator-cep', 'build:panels'], {
      ASTMATRIX_WEB_PROFILE: profile,
      ASTMATRIX_COMPILER: 'on',
    });
  for (const folder of ['bootstrap', 'CSXS', 'vendor'])
    await cp(path.join(app, folder), path.join(directory, folder), { recursive: true });
  await mkdir(path.join(directory, 'jsx'), { recursive: true });
  const jsx = (
    await Promise.all(
      ['json.jsx', 'renderer.jsx', 'astmatrix.jsx'].map((file) =>
        readFile(path.join(app, 'jsx', file), 'utf8'),
      ),
    )
  ).join('\n');
  parse(jsx, { ecmaVersion: 3, sourceType: 'script' });
  await writeFile(path.join(directory, 'jsx/astmatrix.jsx'), jsx);
  const source = JSON.parse(await readFile(path.join(app, 'vendor/source.json'), 'utf8'));
  if (sha(await readFile(path.join(app, 'vendor/CSInterface.js'))) !== source.sha256)
    throw new Error('Vendored CSInterface checksum mismatch');
  await notices(directory);
  await report(directory, 'illustrator-cep');
  console.log(`Illustrator development extension: ${directory}`);
}
export async function buildPhotoshop() {
  const app = path.join(root, 'apps/photoshop-uxp'),
    dist = path.join(app, 'dist'),
    native = path.join(dist, 'native'),
    enhanced = path.join(dist, 'enhanced');
  await rm(native, { recursive: true, force: true });
  await rm(enhanced, { recursive: true, force: true });
  await mkdir(native, { recursive: true });
  await build({
    configFile: false,
    root,
    build: {
      target: 'es2020',
      outDir: native,
      emptyOutDir: false,
      minify: false,
      license: true,
      lib: { entry: path.join(app, 'src/index.ts'), formats: ['cjs'], fileName: () => 'index.js' },
      rolldownOptions: { external: ['photoshop', 'uxp'] },
    },
    ssr: { noExternal: true },
  });
  for (const file of ['index.html', 'index.css', 'manifest.json'])
    await cp(path.join(app, file), path.join(native, file));
  const code = await readFile(path.join(native, 'index.js'), 'utf8');
  parse(code, { ecmaVersion: 2020, sourceType: 'script' });
  if (!code.includes('require("photoshop")') && !code.includes("require('photoshop')"))
    throw new Error('Missing Photoshop runtime external');
  const imports = [...code.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map((match) => match[1]);
  if (imports.some((id) => !['photoshop', 'uxp'].includes(id)))
    throw new Error(`Unexpected native imports: ${imports.join(', ')}`);
  await notices(native);
  invoke(['--filter', '@astmatrix/photoshop-uxp', 'build:webview'], {
    ASTMATRIX_WEB_PROFILE: 'uxp-webview',
    ASTMATRIX_COMPILER: 'on',
  });
  await cp(native, enhanced, { recursive: true });
  await cp(path.join(app, 'manifest-webview.json'), path.join(enhanced, 'manifest.json'));
  await cp(path.join(dist, 'webview'), path.join(enhanced, 'webview'), { recursive: true });
  const html = (await readFile(path.join(native, 'index.html'), 'utf8')).replace(
    '<div id="astmatrix-panel">',
    '<p id="webview-status" style="display: none"></p><webview id="astmatrix-webview" style="display: none"></webview><div id="astmatrix-panel">',
  );
  await writeFile(path.join(enhanced, 'index.html'), html);
  await report(native, 'photoshop-uxp-native');
  await report(enhanced, 'photoshop-uxp-webview');
  console.log(`Photoshop development plugins: ${native}\n${enhanced}`);
}
