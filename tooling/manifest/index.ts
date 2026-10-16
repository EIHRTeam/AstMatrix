/**
 * @astmatrix/tooling — manifest generation (docs/plan/INIT.md §12.5).
 *
 * Responsibility
 *   Generate host manifests from one declared source of truth, without letting project
 *   specific target fields leak into Adobe's manifest schema (§4.8).
 *
 * Planned modules
 *   cep.ts    CSXS/manifest.xml: host ILST, version range syntax, RequiredRuntime, panel and
 *             JSX entry points, multi-bundle Web UI selection (§4.4, §4.7)
 *   uxp.ts    manifest.json: manifestVersion 5, host.minVersion (Photoshop 24.x floor),
 *             permissions limited to what the minimum version actually supports (§4.6)
 *   affinity.ts  affinity script bundle descriptor following the SDK's supported layout
 *
 * Status
 *   M3/M4 host builds copy the authoritative app manifests into development directories.
 *   Photoshop uses separate native and enhanced manifests to preserve the 24.x floor.
 *   Signed release manifests and packaging remain M6.
 */

export {};
