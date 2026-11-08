import type { EncodeProvider } from './index';

// Keep this token in sync with bwip-js/generic. The provider checks it on first use so a
// dependency update cannot silently make cached requests or restored metadata incompatible.
const ENGINE_VERSION = 'bwip-js:4.11.4 (2026-08-19);BWIPP:2026-05-28;provider:m7-v1';

/** Load the large BWIPP module only when a browser preview first needs encoding. */
export const lazyBwipProvider: EncodeProvider = {
  engineVersion: ENGINE_VERSION,
  restorableEngineVersions: [
    ENGINE_VERSION,
    ENGINE_VERSION.replace('provider:m7-v1', 'provider:m1-v1'),
  ],
  async encode(request) {
    const core = await import('./index');
    if (core.ENGINE_VERSION !== ENGINE_VERSION)
      throw new Error('Lazy provider version does not match the installed bwip-js engine');
    return core.encodeNormalized(request);
  },
};
