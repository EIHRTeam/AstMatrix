import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { resolveWebBuild } from '@astmatrix/tooling/web-profiles';
import type { WebProfileId } from '@astmatrix/tooling/web-profiles';
const root = fileURLToPath(new URL('../..', import.meta.url));
function files(directory: string): string[] {
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      if (['node_modules', 'dist'].includes(name)) return [];
      const path = join(directory, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.(ts|tsx|css|html|json)$/.test(name) && !name.includes('.test.') ? [path] : [];
    });
}
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function webBuildAssets(profile: WebProfileId, compiler: boolean): Plugin {
  return {
    name: 'astmatrix-build-info-and-font-notices',
    generateBundle() {
      const config = resolveWebBuild(profile),
        paths = [
          'packages',
          'tooling',
          profile === 'web-playground'
            ? 'apps/playground-web'
            : profile === 'uxp-webview'
              ? 'apps/photoshop-uxp'
              : 'apps/illustrator-cep',
        ].flatMap((name) => files(join(root, name)));
      const sourceHash = createHash('sha256');
      for (const path of paths)
        sourceHash.update(relative(root, path).replace(/\\/g, '/')).update(readFileSync(path));
      const packageRequire = createRequire(join(root, 'packages/barcode-core/package.json'));
      const engineRoot = dirname(dirname(packageRequire.resolve('bwip-js')));
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source:
          JSON.stringify(
            {
              schemaVersion: 1,
              webProfile: profile,
              compiler: compiler ? 'on' : 'off',
              ...config,
              developmentAdapter: profile === 'web-playground',
              sourceSha256: sourceHash.digest('hex'),
              lockSha256: sha(readFileSync(join(root, 'pnpm-lock.yaml'))),
            },
            null,
            2,
          ) + '\n',
      });
      for (const name of ['OCR-A-NOTICE.txt', 'OCR-B-NOTICE.txt'])
        this.emitFile({
          type: 'asset',
          fileName: 'licenses/' + name,
          source: readFileSync(join(root, 'licenses', name), 'utf8'),
        });
      this.emitFile({
        type: 'asset',
        fileName: 'licenses/BWIP-JS-MIT.txt',
        source: readFileSync(join(engineRoot, 'LICENSE'), 'utf8'),
      });
    },
  };
}
