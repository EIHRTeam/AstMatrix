import type { NormalizedRequest } from '../index';
import { invalid, mod10 } from './validation';

/** IFA PZN/PPN check digit calculation, 26 January 2024: ASCII weights 2,3,... mod 97. */
export function ppnCheckDigits(body: string): string {
  return String([...body].reduce((sum, c, i) => sum + c.charCodeAt(0) * (i + 2), 0) % 97).padStart(
    2,
    '0',
  );
}
function validatePzn(pzn: string): void {
  const check =
    pzn
      .slice(0, 7)
      .split('')
      .reduce((sum, d, i) => sum + Number(d) * (i + 1), 0) % 11;
  if (check === 10 || String(check) !== pzn[7]) invalid('text', '内嵌 PZN 校验位不正确');
}
export function normalizeHealthcare(profileId: string, fields: NormalizedRequest['fields']): void {
  if (profileId !== 'ntin' && profileId !== 'ppn') return;
  fields.text = fields.text.trim();
  const text = fields.text;
  if (profileId === 'ntin') {
    if (!/^04150\d{9}$/.test(text) || mod10(text.slice(0, -1)) !== text.slice(-1))
      invalid('text', 'NTIN-DE 需要 04150 前缀和正确的 GTIN 校验位');
    validatePzn(text.slice(5, 13));
  } else {
    if (!/^11\d{10}$/.test(text) || ppnCheckDigits(text.slice(0, -2)) !== text.slice(-2))
      invalid('text', '当前 PPN-DE 需要 11 前缀和正确的两位 PPN 校验');
    validatePzn(text.slice(2, 10));
  }
  const date = fields.expiry!;
  const year = 2000 + Number(date.slice(0, 2)),
    month = Number(date.slice(2, 4)),
    day = Number(date.slice(4));
  if (month < 1 || month > 12 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())
    invalid('expiry', '有效期必须为有效 YYMMDD 日期，DD=00 表示月底');
}
/** ISO/IEC 15434 Format 06, no ECI prefix. Control bytes are generated, never user escapes. */
export function ppnPayload(fields: NormalizedRequest['fields']): string {
  return `[)>\x1e06\x1d9N${fields.text}\x1d1T${fields.batch}\x1dD${fields.expiry}\x1dS${fields.serial}\x1e\x04`;
}
export function ntinPayload(fields: NormalizedRequest['fields']): string {
  return `(01)${fields.text}(17)${fields.expiry}(10)${fields.batch}(21)${fields.serial}`;
}
