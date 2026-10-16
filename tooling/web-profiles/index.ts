/**
 * Web build profiles (docs/plan/INIT.md §4.3, §4.5).
 *
 * A Web Profile determines the JavaScript/CSS compilation target of a Web UI bundle. It is
 * deliberately expressed as explicit browser versions (`chrome88`, `chrome99`) rather than
 * ECMAScript years, because Chromium feature support does not line up with ES editions.
 *
 * Two of the build targets in §4.3 are not browser environments at all
 * (`uxp-native`, `affinity-script`). They are listed separately in `NON_BROWSER_PROFILES`
 * because a Chrome version cannot describe their runtime compatibility.
 *
 * NOTE: `build.target` only handles syntax. Missing Web APIs are not polyfilled by Vite,
 * TypeScript or React Compiler (§4.5). Each profile must be validated in its real host.
 */

export type WebProfileId = 'cep11' | 'cep12' | 'uxp-webview' | 'web-playground';

export interface WebProfile {
  readonly id: WebProfileId;
  /** Vite `build.target`. `null` means "resolve during the spike, not yet pinned". */
  readonly target: string | null;
  /** Vite `build.cssTarget`; `null` defers the CSS target to Vite's own default. */
  readonly cssTarget: string | null;
  /** Host targets that may ship this profile. */
  readonly hosts: readonly string[];
  readonly notes: string;
}

export const WEB_PROFILES = {
  cep11: {
    id: 'cep11',
    target: 'chrome88',
    cssTarget: 'chrome88',
    hosts: ['illustrator-cep'],
    notes: 'CEP 11.x — Illustrator 2023 (27.x) and 2024 (28.x), also the CEP 11 half of 2025.',
  },
  cep12: {
    id: 'cep12',
    target: 'chrome99',
    cssTarget: 'chrome99',
    hosts: ['illustrator-cep'],
    notes:
      'CEP 12.x — Illustrator 2025 (29.5.1+) and 2026 (30.x); runtime version must be recorded.',
  },
  'uxp-webview': {
    id: 'uxp-webview',
    target: 'es2020',
    cssTarget: 'safari15',
    hosts: ['photoshop-uxp'],
    notes:
      'Optional PS 26+ / UXP 8+ local WebView. Conservative ES2020/Safari15 development target; actual WebView2/WKWebView compatibility remains unverified.',
  },
  'web-playground': {
    id: 'web-playground',
    target: 'baseline-widely-available',
    // Lightning CSS (Vite's CSS minifier) does not accept the `baseline-widely-available`
    // token, so the playground leaves the CSS target to Vite's own default. CEP profiles
    // always pin an explicit cssTarget because their CSS behaviour must be verified.
    cssTarget: null,
    hosts: ['playground-web'],
    notes: 'Development browser target. Must never be used to justify CEP compatibility.',
  },
} as const satisfies Record<WebProfileId, WebProfile>;

export const WEB_PROFILE_IDS = Object.keys(WEB_PROFILES) as WebProfileId[];

/**
 * Build targets that are not browsers. They must not be described with a Chromium version
 * (§4.3), and their compatibility is proven by host integration tests only.
 */
export const NON_BROWSER_PROFILES = {
  'uxp-native': {
    id: 'uxp-native',
    hosts: ['photoshop-uxp'],
    notes: 'Photoshop native UXP JavaScript environment.',
  },
  'affinity-script': {
    id: 'affinity-script',
    hosts: ['affinity-script'],
    notes:
      'Affinity Scripting JavaScript environment; bwip-js compatibility still to be spiked (§7.3).',
  },
} as const;

export function isWebProfileId(value: string): value is WebProfileId {
  return Object.hasOwn(WEB_PROFILES, value);
}

/**
 * Vite options for a profile. Returned as plain data so build scripts and application
 * Vite configs share exactly one definition (§4.5).
 */
export function resolveWebBuild(profile: WebProfileId): {
  base: string;
  build: { target: string; cssTarget?: string };
} {
  const entry = WEB_PROFILES[profile];
  if (entry.target === null) {
    throw new Error(
      `Web profile "${profile}" has no pinned compilation target yet. It must be measured in the real runtime before it can be built (docs/plan/INIT.md §16).`,
    );
  }
  return {
    base: './',
    build: {
      target: entry.target,
      ...(entry.cssTarget === null ? {} : { cssTarget: entry.cssTarget }),
    },
  };
}
