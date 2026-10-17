/**
 * Version fields extracted from the 2026-10-14 Illustrator host report.
 * Keep CEP components as strings to reproduce the native bridge serialization.
 * Tests must not depend on the separately maintained local evidence directory.
 */
export const illustratorCepRuntime = {
  host: { appId: 'ILST', appVersion: '30.6.0' },
  cep: { major: '12', minor: '1', micro: '0' },
} as const;
