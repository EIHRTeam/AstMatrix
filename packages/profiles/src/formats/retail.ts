import type { NormalizedRequest } from '../index';
import { invalid, mod10 } from './validation';

/** Expand the explicit number system plus six UPC-E digits before computing its UPC-A check. */
export function expandUpce(body: string): string {
  if (!/^[01]\d{6}$/.test(body)) invalid('text', 'UPC-E 需要 0/1 数字系统 + 六位压缩数据');
  const [ns, a, b, c, d, e, f] = [...body] as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (Number(f) <= 2) return `${ns}${a}${b}${f}0000${c}${d}${e}`;
  if (f === '3') {
    if (Number(c) <= 2) invalid('text', 'UPC-E 非规范压缩：尾码 3 的第三位必须为 3–9');
    return `${ns}${a}${b}${c}00000${d}${e}`;
  }
  if (f === '4') {
    if (d === '0') invalid('text', 'UPC-E 非规范压缩：尾码 4 的第四位不可为 0');
    return `${ns}${a}${b}${c}${d}00000${e}`;
  }
  if (e === '0') invalid('text', 'UPC-E 非规范压缩：尾码 5–9 的第五位不可为 0');
  return `${ns}${a}${b}${c}${d}${e}0000${f}`;
}
export function normalizeRetail(id: string, fields: NormalizedRequest['fields']): void {
  const carrier = id.replace(/composite$/, '');
  if (
    !['ean14', 'upca', 'upce', 'ean8', 'ean13'].includes(carrier) ||
    id === 'ean8' ||
    id === 'ean13'
  )
    return;
  fields.text = fields.text.trim();
  const length = carrier === 'ean14' ? 14 : carrier === 'upca' ? 12 : carrier === 'ean13' ? 13 : 8;
  const generate = fields.checkDigit === 'generate';
  if (!/^\d+$/.test(fields.text) || fields.text.length !== length - (generate ? 1 : 0))
    invalid('text', `需要 ${length - (generate ? 1 : 0)} 位数字`);
  const body = generate ? fields.text : fields.text.slice(0, -1);
  const check = mod10(carrier === 'upce' ? expandUpce(body) : body);
  if (generate) fields.text += check;
  else if (fields.text.slice(-1) !== check) invalid('text', '校验位不正确');
}
export function normalizePublication(id: string, fields: NormalizedRequest['fields']): void {
  if (!['isbn', 'ismn', 'issn'].includes(id)) return;
  fields.text = fields.text.trim();
  const text = fields.text;
  if (id === 'issn') {
    if (!/^\d{4}-?\d{3}[\dX]$/.test(text))
      invalid('text', '需要完整 ISSN：XXXX-XXXX（末位可为 X）');
    const digits = text.replace('-', '');
    const check =
      (11 -
        (digits
          .slice(0, 7)
          .split('')
          .reduce((sum, d, i) => sum + Number(d) * (8 - i), 0) %
          11)) %
      11;
    if (digits[7] !== (check === 10 ? 'X' : String(check))) invalid('text', 'ISSN 校验位不正确');
    fields.text = `${digits.slice(0, 4)}-${digits.slice(4)}`;
  } else {
    if (!/^\d+(?:-\d+)*$/.test(text)) invalid('text', '需要完整 13 位出版物编号，可带连字符');
    const digits = text.replace(/-/g, '');
    if (digits.length !== 13 || mod10(digits.slice(0, -1)) !== digits.slice(-1))
      invalid('text', '需要完整 13 位编号且校验位正确');
    if (
      id === 'isbn'
        ? !/^97[89]/.test(digits) || digits.startsWith('9790')
        : !digits.startsWith('9790')
    )
      invalid(
        'text',
        id === 'isbn' ? 'ISBN-13 需要 978/979 前缀，9790 为 ISMN' : 'ISMN 需要 9790 前缀',
      );
    if (text.includes('-') && !/^97[89]-\d+-\d+-\d+-\d$/.test(text))
      invalid('text', '带连字符的编号需要完整的五段格式；也可输入不带连字符的 13 位数字');
  }
}
