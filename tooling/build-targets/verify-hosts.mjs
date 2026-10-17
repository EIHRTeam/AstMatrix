import assert from 'node:assert/strict';
import { readFile, access, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'acorn';
import { createHash } from 'node:crypto';
import { verifyFigma } from './verify-figma.mjs';
const destination = process.argv[2] ?? 'tmp/host-bundles.json';
const roots = [
  'apps/illustrator-cep/dist',
  'apps/photoshop-uxp/dist/native',
  'apps/photoshop-uxp/dist/enhanced',
  'apps/figma-plugin/dist',
];
const records = [];
for (const root of roots) {
  if (root === 'apps/figma-plugin/dist') {
    records.push({ root, ...(await verifyFigma(root)) });
    continue;
  }
  const info = JSON.parse(await readFile(path.join(root, 'host-build-info.json'), 'utf8'));
  assert.equal(info.actualHost, 'not-run');
  for (const artifact of info.artifacts) {
    const bytes = await readFile(path.join(root, artifact.path));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      artifact.sha256,
      `${root}/${artifact.path}`,
    );
  }
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith('.html')) {
        for (const [, source] of (await readFile(file, 'utf8')).matchAll(
          /(?:src|href)="([^"]+)"/g,
        )) {
          if (source.startsWith('data:') || source.startsWith('#')) continue;
          assert(!/^https?:/.test(source), `Remote resource: ${source}`);
          const resource = source.startsWith('plugin:/')
            ? path.join(root, source.slice('plugin:/'.length))
            : path.resolve(path.dirname(file), source);
          await access(resource);
        }
      }
    }
  }
  await visit(root);
  for (const file of [
    'LICENSE',
    'licenses/OCR-A-NOTICE.txt',
    'licenses/OCR-B-NOTICE.txt',
    'licenses/BWIP-JS-MIT.txt',
  ])
    await access(path.join(root, file));
  if (root.includes('illustrator')) {
    const manifest = await readFile(path.join(root, 'CSXS/manifest.xml'), 'utf8');
    assert(manifest.includes('./bootstrap/index.html'));
    assert(manifest.includes('./jsx/astmatrix.jsx'));
    assert(manifest.includes('[27.0,30.9]'));
    parse(await readFile(path.join(root, 'jsx/astmatrix.jsx'), 'utf8'), {
      ecmaVersion: 3,
      sourceType: 'script',
    });
    const upstream = JSON.parse(await readFile(path.join(root, 'vendor/source.json'), 'utf8'));
    assert.equal(
      upstream.sha256,
      createHash('sha256')
        .update(await readFile(path.join(root, 'vendor/CSInterface.js')))
        .digest('hex'),
    );
    await access(path.join(root, 'vendor/CEP-LICENSE.pdf'));
    for (const profile of ['cep11', 'cep12']) {
      const html = await readFile(path.join(root, `web/${profile}/index.html`), 'utf8');
      assert(!/type="module"|crossorigin|rel="modulepreload"/.test(html));
      const script = html.match(/<script defer src="(\.\/assets\/[^"]+\.js)"><\/script>/);
      assert(script, 'CEP must use a deferred classic script for file:// loading');
      parse(await readFile(path.join(root, `web/${profile}`, script[1]), 'utf8'), {
        ecmaVersion: 2022,
        sourceType: 'script',
      });
      await access(path.join(root, `web/${profile}/startup.js`));
      assert.equal(
        JSON.parse(await readFile(path.join(root, `web/${profile}/build-info.json`), 'utf8'))
          .developmentAdapter,
        false,
      );
    }
  } else {
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifestVersion, 5);
    assert.equal(manifest.host[0].data.apiVersion, 2);
    assert.equal(manifest.requiredPermissions.localFileSystem, 'request');
    if (root.endsWith('/native')) {
      assert.equal(manifest.host[0].minVersion, '24.0.0');
      assert(!manifest.requiredPermissions.webview);
    } else {
      assert.equal(manifest.host[0].minVersion, '26.0.0');
      assert.equal(manifest.requiredPermissions.webview.enableMessageBridge, 'localOnly');
      assert.deepEqual(manifest.requiredPermissions.webview.domains, []);
    }
    const iconGroups = [
      { size: 24, icons: manifest.icons },
      {
        size: 23,
        icons: manifest.entrypoints.flatMap((entrypoint) => entrypoint.icons ?? []),
      },
    ];
    for (const { size, icons } of iconGroups) {
      assert(Array.isArray(icons) && icons.length > 0, `Missing Photoshop ${size}px icon`);
      for (const icon of icons) {
        assert.equal(icon.width, size);
        assert.equal(icon.height, size);
        assert(Array.isArray(icon.scale) && icon.scale.includes(1) && icon.scale.includes(2));
        assert(Array.isArray(icon.theme) && icon.theme.length > 0);
        const bytes = await readFile(path.join(root, icon.path));
        assert.equal(
          bytes.subarray(0, 8).toString('hex'),
          '89504e470d0a1a0a',
          `${root}/${icon.path} must be a PNG`,
        );
      }
    }
    const code = await readFile(path.join(root, 'index.js'), 'utf8');
    parse(code, { ecmaVersion: 2020, sourceType: 'script' });
    const imports = [...code.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map((m) => m[1]);
    assert.deepEqual(new Set(imports), new Set(['photoshop', 'uxp']));
    assert(
      !/Object\.hasOwn\(|\.toSorted\(|\.toSpliced\(|\.at\(/.test(code),
      'Native runtime requires APIs above the development baseline',
    );
  }
  records.push({
    root,
    target: info.target,
    artifacts: info.artifacts.length,
    checks:
      'local resources, host externals, manifest separation, ES3/ES2020 syntax and artifact hashes pass',
    actualHost: 'not-run',
  });
}
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(
  destination,
  JSON.stringify(
    { schemaVersion: 1, scope: 'Static development bundle checks only', records },
    null,
    2,
  ) + '\n',
);
console.log(`Verified ${records.length} development host bundles; real-host acceptance not run.`);
