import type { Plugin } from 'vite';

/** Keep React out of the application entry; BWIPP is loaded by the lazy provider. */
export const browserCodeSplitting = {
  groups: [
    {
      name: 'react',
      test: /node_modules[\\/](?:\.pnpm[\\/])?(?:react-dom|react|scheduler)(?:@|[\\/])/,
    },
  ],
};

/** Vite's global warning limit must allow BWIPP, so check initial JS separately. */
export function initialJsBudget(limitBytes = 500_000): Plugin {
  return {
    name: 'astmatrix-initial-js-budget',
    generateBundle(_options, bundle) {
      const pending = Object.values(bundle)
        .filter((asset) => asset.type === 'chunk' && asset.isEntry)
        .map((chunk) => chunk.fileName);
      const visited = new Set<string>();
      while (pending.length) {
        const name = pending.pop()!;
        if (visited.has(name)) continue;
        visited.add(name);
        const chunk = bundle[name];
        if (!chunk || chunk.type !== 'chunk') continue;
        const bytes = Buffer.byteLength(chunk.code);
        if (bytes > limitBytes)
          this.error(`Initial JavaScript chunk ${name} is ${bytes} bytes (limit ${limitBytes})`);
        pending.push(...chunk.imports);
      }
    },
  };
}
