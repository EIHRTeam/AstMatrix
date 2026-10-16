/* oxlint-disable no-await-in-loop -- Vite builds share compiler state; keep host/profile builds sequential. */
import { build } from 'vite';
import { mkdir, cp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { parse } from 'acorn';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { resolveWebBuild } from '../../../tooling/web-profiles/index.ts';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from './cep/tailwind.config.mjs';
import { prepareMetadataProbes } from './metadata/build.mjs';
import { checkMetadataProbes } from './metadata/check.mjs';
import { prepareHriHostProbes } from './hri/build.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(root);
const base = 'tests/compatibility/spikes';
await build({
  configFile: false,
  build: {
    ssr: `${base}/run.ts`,
    outDir: `${base}/dist/runner`,
    target: 'node24',
    rollupOptions: { output: { entryFileNames: 'run.mjs' } },
  },
  ssr: { noExternal: true },
});
const run = spawnSync(process.execPath, [`${base}/dist/runner/run.mjs`], { stdio: 'inherit' });
if (run.status !== 0) throw new Error('M0 sample runner failed');
await rm(`${base}/dist/photoshop`, { recursive: true, force: true });
await mkdir(`${base}/dist/photoshop`, { recursive: true });
await cp(`${base}/photoshop`, `${base}/dist/photoshop`, { recursive: true });
const scene = JSON.parse(await readFile(`${base}/dist/samples/qrcode-1.json`, 'utf8'));
await writeFile(`${base}/dist/photoshop/scene.js`, `module.exports = ${JSON.stringify(scene)};`);
// Separate optional native-envelope variant. The default accepted insert action stays unchanged.
const quietPhotoshop = `${base}/dist/photoshop-quiet`;
await rm(quietPhotoshop, { recursive: true, force: true });
await cp(`${base}/dist/photoshop`, quietPhotoshop, { recursive: true });
const quietManifest = JSON.parse(await readFile(`${quietPhotoshop}/manifest.json`, 'utf8'));
quietManifest.id = 'com.astmatrix.m0.photoshop.quiet';
quietManifest.name = 'AstMatrix M0 Quiet Zone';
quietManifest.entrypoints[0].label.default = 'AstMatrix M0 Quiet Zone';
await writeFile(`${quietPhotoshop}/manifest.json`, JSON.stringify(quietManifest, null, 2));
const defaultPhotoshopSource = await readFile(`${quietPhotoshop}/index.js`, 'utf8');
assert(defaultPhotoshopSource.includes('() => insert(false)'));
assert(defaultPhotoshopSource.includes('() => insert(true)'));
const quietSource = defaultPhotoshopSource
  .replace('() => insert(false)', '() => insert(false, true)')
  .replace('() => insert(true)', '() => insert(true, true)')
  .replace("revision: 'hotfix-03'", "revision: 'quiet-zone-01'");
parse(quietSource, { ecmaVersion: 2020, sourceType: 'script' });
parse(await readFile(`${quietPhotoshop}/quiet-zone.js`, 'utf8'), {
  ecmaVersion: 2020,
  sourceType: 'script',
});
await writeFile(`${quietPhotoshop}/index.js`, quietSource);
await writeFile(
  `${quietPhotoshop}/index.html`,
  (await readFile(`${quietPhotoshop}/index.html`, 'utf8'))
    .replace('AstMatrix M0 · hotfix-03', 'AstMatrix M0 · quiet-zone-01')
    .replace('插入 Shape Layer', '插入 Shape + 透明包络组')
    .replace('注入失败/回滚', '包络创建后失败/回滚'),
);
console.log('Shared samples and native Photoshop spike prepared. Host results remain not-run.');
const metadataProbes = await prepareMetadataProbes(scene, `${base}/dist`);
const metadataMockExecution = await checkMetadataProbes(`${base}/dist`, scene);
const hriHostProbes = await prepareHriHostProbes(`${base}/dist`);

// Keep generated SDK resources outside source control. No C++ SDK content is used.
const affinity = `${base}/dist/affinity`;
await rm(affinity, { recursive: true, force: true });
await mkdir(affinity, { recursive: true });
const unzip = spawnSync('unzip', ['-oq', 'tmp/JSLib.zip', '-d', affinity], { stdio: 'inherit' });
if (unzip.status !== 0)
  throw new Error('Supply tmp/JSLib.zip (official Affinity SDK) to build host spike');
await build({
  configFile: false,
  build: {
    target: 'es2020',
    outDir: affinity,
    emptyOutDir: false,
    lib: {
      entry: `${base}/affinity/provider.ts`,
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'provider.mjs' : 'provider.cjs'),
    },
  },
});
await cp('packages/barcode-core/node_modules/bwip-js/LICENSE', `${affinity}/LICENSE.bwip-js`);
const cjsProvider = createRequire(import.meta.url)(path.resolve(`${affinity}/provider.cjs`));
const esmProvider = await import(pathToFileURL(path.resolve(`${affinity}/provider.mjs`)).href);
for (const [name, request] of [
  ['ean13-0', { bcid: 'ean13', text: '6901234567892' }],
  ['qrcode-1', { bcid: 'qrcode', text: 'https://example.com/barcode' }],
]) {
  const expected = JSON.parse(await readFile(`${base}/dist/samples/${name}.json`, 'utf8'));
  assert.deepEqual(cjsProvider.encodeSpike(request), expected);
  assert.deepEqual(esmProvider.encodeSpike(request), expected);
}
// Scripts Library import uses Affinity's native .afscript export, whose container format
// is not specified by JSLib. Deliver self-contained source for the documented Script Editor.
// SDK root-relative requires resolve to Affinity's built-in library, not this output folder.
const providerCode = await readFile(`${affinity}/provider.cjs`, 'utf8');
assert(!/\brequire\s*\(/.test(providerCode), 'Provider must have no external dependencies');
const editorSource = (await readFile(`${base}/affinity/main.cjs`, 'utf8'))
  .replace("require('/provider.cjs')", 'loadM0Provider()')
  .replace('module.exports = { main, read, stress };', '');
const editorScripts = [];
const providerLicense = await readFile(`${affinity}/LICENSE.bwip-js`, 'utf8');
const fontNotices = await Promise.all(
  ['OCR-A', 'OCR-B'].map(async (font) => readFile(`${base}/licenses/${font}-NOTICE.txt`, 'utf8')),
);
const editorNotice = `/* Self-contained M0 Script Editor source.\n${providerLicense}\n${fontNotices.join('\n')}\n*/\n`;
await cp(`${base}/licenses`, `${affinity}/font-notices`, { recursive: true });
for (const action of ['main', 'read', 'stress']) {
  const code =
    editorNotice +
    `function loadM0Provider() {\nconst module = { exports: {} };\nconst exports = module.exports;\n${providerCode}\nreturn module.exports;\n}\n` +
    editorSource +
    `\n${action}();\n`;
  parse(code, { ecmaVersion: 2020, sourceType: 'script' });
  const file = `${affinity}/m0-${action}-editor.js`;
  await writeFile(file, code);
  editorScripts.push(file);
}
const esmCode = await readFile(`${affinity}/provider.mjs`, 'utf8');
const esmEncodeName = /export \{ (\w+) as encodeSpike \};/.exec(esmCode)?.[1];
assert(esmEncodeName, 'Missing provider ESM export');
const esmEditor =
  editorNotice +
  esmCode +
  `\nconst sample = ${esmEncodeName}({ bcid: "ean13", text: "6901234567892" });\n` +
  'console.log("M0 ESM editor encode", JSON.stringify({ widthMm: sample.widthMm, nodes: sample.nodes.length, engineVersion: sample.metadata.engineVersion }));\n';
parse(esmEditor, { ecmaVersion: 2020, sourceType: 'module' });
await writeFile(`${affinity}/m0-esm-editor.mjs`, esmEditor);
editorScripts.push(`${affinity}/m0-esm-editor.mjs`);
// Verify assembled CJS entry actually runs. A null document should reach our guard.
const cjsEditorCode = await readFile(`${affinity}/m0-main-editor.js`, 'utf8');
const editorContext = vm.createContext({
  require: (id) => {
    if (id === '/document.js') return { Document: { current: null } };
    return {};
  },
});
assert.throws(() => vm.runInContext(cjsEditorCode, editorContext), /Open a disposable document/);
for (const [name, bcid, text] of [
  ['ean13-0', 'ean13', '6901234567892'],
  ['qrcode-1', 'qrcode', 'https://example.com/barcode'],
]) {
  const actual = vm.runInContext(
    `JSON.stringify(loadM0Provider().encodeSpike(${JSON.stringify({ bcid, text })}))`,
    editorContext,
  );
  assert.deepEqual(
    JSON.parse(actual),
    JSON.parse(await readFile(`${base}/dist/samples/${name}.json`, 'utf8')),
  );
}
await import(pathToFileURL(path.resolve(`${affinity}/m0-esm-editor.mjs`)).href);
await writeFile(
  `${affinity}/README.txt`,
  'Affinity 3.3.1 M0 manual experiment\n' +
    'Open Script Editor. Paste all of m0-main-editor.js. Disable Run as module. Open a disposable document and run.\n' +
    'm0-read-editor.js and m0-stress-editor.js also use Run as module OFF.\n' +
    'm0-esm-editor.mjs uses Run as module ON and only probes encoding.\n' +
    'SDK requires resolve to the host built-in library; no custom script root or local provider file is needed.\n' +
    'Save As to Scripts Library, then Export Script to create a native .afscript file. No native import package is generated here.\n' +
    'Detailed instructions: docs/plan/evidence/M0/MANUAL.md. Host execution remains unverified.\n',
);
for (const file of [`${base}/affinity/main.cjs`, `${base}/dist/photoshop/index.js`]) {
  parse(await readFile(file, 'utf8'), { ecmaVersion: 2020, sourceType: 'script' });
}
const cep = `${base}/dist/cep`;
await rm(cep, { recursive: true, force: true });
await mkdir(`${cep}/bootstrap`, { recursive: true });
await mkdir(`${cep}/CSXS`, { recursive: true });
await mkdir(`${cep}/jsx`, { recursive: true });
await cp('tmp/m0-cep/CSInterface.js', `${cep}/CSInterface.js`);
await cp('tmp/m0-cep/CEP-LICENSE.pdf', `${cep}/CEP-LICENSE.pdf`);
await cp('tmp/m0-cep/README.md', `${cep}/CEP-Resources-README.md`);
await cp(`${base}/cep/SHADCN-LICENSE.txt`, `${cep}/SHADCN-LICENSE.txt`);
await cp('packages/barcode-core/node_modules/bwip-js/LICENSE', `${cep}/LICENSE.bwip-js`);
await cp(`${base}/licenses`, `${cep}/font-notices`, { recursive: true });
await cp(`${base}/illustrator/host.jsx`, `${cep}/jsx/host.jsx`);
const cepCss = (
  await postcss([tailwindcss(tailwindConfig)]).process(
    await readFile(`${base}/cep/panel/style.css`, 'utf8'),
    { from: path.resolve(`${base}/cep/panel/style.css`) },
  )
).css;
await writeFile(
  `${cep}/bootstrap/index.html`,
  (await readFile(`${base}/cep/bootstrap.html`, 'utf8')).replace(
    '<!-- M0_INLINE_STYLE -->',
    `<style id="m0-inline-style">${cepCss}</style>`,
  ),
);
await writeFile(`${cep}/bootstrap/style.css`, cepCss);
await cp(`${base}/cep/select-profile.js`, `${cep}/bootstrap/select-profile.js`);
let manifest = await readFile('apps/illustrator-cep/CSXS/manifest.xml', 'utf8');
manifest = manifest
  .replaceAll('com.astmatrix.illustrator', 'com.astmatrix.m0.illustrator')
  .replace('./jsx/astmatrix.jsx', './jsx/host.jsx')
  .replace('[27.0,99.9]', '[27.0,30.9]')
  .replace('<Menu>AstMatrix</Menu>', '<Menu>AstMatrix M0 Spike</Menu>');
await writeFile(`${cep}/CSXS/manifest.xml`, manifest);
const bundles = [];
for (const profile of ['cep11', 'cep12'])
  for (const compiler of [false, true]) {
    const mode = compiler ? 'on' : 'off';
    const web = resolveWebBuild(profile);
    await build({
      configFile: false,
      root: path.resolve(`${base}/cep/panel`),
      base: './',
      define: {
        M0_COMPILER_ENABLED: JSON.stringify(compiler),
        M0_WEB_PROFILE: JSON.stringify(profile),
      },
      plugins: [react(), ...(compiler ? [babel({ presets: [reactCompilerPreset()] })] : [])],
      css: { postcss: { plugins: [tailwindcss(tailwindConfig)] } },
      build: {
        ...web.build,
        outDir: path.resolve(`${cep}/web/${profile}/${mode}`),
        emptyOutDir: true,
        minify: false,
      },
    });
    const panelHtmlPath = `${cep}/web/${profile}/${mode}/index.html`;
    let panelHtml = await readFile(panelHtmlPath, 'utf8');
    const cssLinks = [
      ...panelHtml.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g),
    ];
    assert.equal(cssLinks.length, 1, 'Expect one local panel stylesheet');
    for (const [tag, href] of cssLinks) {
      const css = await readFile(path.resolve(path.dirname(panelHtmlPath), href), 'utf8');
      panelHtml = panelHtml.replace(tag, `<style id="m0-inline-style">${css}</style>`);
    }
    await writeFile(panelHtmlPath, panelHtml);
    const assets = path.resolve(`${cep}/web/${profile}/${mode}/assets`);
    const script = (await readdir(assets)).find((file) => file.endsWith('.js'));
    if (!script) throw new Error('Missing panel bundle');
    const compiled = await readFile(path.join(assets, script), 'utf8');
    const componentCode = compiled.slice(compiled.indexOf('function SpikePanel()'));
    const memoized = componentCode.includes('react.memo_cache_sentinel');
    if (memoized !== compiler)
      throw new Error('Compiler toggle did not change component memoization');
    bundles.push({
      memoizedComponent: memoized,
      scriptSha256: createHash('sha256').update(compiled).digest('hex'),
      htmlSha256: createHash('sha256').update(panelHtml).digest('hex'),
      profile,
      compiler,
      path: `web/${profile}/${mode}`,
      target: web.build.target,
    });
  }
// Verify local HTML resources in every entry, including the non-Vite bootstrap page.
for (const entry of ['bootstrap', ...bundles.map((bundle) => bundle.path)]) {
  const html = `${cep}/${entry}/index.html`;
  const content = await readFile(html, 'utf8');
  for (const [, resource] of content.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(?:https?:|data:|#)/.test(resource)) continue;
    await readFile(path.resolve(path.dirname(html), resource));
  }
  assert(content.includes('id="m0-inline-style"'), `Missing inline stylesheet in ${html}`);
  const dom = new JSDOM(content);
  assert.equal(
    dom.window.getComputedStyle(dom.window.document.body).backgroundColor,
    'rgb(255, 255, 255)',
  );
  assert.equal(dom.window.getComputedStyle(dom.window.document.body).color, 'rgb(23, 23, 23)');
  assert(content.includes('.bg-primary'), 'Missing compiled shadcn theme utilities');
  dom.window.close();
}
async function collectSources(folder) {
  const records = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    if (item.name === 'dist' || item.name === 'node_modules') continue;
    const file = path.join(folder, item.name);
    if (item.isDirectory()) records.push(...(await collectSources(file)));
    else
      records.push({
        file,
        sha256: createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
      });
  }
  return records;
}
const sourceHashes = await collectSources(`${base}`);
const decodeRun = spawnSync(process.execPath, ['tests/decode/run-m0.mjs'], { stdio: 'inherit' });
if (decodeRun.status !== 0) throw new Error('M0 independent shared-SVG decode gate failed');
for (const file of [
  'packages/barcode-core/src/spike.ts',
  'packages/barcode-core/src/spike-callbacks.ts',
  'packages/barcode-core/src/spike-hri.ts',
  'packages/vector-ir/src/index.ts',
  'packages/renderers-svg/src/index.ts',
  'tooling/validate-extendscript.mjs',
  'oxlint.config.ts',
  'vitest.config.ts',
  'tests/compatibility/m0-toolchain.test.ts',
  'tests/compatibility/m0-host-controllers.test.ts',
  'tests/compatibility/m0-hri.test.ts',
  'tests/compatibility/m0-hri-native.test.ts',
  'tests/compatibility/m0-metadata.test.ts',
  'tests/react-state/m0-cep.test.tsx',
  'tests/decode/m0-decoders.ts',
  'tests/decode/m0-decode.test.ts',
  'tests/decode/run-m0.mjs',
]) {
  sourceHashes.push({
    file,
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
  });
}
const sha = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
await writeFile(
  `${base}/dist/build-report.json`,
  JSON.stringify(
    {
      status: 'pass',
      scope: 'Compilation and packaging of experiments only; all host executions not-run',
      providerNodeExecution: { esm: 'pass', cjs: 'pass', actualAffinity: 'not-run' },
      affinityEditorSources: await Promise.all(
        editorScripts.map(async (file) => ({ file, sha256: await sha(file) })),
      ),
      affinityNativePackage: 'blocked: native .afscript export/template required',
      photoshopQuietZoneVariant: {
        id: quietManifest.id,
        path: quietPhotoshop,
        sourceSha256: await sha(`${quietPhotoshop}/index.js`),
        helperSha256: await sha(`${quietPhotoshop}/quiet-zone.js`),
        manifestSha256: await sha(`${quietPhotoshop}/manifest.json`),
        htmlSha256: await sha(`${quietPhotoshop}/index.html`),
        actualHost: 'not-run; mock geometry/history contracts only',
      },
      metadataProbes,
      metadataMockExecution,
      hriHostProbes,
      fontNotices:
        'Upstream OCR-A credit/fee terms and OCR-B permissions retained; exact historical font transformations and paid distribution remain unresolved',
      cepHtmlResources:
        'pass: bootstrap and four panel bundles; styles embedded in all five HTML entries',
      cepBootstrapHtmlSha256: await sha(`${cep}/bootstrap/index.html`),
      cepCompiledThemeSha256: createHash('sha256').update(cepCss).digest('hex'),
      independentDecodeReportSha256: await sha(`${base}/dist/decode/report.json`),
      sourceHashes,
      date: new Date().toISOString(),
      bundles,
      lockSha256: await sha('pnpm-lock.yaml'),
      sdkArchiveSha256: await sha('tmp/JSLib.zip'),
      csInterfaceSha256: await sha('tmp/m0-cep/CSInterface.js'),
      csInterfaceSource:
        'https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/CSInterface.js',
      providerCjsSha256: await sha(`${affinity}/provider.cjs`),
      providerEsmSha256: await sha(`${affinity}/provider.mjs`),
    },
    null,
    2,
  ),
);
console.log(
  'M0 host experiments built. See docs/plan/evidence/M0/MANUAL.md; real-host evidence remains not-run.',
);
