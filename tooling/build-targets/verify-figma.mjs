import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { parse } from 'acorn';

export async function verifyFigma(directory) {
  const info = JSON.parse(await readFile(path.join(directory, 'host-build-info.json'), 'utf8'));
  assert.equal(info.target, 'figma-plugin');
  assert.equal(info.developmentBuild, false);
  assert.equal(info.diagnosticsVisible, false);
  assert.equal(info.actualHost, 'not-run');
  for (const artifact of info.artifacts) {
    assert(!path.isAbsolute(artifact.path) && !artifact.path.split('/').includes('..'));
    const bytes = await readFile(path.join(directory, artifact.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, artifact.path);
  }
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.name, 'AstMatrix');
  assert.equal(manifest.api, '1.0.0');
  assert.deepEqual(manifest.editorType, ['figma']);
  assert.equal(manifest.documentAccess, 'dynamic-page');
  assert.deepEqual(manifest.networkAccess, { allowedDomains: ['none'] });
  assert.equal(manifest.main, 'code.js');
  assert.equal(manifest.ui, 'ui.html');
  assert.equal(info.pluginIdConfigured, true);
  assert.equal(typeof manifest.id, 'string');
  assert(/^\d{1,64}$/.test(manifest.id));
  const main = await readFile(path.join(directory, manifest.main), 'utf8');
  parse(main, { ecmaVersion: 2020, sourceType: 'script' });
  assert(!/\brequire\s*\(|\bimport\s*\(/.test(main), 'Sandbox bundle must be standalone');
  assert(!/\b(?:window|document)\./.test(main), 'Sandbox must not depend on DOM');
  const html = await readFile(path.join(directory, manifest.ui), 'utf8');
  assert(!/<script\b[^>]*\bsrc=|<link\b|type="module"/i.test(html));
  // Parse the document, not HTML-looking strings contained in its bundled JavaScript.
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(html);
  const panelRoot = dom.window.document.getElementById('root');
  assert(panelRoot, 'Figma UI requires #root');
  assert(dom.window.document.scripts.length > 0, 'Figma UI requires inline JavaScript');
  for (const script of dom.window.document.scripts)
    assert(
      panelRoot.compareDocumentPosition(script) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'Figma inline UI scripts must execute after #root',
    );
  for (const element of dom.window.document.querySelectorAll('[src], [href]')) {
    const resource = element.getAttribute('src') ?? element.getAttribute('href');
    if (element.tagName === 'A') continue;
    assert(
      resource?.startsWith('data:') || resource?.startsWith('#'),
      `Non-inline resource: ${resource}`,
    );
  }
  dom.window.close();
  for (const file of [
    'LICENSE',
    'licenses/OCR-A-NOTICE.txt',
    'licenses/OCR-B-NOTICE.txt',
    'licenses/BWIP-JS-MIT.txt',
  ])
    await access(path.join(directory, file));
  assert.deepEqual(await readFile(path.join(directory, 'README.md')), await readFile('README.md'));
  for (const host of ['Illustrator', 'Photoshop'])
    assert(!existsSync(path.join(directory, `Installation_Guide_${host}.txt`)));
  assert.equal(
    JSON.parse(await readFile(path.join(directory, 'ui-build-info.json'), 'utf8')).webProfile,
    'figma-ui',
  );
  return {
    target: 'figma-plugin',
    actualHost: 'not-run',
    pluginIdConfigured: info.pluginIdConfigured,
    artifacts: info.artifacts.length,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory =
    process.argv[2] ?? fileURLToPath(new URL('../../apps/figma-plugin/dist', import.meta.url));
  console.log(JSON.stringify(await verifyFigma(directory), null, 2));
}
