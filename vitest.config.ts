import { defineConfig } from 'vitest/config';

/**
 * Test projects mapped to the layers in docs/plan/INIT.md §11.
 *
 * Layer 3 shared-SVG decoding uses real locally installed ZXing/ZBar WASM in Node.
 * Layer 4 still requires installed Adobe/Affinity applications and human host acceptance;
 * the shared decode project does not replace actual host exports or physical scanner evidence.
 *
 * M1/M2 shared, geometry, application, UI, compatibility and decode layers reject empty runs.
 * Only host-integration remains an explicit placeholder; it supplies no release evidence.
 */

const shared = {
  passWithNoTests: true,
} as const;

export default defineConfig({
  test: {
    // The root suite now requires real tests. Empty placeholder projects are still explicit.
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
          ...shared,
          name: 'host-integration',
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
