/**
 * @astmatrix/tooling
 *
 * Responsibility
 *   Build orchestration helpers that never change encoder semantics.
 *
 * Module layout
 *   build-targets/  host target + web profile resolution and cache keys
 *   web-profiles/   cep11 (chrome88), cep12 (chrome99), uxp-webview, web-playground
 *   manifest/       CEP manifest.xml and UXP manifest.json generation
 *   packaging/      ZXP / CCX / script bundle assembly (signing stays separate)
 *
 * Status
 *   build-targets and web-profiles are implemented; manifest and packaging remain scaffolds.
 */

export {};
