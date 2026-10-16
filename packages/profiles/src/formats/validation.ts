import { AstMatrixError } from '@astmatrix/shared';
export function invalid(field: string, message: string): never {
  throw new AstMatrixError('INVALID_INPUT', message, 'business', { [field]: message });
}
export function mod10(body: string): string {
  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight)
    sum += Number(body[i]) * weight;
  return String((10 - (sum % 10)) % 10);
}
