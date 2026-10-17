/**
 * @astmatrix/tooling — manifest generation scaffold.
 *
 * Responsibility
 *   Generate host manifests from one declared source of truth, without letting project
 *   specific target fields leak into Adobe's manifest schema.
 *
 * Module layout
 *   cep.ts       CSXS/manifest.xml: host ILST, version range syntax, RequiredRuntime, panel
 *                and JSX entry points, multi-bundle Web UI selection
 *   uxp.ts       manifest.json: manifestVersion 5, host.minVersion, minimum-version permissions
 *   affinity.ts  affinity script bundle descriptor following the SDK's supported layout
 *
 * Status
 *   Host builds copy the authoritative app manifests into development directories.
 *   Photoshop uses separate native and enhanced manifests to preserve its version floor.
 *   Signed release manifests and packaging are not implemented yet.
 */

export {};
