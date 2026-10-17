/**
 * @astmatrix/affinity-script — script entry (SKELETON).
 *
 * Responsibility
 *   Open the native Affinity dialog, keep its state without React, drive the shared
 *   application service, show a live canvas preview through a temporary document command,
 *   and commit a compound DocumentCommand on confirm (cleaning the preview up on cancel).
 *
 * Constraints
 *   * The Affinity JavaScript runtime is neither a browser nor Node.js. bwip-js compatibility
 *     must be proven in the real runtime before it is relied upon.
 *   * No React Context is involved: state follows the SDK event model.
 *   * Metadata persistence and re-editing need separate verification.
 *
 * Status: intentionally empty. The Affinity target is not implemented yet.
 */

export {};
