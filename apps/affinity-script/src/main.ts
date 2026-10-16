/**
 * @astmatrix/affinity-script — script entry (SKELETON).
 *
 * Responsibility (docs/plan/INIT.md §2.5, §9.6)
 *   Open the native Affinity dialog, keep its state without React, drive the shared
 *   application service, show a live canvas preview through a temporary document command,
 *   and commit a compound DocumentCommand on confirm (cleaning the preview up on cancel).
 *
 * Constraints
 *   * The Affinity JavaScript runtime is neither a browser nor Node.js. bwip-js
 *     compatibility must be proven by a spike before it is relied upon (§7.3, §16.9).
 *   * No React Context is involved: state follows the SDK event model (§2.5).
 *   * Metadata persistence and re-editing need separate verification (§16.10).
 *
 * Status: intentionally empty in this milestone. Implemented in M5 (§14).
 */

export {};
