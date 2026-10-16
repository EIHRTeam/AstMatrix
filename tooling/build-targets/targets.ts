/**
 * Host targets and annual aliases (docs/plan/INIT.md §4.2, §4.4, §4.8, §6.10).
 *
 * Three independent concepts stay separate:
 *   Host Target         which plugin runtime and adapter to use
 *   Web Build Profile   which JS/CSS compilation target the Web UI uses
 *   Compatibility Matrix which versions/platforms must be tested
 *
 * Annual entries (`illustrator-2026`) are only aliases for a Host Target plus a Web
 * Profile. They must never become separate projects or duplicate identical bundles; the
 * caching keys in §6.10 exist precisely so that 2023 and 2024 share one `cep11` compile.
 */

export type HostTargetId = 'illustrator-cep' | 'photoshop-uxp' | 'affinity-script';

export interface HostTarget {
  readonly id: HostTargetId;
  readonly runtime: 'cep' | 'uxp' | 'affinity-script';
  readonly adapter: string;
  readonly output: 'zxp' | 'ccx' | 'script';
  readonly webProfiles: readonly string[];
  readonly uiProfiles: readonly string[];
  readonly app: string;
}

export const HOST_TARGETS = {
  'illustrator-cep': {
    id: 'illustrator-cep',
    runtime: 'cep',
    adapter: '@astmatrix/host-adapter-illustrator-cep',
    output: 'zxp',
    webProfiles: ['cep11', 'cep12'],
    uiProfiles: [],
    app: 'apps/illustrator-cep',
  },
  'photoshop-uxp': {
    id: 'photoshop-uxp',
    runtime: 'uxp',
    adapter: '@astmatrix/host-adapter-photoshop-uxp',
    output: 'ccx',
    webProfiles: [],
    uiProfiles: ['uxp-native', 'uxp-webview'],
    app: 'apps/photoshop-uxp',
  },
  'affinity-script': {
    id: 'affinity-script',
    runtime: 'affinity-script',
    adapter: '@astmatrix/host-adapter-affinity-script',
    output: 'script',
    webProfiles: [],
    uiProfiles: ['affinity-script'],
    app: 'apps/affinity-script',
  },
} as const satisfies Record<string, HostTarget>;

export type AnnualAlias =
  | 'illustrator-2023'
  | 'illustrator-2024'
  | 'illustrator-2025'
  | 'illustrator-2026'
  | 'photoshop-2023'
  | 'photoshop-2026'
  | 'affinity';

export interface ResolvedBuildPlan {
  readonly alias: AnnualAlias;
  readonly target: HostTargetId;
  readonly webProfiles: readonly string[];
  /** `true` when the annual version spans the CEP upgrade boundary (§4.4). */
  readonly runtimeResolutionRequired: boolean;
  readonly notes: string;
}

/**
 * Annual alias table (§4.4). Illustrator 2025 is the CEP 11 -> 12 boundary year and is
 * marked as requiring an explicit runtime read instead of a single Chromium tier.
 */
export const ANNUAL_ALIASES = {
  'illustrator-2023': {
    alias: 'illustrator-2023',
    target: 'illustrator-cep',
    webProfiles: ['cep11'],
    runtimeResolutionRequired: false,
    notes: 'Illustrator 27.x, CEP 11 series.',
  },
  'illustrator-2024': {
    alias: 'illustrator-2024',
    target: 'illustrator-cep',
    webProfiles: ['cep11'],
    runtimeResolutionRequired: false,
    notes: 'Illustrator 28.x, CEP 11 series. Reuses the cep11 bundle.',
  },
  'illustrator-2025': {
    alias: 'illustrator-2025',
    target: 'illustrator-cep',
    webProfiles: ['cep11', 'cep12'],
    runtimeResolutionRequired: true,
    notes: 'Illustrator 29.x: CEP 12 begins at 29.5.1. Host minor version must be read at runtime.',
  },
  'illustrator-2026': {
    alias: 'illustrator-2026',
    target: 'illustrator-cep',
    webProfiles: ['cep12'],
    runtimeResolutionRequired: false,
    notes: 'Illustrator 30.x, CEP 12 series. Reuses the cep12 bundle.',
  },
  'photoshop-2023': {
    alias: 'photoshop-2023',
    target: 'photoshop-uxp',
    webProfiles: [],
    runtimeResolutionRequired: false,
    notes: 'Photoshop 24.x minimum: native UXP UI only, no local WebView.',
  },
  'photoshop-2026': {
    alias: 'photoshop-2026',
    target: 'photoshop-uxp',
    webProfiles: [],
    runtimeResolutionRequired: false,
    notes: 'Photoshop 27.x: same native UXP build, optional WebView profile when validated.',
  },
  affinity: {
    alias: 'affinity',
    target: 'affinity-script',
    webProfiles: [],
    runtimeResolutionRequired: false,
    notes: 'Affinity 3.3+ JavaScript Scripting SDK (Beta). Release scope depends on SDK stability.',
  },
} as const satisfies Record<string, ResolvedBuildPlan>;

export type BuildTargetInput = HostTargetId | AnnualAlias | 'all';

export function isHostTargetId(value: string): value is HostTargetId {
  return Object.hasOwn(HOST_TARGETS, value);
}

export function isAnnualAlias(value: string): value is AnnualAlias {
  return Object.hasOwn(ANNUAL_ALIASES, value);
}

/**
 * Cache key inputs for the build dedupe rules in §6.10. Hashing the sources themselves is
 * the build script's job; this function only defines what has to participate.
 */
export function buildCacheKeyParts(input: {
  sourceHash: string;
  profile: string;
  runtime: string;
  options?: Readonly<Record<string, string>>;
}): string[] {
  return [
    input.sourceHash,
    input.profile,
    input.runtime,
    ...Object.entries(input.options ?? {})
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`),
  ];
}
