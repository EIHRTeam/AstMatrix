import { defineConfig } from 'vitest/config';

/**
 * Test projects grouped by behavior.
 *
 * The decode project uses locally installed ZXing/ZBar WASM in Node. Real host integration
 * still requires installed Adobe/Affinity applications and human acceptance; the decode
 * project does not replace actual host exports or physical scanner checks.
 *
 * Every project except host-integration rejects empty runs. host-integration remains an
 * explicit placeholder because it can only run with real host applications installed.
 */

const shared = {
  passWithNoTests: true,
} as const;

export default defineConfig({
  test: {
    // The root suite requires real tests. The host-integration placeholder stays explicit.
    passWithNoTests: false,
    projects: [
      {
        test: {
          ...shared,
          name: 'conformance',
          passWithNoTests: false,
          environment: 'node',
          include: ['tests/barcode-conformance/**/*.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'vector-golden',
          passWithNoTests: false,
          environment: 'node',
          include: ['tests/vector-golden/**/*.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'unit',
          passWithNoTests: false,
          environment: 'node',
          include: ['packages/**/src/**/*.test.ts', 'tooling/**/*.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'react-state',
          passWithNoTests: false,
          environment: 'jsdom',
          include: ['tests/react-state/**/*.test.tsx', 'tests/react-state/**/*.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'compatibility',
          passWithNoTests: false,
          environment: 'node',
          include: ['tests/compatibility/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'host-integration',
          passWithNoTests: true,
          environment: 'node',
          include: ['tests/host-integration/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'decode',
          passWithNoTests: false,
          environment: 'node',
          include: ['tests/decode/**/*.test.ts'],
        },
      },
    ],
  },
});
