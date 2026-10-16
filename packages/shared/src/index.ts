export const MM_TO_PT = 72 / 25.4;
export const mmToPt = (mm: number) => finite(mm) * MM_TO_PT;
export const ptToMm = (pt: number) => finite(pt) / MM_TO_PT;
export function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Non-finite number');
  return value;
}
/** Canonical JSON rejects data that JSON would silently discard or turn into null. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(finite(value));
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  throw new Error('Expected plain JSON data');
}
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
export class AstMatrixError extends Error {
  readonly code: string;
  readonly layer: 'business' | 'provider' | 'host';
  readonly fields: Record<string, string>;
  constructor(
    code: string,
    message: string,
    layer: AstMatrixError['layer'] = 'business',
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'AstMatrixError';
    this.code = code;
    this.layer = layer;
    this.fields = fields;
  }
}
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export { PROJECT_URL, PROJECT_VERSION, LICENSE_URL } from './project';
