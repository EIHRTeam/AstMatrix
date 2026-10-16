import type { ProfileDefinition } from '@astmatrix/profiles';

/** Input vocabulary follows the selected profile, never a generic ASCII claim for every code. */
export function contentPlaceholder(
  profile: ProfileDefinition,
  fields: { checkDigit?: unknown; hri?: unknown } = {},
): string {
  const id = profile.symbologyId.replace(/composite$/, '');
  if (profile.id === 'qr-mobile') return '请输入完整的 http:// 或 https:// 链接';
  if (profile.id === 'ntin') return '请输入以 04150 开头的完整 14 位 NTIN-DE 编号';
  if (profile.id === 'ppn') return '请输入以 11 开头的完整 12 位 PPN-DE 编号';
  if (['ean8', 'ean13', 'ean14', 'upca', 'upce'].includes(id)) {
    const generate = (fields.checkDigit ?? profile.defaults.checkDigit) === 'generate';
    const length =
      (id === 'ean14' ? 14 : id === 'ean13' ? 13 : id === 'upca' ? 12 : 8) - (generate ? 1 : 0);
    const prefix = id === 'upce' ? '以 0 或 1 开头的 ' : '';
    return `请输入${prefix}${length} 位数字（${generate ? '不含' : '含'}校验位）`;
  }
  if (id === 'gs1-128') return '请输入 GS1 AI 括号语法，例如 (01)09521234543213(10)LOT123';
  if (id === 'isbn') return '请输入完整 ISBN-13（978/979 前缀，可含连字符）';
  if (id === 'ismn') return '请输入完整 ISMN（9790 前缀，可含连字符）';
  if (id === 'issn') return '请输入完整 ISSN，例如 0311-175X';
  if (id === 'pharmacode') return '请输入 3–131070 范围内的整数';
  if (id === 'pharmacode2') return '请输入 4–64570080 范围内的整数';
  if (id === 'code11') return '请输入数字或连字符 (-)';
  if (id === 'interleaved2of5') return '请输入数字（含可选校验位后的总位数须为偶数）';
  if (['msi', 'flattermarken'].includes(id)) return '请输入数字';
  if (['code39', 'code93'].includes(id))
    return '请输入大写字母、数字、空格或 -.$/+%（不含起止符 *）';
  if (
    id === 'code49' ||
    (['code39ext', 'telepen'].includes(id) && !(fields.hri ?? profile.defaults.hri))
  )
    return '请输入 ASCII 字符（0–127，支持控制字符）';
  if (
    ['code128', 'code39ext', 'telepen', 'hanxin', 'microqrcode', 'codablockf', 'maxicode'].includes(
      id,
    )
  )
    return '请输入可打印 ASCII 字符，例如 ABC_123';
  if (id === 'mailmark')
    return '请输入以 JGB 空格开头的 Mailmark 内容（至少 45 个 ASCII 字符，保留空格）';
  if (['qrcode', 'datamatrix', 'azteccode', 'pdf417', 'micropdf417', 'dotcode'].includes(id))
    return '请输入文本（支持中文及其他 Unicode 字符）';
  return '请输入符合当前编码格式的内容';
}
