import { defineConfig } from 'oxlint';

/**
 * AstMatrix lint baseline.
 *
 * - Oxlint is the project's default and only regular linter; ESLint is not maintained in parallel.
 * - Correctness rules are blocking. Style is owned by Oxfmt, so style rules stay out of the way.
 * - Compiler rules use positive/negative fixtures. Suppressions block; unsupported syntax warns.
 *   `react/hooks` stays off because rules-of-hooks already gates it.
 * - `apps/illustrator-cep/jsx/**` is ExtendScript for the host's legacy engine. It is excluded
 *   here and validated by its own pipeline.
 */
export default defineConfig({
  $schema: './node_modules/oxlint/configuration_schema.json',
  plugins: [
    'react',
    'react-perf',
    'typescript',
    'import',
    'promise',
    'unicorn',
    'jsx-a11y',
    'vitest',
    'node',
  ],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
    perf: 'warn',
  },
  env: {
    builtin: true,
  },
  rules: {
    // Correctness gates that matter for this codebase.
    'import/no-cycle': 'error',
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'error',
    'react/hooks': 'off',
    'react/rule-suppression': 'error',
    'react/unsupported-syntax': 'warn',
    'react/jsx-key': 'error',
    'typescript/no-explicit-any': 'warn',
    'typescript/consistent-type-imports': 'off',
    // React 19 uses the automatic JSX runtime; React does not have to be in scope.
    'react/react-in-jsx-scope': 'off',
    // Style is Oxfmt's responsibility.
    'unicorn/filename-case': 'off',
    // `export {}` is used deliberately to mark placeholder module boundaries in the skeleton.
    'unicorn/require-module-specifiers': 'off',
    'no-console': 'off',
  },
  ignorePatterns: [
    'node_modules/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.turbo/**',
    'tmp/**',
    'docs/**',
    '**/*.d.ts',
    // ExtendScript is not modern JavaScript: it is checked by the JSX pipeline instead.
    'apps/illustrator-cep/jsx/**',
    'apps/illustrator-cep/vendor/**',
    // UXP and Affinity hosts load these entry files directly; they are plain scripts.
    'apps/photoshop-uxp/index.js',
  ],
  overrides: [
    {
      files: ['tooling/**/*.ts', 'tests/**/*.ts', '**/*.test.ts', '**/*.config.ts'],
      env: { node: true, browser: false },
    },
    {
      files: [
        'packages/ui-react/**/*.tsx',
        'apps/playground-web/**/*.tsx',
        'apps/illustrator-cep/**/*.tsx',
      ],
      env: { browser: true },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      env: { node: true, browser: true },
    },
    {
      // Host entry files that are intentionally comment-only placeholders: the CEP bootstrap
      // and the UXP panel entry exist now so the host targets have an entry point.
      files: ['apps/illustrator-cep/bootstrap/**/*.js', 'apps/photoshop-uxp/index.js'],
      rules: { 'unicorn/no-empty-file': 'off' },
    },
  ],
});
