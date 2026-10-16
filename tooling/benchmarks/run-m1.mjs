import { build } from 'vite';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const outDir = resolve('tmp/m1-benchmark');
await build({
  configFile: false,
  logLevel: 'warn',
  ssr: { noExternal: true },
  build: {
    target: 'node24',
    ssr: true,
    lib: {
      entry: resolve('tooling/benchmarks/m1.ts'),
      formats: ['es'],
      fileName: () => 'runner.mjs',
    },
    outDir,
    emptyOutDir: true,
  },
});
await import(pathToFileURL(resolve(outDir, 'm1.js')).href);
