import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { parse } from 'acorn';
const destination = process.argv[2] ?? 'tmp/web-bundles.json';
const records = [];
for (const profile of ['cep11', 'cep12'])
  for (const compiler of ['on', 'off']) {
    const directory =
      'apps/illustrator-cep/dist/web/' + profile + (compiler === 'off' ? '-compiler-off' : '');
    const html = readFileSync(join(directory, 'index.html'), 'utf8'),
      metadata = JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8'));
    if (
      metadata.webProfile !== profile ||
      metadata.compiler !== compiler ||
      metadata.base !== './' ||
      metadata.build.target !== (profile === 'cep11' ? 'chrome88' : 'chrome99') ||
      metadata.build.cssTarget !== metadata.build.target
    )
      throw new Error('Invalid build metadata ' + directory);
    const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
    if (assets.length !== 2 || assets.some((name) => !existsSync(join(directory, name))))
      throw new Error('Missing relative JS/CSS assets ' + directory);
    const js = readFileSync(
      join(
        directory,
        assets.find((a) => a.endsWith('.js')),
      ),
      'utf8',
    );
    const css = readFileSync(
      join(
        directory,
        assets.find((a) => a.endsWith('.css')),
      ),
      'utf8',
    );
    // Local file:// CEP pages cannot fetch ESM or crossorigin resources.
    if (/type="module"|crossorigin|rel="modulepreload"/.test(html))
      throw new Error('CEP HTML requires classic local resources ' + directory);
    if (!/<script defer src="\.\/assets\/[^"]+\.js"><\/script>/.test(html))
      throw new Error('CEP bundle must defer until CSInterface has loaded ' + directory);
    parse(js, { ecmaVersion: 2022, sourceType: 'script' });
    if (/Object\.hasOwn\(|\.toSorted\(|\.toSpliced\(|\.at\(/.test(js))
      throw new Error('Unpolyfilled API above Chromium 88 baseline ' + directory);
    if (/oklch\(|:has\(|@layer/.test(css)) throw new Error('CSS outside baseline ' + directory);
    for (const name of ['OCR-A-NOTICE.txt', 'OCR-B-NOTICE.txt', 'BWIP-JS-MIT.txt'])
      if (!existsSync(join(directory, 'licenses', name)))
        throw new Error('Missing redistribution notice ' + name);
    const walk = (dir) =>
      readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const artifacts = walk(directory).map((path) => {
      const data = readFileSync(path);
      return {
        path,
        bytes: data.length,
        gzipBytes: gzipSync(data).length,
        sha256: createHash('sha256').update(data).digest('hex'),
      };
    });
    records.push({
      profile,
      compiler,
      metadata,
      checks: {
        relativeAssets: 'pass',
        jsParseES2022:
          'pass (classic script; Chrome 88 supports public class fields before ES2022)',
        localScriptLoading: 'pass (deferred IIFE, no module/crossorigin fetches)',
        newApiAudit: 'pass',
        cssBaseline: 'pass',
        notices: 'pass',
        runtime: 'Current Chrome browser only; real CEP 11/12 acceptance remains separate',
      },
      artifacts,
    });
  }
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(
  destination,
  JSON.stringify(
    {
      suite: 'web-bundle-verification',
      generatedAt: new Date().toISOString(),
      scope: 'Static bundle proof; no real host compatibility claim',
      records,
    },
    null,
    2,
  ) + '\n',
);
console.log('Web bundles verified: ' + records.length + ' profile/compiler combinations.');
