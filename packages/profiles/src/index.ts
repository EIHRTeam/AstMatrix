import { z } from 'zod';
import { AstMatrixError, deepFreeze } from '@astmatrix/shared';
import { extendedProfiles, normalizeExtended } from './formats';
import { getSymbology, isCompatible } from '@astmatrix/symbology-catalog';
export interface FieldDefinition {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'boolean';
  advanced?: boolean;
  valueType?: 'number';
  options?: readonly string[];
}
export interface GenerateRequest {
  symbologyId: string;
  profileId: string;
  fields: Record<string, unknown>;
}
export interface NormalizedRequest {
  symbologyId: string;
  inputFields?: Record<string, unknown>;
  profileId: string;
  text: string;
  fields: {
    text: string;
    moduleMm: number;
    heightMm: number;
    hri: boolean;
    foreground: string;
    background: string;
    mergePaths: boolean;
    checkDigit: 'validate' | 'generate';
    ecc: 'L' | 'M' | 'Q' | 'H' | 'L1' | 'L2' | 'L3' | 'L4';
    version: number;
    size: number;
    font: 'OCR-B';
    rows?: number;
    rowHeightModules?: number;
    separatorHeightModules?: number;
    secondary?: string;
    addon?: string;
    issue?: string;
    checksum?: string;
    mode?: number;
    mailmarkType?: string;
    postalCode?: string;
    countryCode?: string;
    serviceClass?: string;
    serial?: string;
    batch?: string;
    expiry?: string;
  };
}
const commonFields: FieldDefinition[] = [
  { name: 'text', label: '编码内容', kind: 'text' },
  { name: 'moduleMm', label: '模块宽度（mm）', kind: 'number', advanced: true },
  { name: 'foreground', label: '前景色（RGB hex）', kind: 'text', advanced: true },
  { name: 'background', label: '背景（transparent 或 RGB hex）', kind: 'text', advanced: true },
  { name: 'mergePaths', label: '合并同色路径', kind: 'boolean', advanced: true },
];
const linearFields: FieldDefinition[] = [
  { name: 'heightMm', label: '条高（mm）', kind: 'number', advanced: true },
  { name: 'hri', label: '人眼可读文字（OCR-B 轮廓）', kind: 'boolean', advanced: true },
];
const checkField: FieldDefinition = {
  name: 'checkDigit',
  label: '校验位策略',
  kind: 'select',
  options: ['validate', 'generate'],
  advanced: true,
};
const sizes = [
  0, 10, 12, 14, 16, 18, 20, 22, 24, 26, 32, 36, 40, 44, 48, 52, 64, 72, 80, 88, 96, 104, 120, 132,
  144,
];
const hex = z
  .string()
  .regex(/^[0-9a-fA-F]{6}$/, '请输入六位 RGB hex')
  .transform((v) => v.toUpperCase());
const positive = (max: number) => z.number().finite().positive().max(max);
const commonSchema = {
  text: z
    .string()
    .min(1, '请输入编码内容')
    .max(4096, '输入超过 4096 字符')
    .refine(
      (v) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v),
      '无效 Unicode 代理对',
    ),
  moduleMm: positive(10),
  foreground: hex.default('000000'),
  background: z.union([z.literal('transparent'), hex]).default('transparent'),
  mergePaths: z.boolean().default(true),
};
export interface ProfileDefinition {
  id: string;
  label: string;
  description?: string;
  symbologyId: string;
  fields: readonly FieldDefinition[];
  defaults: Record<string, unknown>;
  inputSchema: z.ZodType;
}
function profile(id: string, label: string, symbologyId: string, text: string): ProfileDefinition {
  const matrix = symbologyId === 'qrcode' || symbologyId === 'datamatrix';
  const retail = symbologyId === 'ean13' || symbologyId === 'ean8';
  const extra = matrix
    ? symbologyId === 'qrcode'
      ? ([
          {
            name: 'ecc',
            label: '纠错级别',
            kind: 'select',
            options: ['L', 'M', 'Q', 'H'],
            advanced: true,
          },
          { name: 'version', label: 'QR 版本（0 自动，1–40）', kind: 'number', advanced: true },
        ] satisfies FieldDefinition[])
      : ([
          {
            name: 'size',
            valueType: 'number',
            label: 'Data Matrix 边长（0 自动）',
            kind: 'select',
            options: sizes.map(String),
            advanced: true,
          },
        ] satisfies FieldDefinition[])
    : [...linearFields, ...(retail ? [checkField] : [])];
  const defaults = {
    text,
    moduleMm: matrix ? 0.4 : 0.33,
    foreground: '000000',
    background: 'transparent',
    mergePaths: true,
    ...(matrix
      ? symbologyId === 'qrcode'
        ? { ecc: 'M', version: 0 }
        : { size: 0 }
      : {
          heightMm: retail ? (symbologyId === 'ean13' ? 22.85 : 18.23) : 15,
          hri: true,
          ...(retail ? { checkDigit: 'validate' } : {}),
        }),
  };
  const inputSchema = z.strictObject({
    ...commonSchema,
    moduleMm: commonSchema.moduleMm.default(defaults.moduleMm),
    ...(matrix
      ? symbologyId === 'qrcode'
        ? {
            ecc: z.enum(['L', 'M', 'Q', 'H']).default('M'),
            version: z.number().int().min(0).max(40).default(0),
          }
        : {
            size: z
              .number()
              .int()
              .refine((v) => sizes.includes(v), '不支持的 ECC200 正方形尺寸')
              .default(0),
          }
      : {
          heightMm: positive(500).default(Number('heightMm' in defaults ? defaults.heightMm : 0)),
          hri: z.boolean().default(true),
          ...(retail ? { checkDigit: z.enum(['validate', 'generate']).default('validate') } : {}),
        }),
  });
  return { id, label, symbologyId, fields: [...commonFields, ...extra], defaults, inputSchema };
}
export const profiles: readonly ProfileDefinition[] = [
  profile('ean13-default', 'GTIN-13', 'ean13', '6901234567892'),
  profile('ean8-default', 'GTIN-8', 'ean8', '96385074'),
  profile('code128-default', '通用 ASCII', 'code128', 'ABC-12345'),
  profile('qr-default', '通用 UTF-8', 'qrcode', 'https://example.com/barcode'),
  profile('qr-mobile', 'Mobile / HTTPS 链接', 'qrcode', 'https://example.com/barcode'),
  profile('dm-default', 'ECC200 / UTF-8', 'datamatrix', 'ABC123'),
  ...extendedProfiles(commonFields, commonSchema, linearFields),
];
profiles.forEach((p) => {
  deepFreeze(p.defaults);
  deepFreeze(p.fields);
});
export function getProfile(id: string): ProfileDefinition {
  const p = profiles.find((p) => p.id === id);
  if (!p) throw new AstMatrixError('UNSUPPORTED_PROFILE', '该 Profile 尚未实现');
  return p;
}
export function checkDigit(body: string): string {
  if (!/^\d+$/.test(body)) throw new AstMatrixError('INVALID_INPUT', '校验位只接受数字');
  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight)
    sum += Number(body[i]) * weight;
  return String((10 - (sum % 10)) % 10);
}
export function normalizeRequest(request: GenerateRequest): NormalizedRequest {
  let symbology;
  try {
    symbology = getSymbology(request.symbologyId);
  } catch {
    throw new AstMatrixError('UNSUPPORTED_SYMBOLOGY', '未知码制');
  }
  if (symbology.status === 'listed')
    throw new AstMatrixError('UNSUPPORTED_SYMBOLOGY', symbology.reason);
  if (!isCompatible(request.symbologyId, request.profileId))
    throw new AstMatrixError('INCOMPATIBLE_PROFILE', '码制与 Profile 不兼容');
  const p = getProfile(request.profileId);
  const result = p.inputSchema.safeParse(request.fields);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues)
      fields[String(issue.path[0] ?? 'text')] = issue.message;
    throw new AstMatrixError('INVALID_INPUT', '请修正输入参数', 'business', fields);
  }
  const parsed = result.data as Partial<NormalizedRequest['fields']> & {
    text: string;
    moduleMm: number;
  };
  const inputFields = { ...parsed };
  const fields: NormalizedRequest['fields'] = {
    heightMm: 0,
    hri: false,
    checkDigit: 'validate',
    ecc: 'M',
    version: 0,
    size: 0,
    font: 'OCR-B',
    foreground: '000000',
    background: 'transparent',
    mergePaths: true,
    ...parsed,
  };
  const fail = (message: string) => {
    throw new AstMatrixError('INVALID_INPUT', message, 'business', { text: message });
  };
  if (request.symbologyId === 'ean13' || request.symbologyId === 'ean8') {
    fields.text = fields.text.trim();
    const length = request.symbologyId === 'ean13' ? 13 : 8;
    if (!/^\d+$/.test(fields.text)) fail('EAN 只接受数字');
    if (fields.checkDigit === 'generate') {
      if (fields.text.length !== length - 1) fail(`自动补位模式需要 ${length - 1} 位数字`);
      fields.text += checkDigit(fields.text);
    } else if (
      fields.text.length !== length ||
      checkDigit(fields.text.slice(0, -1)) !== fields.text.slice(-1)
    )
      fail(`需要 ${length} 位数字且校验位正确`);
  } else if (request.symbologyId === 'code128' && !/^[\x20-\x7E]+$/.test(fields.text))
    fail('Code 128 当前 Profile 只接受可打印 ASCII；不会替换字符');
  if (request.profileId === 'qr-mobile' && !/^https?:\/\/[^\s]+$/i.test(fields.text))
    fail('Mobile Profile 需要完整 http/https 链接');
  normalizeExtended(request, fields);
  return deepFreeze({
    inputFields,
    symbologyId: request.symbologyId as NormalizedRequest['symbologyId'],
    profileId: request.profileId,
    text: fields.text,
    fields,
  });
}
/** Keep compatible fields, keep invalid text for visible correction; reset only unavailable options. */
export function migrateFields(
  previous: Record<string, unknown>,
  next: ProfileDefinition,
): { fields: Record<string, unknown>; notice: string } {
  const fields = { ...next.defaults };
  const reset: string[] = [];
  for (const definition of next.fields)
    if (definition.name in previous) {
      const value = previous[definition.name];
      if (definition.options && !definition.options.includes(String(value)))
        reset.push(definition.label);
      else fields[definition.name] = value;
    }
  return {
    fields,
    notice: reset.length
      ? `已恢复预设值：${reset.join('、')}`
      : '已保留兼容字段；内容不兼容时会显示校验错误。',
  };
}

export { ppnPayload, ntinPayload, ppnCheckDigits } from './formats/healthcare';
export { expandUpce } from './formats/retail';

/** The same input guidance is consumed by React and native UXP forms. */
export function profileHint(profile: ProfileDefinition): string {
  if (profile.description) return profile.description;
  if (profile.symbologyId === 'ean13' || profile.symbologyId === 'ean8')
    return '默认校验完整 GTIN；自动补位需在高级设置中明确选择。';
  if (['qrcode', 'datamatrix'].includes(profile.symbologyId))
    return 'UTF-8 / ECI 26 · 正方形模块 · 静区随 SVG 一同保留。';
  return '保留输入内容，仅接受可打印 ASCII。';
}
