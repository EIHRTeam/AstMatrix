/** Figma-specific transport control messages wrap the unchanged host protocol. */
export const FIGMA_CHANNEL = 'astmatrix-figma-v1';
export const FIGMA_BRIDGE_VERSION = '4';
export const FIGMA_MESSAGE_LIMIT = 8 * 1024 * 1024;
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function messageId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{1,256}$/i.test(value);
}
/** Native relays can deliver ordinary objects from another realm or without a prototype.
 * Rebuild only JSON-shaped containers locally before the shared canonical validators run.
 * Keep unsupported values intact so validators reject them rather than silently dropping them.
 */
export function normalizeFigmaMessage(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeFigmaMessage);
  if (record(value) && Object.prototype.toString.call(value) === '[object Object]')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeFigmaMessage(item)]),
    );
  return value;
}
