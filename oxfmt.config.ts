import { defineConfig } from 'oxfmt';

/**
 * AstMatrix formatter baseline (docs/plan/INIT.md §6.6).
 *
 * Oxfmt is the only formatter in this repository; Prettier and Biome are not used in
 * parallel. Files whose syntax must not be rewritten are listed in `.prettierignore`
 * (ExtendScript `.jsx` sources, CEP `manifest.xml`) and are validated by their own
 * pipeline instead.
 */
export default defineConfig({
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'always',
  endOfLine: 'lf',
  // AstMatrix is not a Tailwind-first codebase yet; class sorting stays disabled until the
  // UI package defines its Tailwind entry points.
  sortTailwindcss: false,
});
