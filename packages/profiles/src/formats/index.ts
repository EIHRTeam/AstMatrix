import { z } from 'zod';
import { code49Profile } from './code49';
import { invalid } from './validation';
import { getSymbology } from '@astmatrix/symbology-catalog';
import type {
  FieldDefinition,
  ProfileDefinition,
  GenerateRequest,
  NormalizedRequest,
} from '../index';
import { normalizeRetail, normalizePublication } from './retail';
import { normalizeHealthcare } from './healthcare';

const field = (name: string, label: string, options?: string[]): FieldDefinition => ({
  name,
  label,
  kind: options ? 'select' : 'text',
  ...(options ? { options } : {}),
});
const samples: Record<string, string> = {
  ean14: '09528765432108',
  'gs1-128': '(01)09521234543213(3103)000123',
  ean8composite: '95200002',
  ean13composite: '9520123456788',
  upca: '012345000058',
  upce: '01234558',
  upcacomposite: '012345000058',
  upcecomposite: '01234558',
  code11: '123-45',
  interleaved2of5: '123456',
  code39: 'ABC-123',
  code39ext: 'Abc-123',
  code93: 'ABC-123',
  flattermarken: '11099',
  msi: '123456',
  pharmacode: '117480',
  pharmacode2: '117480',
  telepen: 'ABC-123',
  isbn: '978-1-56581-231-4',
  ismn: '979-0-2605-3211-3',
  issn: '0311-175X',
  azteccode: 'AstMatrix',
  codablockf: 'AstMatrix-12345',
  maxicode: 'ASTMATRIX-12345',
  micropdf417: 'AstMatrix',
  pdf417: 'AstMatrix',
  microqrcode: '12345',
  hanxin: 'AstMatrix',
  dotcode: 'AstMatrix',
  mailmark: 'JGB 012100123412345678AB19XY1A 0             www.xyz.com',
  gs1datamatrix: '04150037528643',
};
const descriptions: Record<string, string> = {
  ean14: '输入完整 14 位 GTIN，编码为带 AI (01) 的 GS1-128；补位需明确选择。',
  'gs1-128': '使用 GS1 AI 括号语法，如 (01)09521234543213(10)LOT123；引擎校验 AI 和数据。',
  upca: '输入完整 12 位 UPC-A；自动补位模式只输入 11 位正文。',
  upce: '输入 0/1 数字系统 + 六位压缩数据 + 校验位；校验基于展开后的 UPC-A。',
  code11: '数字及连字符；auto 按正文长度生成一或两位校验，输入不含校验位。',
  interleaved2of5: '仅数字，加可选校验后总位数须为偶数；不会静默补零。',
  code39: '数字、大写字母、空格及 -.$/+%；不含起止符 *，可选 Mod 43 校验。',
  code39ext: 'Full ASCII 0–127；控制字符需关闭 HRI；不替换大小写。',
  code93: 'Code 93 基本字符集；自动生成必要的 C/K 校验。',
  flattermarken: '仅数字的印刷装订标记；需人工检查方向和宿主输出。',
  msi: '仅数字；默认生成 Mod 10，可显式选择其他校验；输入为不含校验的正文。',
  pharmacode: '单轨数值 3–131070；保留条宽比例，默认不显示 HRI。',
  pharmacode2: '双轨数值 4–64570080；默认不显示 HRI。',
  telepen: 'Telepen Alpha / ASCII 0–127；控制字符需关闭 HRI。',
  isbn: '完整 ISBN-13（978/979，9790 属 ISMN），可带原有连字符；附加码单独输入。',
  ismn: '完整 13 位 ISMN（9790 前缀），可带原有连字符。',
  issn: '完整 ISSN（末位可为 X）；序列变体构成主码，EAN-2 附加码单独输入。',
  hanxin: '当前引擎只开放可打印 ASCII；不支持 ECI，不会把中文静默编码为错误字符集。',
  microqrcode: 'Micro QR / 可打印 ASCII / 自动版本与纠错；静区为两个模块。',
  codablockf: 'Codablock F / 可打印 ASCII / 自动堆叠布局，保持行列比例。',
  maxicode: 'MaxiCode 模式 2/3 使用分离的邮编、国家码、服务等级；模式 4/5 编码通用 ASCII 消息。',
  mailmark: 'Mailmark 2D 类型 7/9/29；保留 JGB 头与空格，静区 4X。技术生成，业务与行业验收待完成。',
  gs1datamatrix:
    'NTIN-DE / 04150 前缀 / 内嵌 PZN 校验 / GS1 Data Matrix；技术生成，行业验收待完成。',
};
const checksumOptions: Record<string, string[]> = {
  code11: ['none', 'auto'],
  code39: ['none', 'mod43'],
  interleaved2of5: ['none', 'mod10'],
  msi: ['none', 'mod10', 'mod1010', 'mod11', 'mod1110'],
};
/** Profiles own input vocabulary; provider options are assembled only inside barcode-core. */
export function extendedProfiles(
  commonFields: FieldDefinition[],
  commonSchema: Record<string, z.ZodType>,
  linearFields: FieldDefinition[],
): ProfileDefinition[] {
  const result: ProfileDefinition[] = [];
  for (const [symbologyId, text] of Object.entries(samples)) {
    const symbol = getSymbology(symbologyId);
    for (const id of symbol.profileIds) {
      const linear = symbol.layout === 'linear' || symbol.layout === 'composite';
      const extras: FieldDefinition[] = [];
      const schema: Record<string, z.ZodType> = {};
      const defaults: Record<string, unknown> = {
        text,
        moduleMm:
          symbologyId === 'maxicode'
            ? 0.88
            : symbologyId === 'pharmacode2'
              ? 1
              : ['mailmark', 'pharmacode'].includes(symbologyId)
                ? 0.5
                : linear
                  ? 0.33
                  : 0.4,
        foreground: '000000',
        background: 'transparent',
        mergePaths: true,
        ...(linear
          ? {
              heightMm: 15,
              hri: !['pharmacode', 'pharmacode2', 'flattermarken'].includes(symbologyId),
            }
          : {}),
      };
      const add = (f: FieldDefinition, value: unknown, s: z.ZodType) => {
        extras.push(f);
        defaults[f.name] = value;
        schema[f.name] = s;
      };
      if (linear) {
        schema.heightMm = z.number().finite().positive().max(500).default(15);
        schema.hri = z.boolean().default(Boolean(defaults.hri));
      }
      if (['upca', 'upce', 'ean14'].includes(symbologyId))
        add(
          field('checkDigit', '校验位策略', ['validate', 'generate']),
          'validate',
          z.enum(['validate', 'generate']).default('validate'),
        );
      if (symbol.layout === 'composite')
        add(
          field('secondary', '二维组件（GS1 AI 括号语法）'),
          '(21)A12345678',
          z.string().min(1).max(4096),
        );
      if (checksumOptions[symbologyId]) {
        const opts = checksumOptions[symbologyId]!;
        const preferred =
          symbologyId === 'code11' ? 'auto' : symbologyId === 'msi' ? 'mod10' : 'none';
        add(
          field('checksum', '附加校验（输入为正文）', opts),
          preferred,
          z.enum(opts as [string, ...string[]]).default(preferred),
        );
      }
      if (id === 'isbn13-addon5' || id === 'issn-addon2') {
        const length = id === 'isbn13-addon5' ? 5 : 2;
        add(
          field('addon', `附加码（${length} 位数字）`),
          length === 5 ? '90000' : '17',
          z.string().regex(new RegExp(`^\\d{${length}}$`), `需要 ${length} 位数字`),
        );
      }
      if (symbologyId === 'issn')
        add(
          field('issue', 'ISSN 序列变体（2 位数字）'),
          '00',
          z
            .string()
            .regex(/^\d{2}$/)
            .default('00'),
        );
      if (symbologyId === 'maxicode')
        add(
          {
            name: 'mode',
            valueType: 'number',
            label: 'MaxiCode 模式（2/3 物流，4/5 通用）',
            kind: 'select',
            options: ['2', '3', '4', '5'],
          },
          4,
          z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).default(4),
        );
      if (symbologyId === 'maxicode') {
        add(
          field('postalCode', '物流邮编（模式 2/3）'),
          '152382802',
          z.string().max(9).default('152382802'),
        );
        add(field('countryCode', '国家码（模式 2/3，3 位数字）'), '840', z.string().default('840'));
        add(
          field('serviceClass', '服务等级（模式 2/3，3 位数字）'),
          '001',
          z.string().default('001'),
        );
      }
      if (symbologyId === 'hanxin' || symbologyId === 'microqrcode') {
        const micro = symbologyId === 'microqrcode';
        add(
          {
            name: 'version',
            label: micro ? 'Micro QR 版本（0 自动，1–4）' : 'Han Xin 版本（0 自动，1–84）',
            kind: 'number',
            advanced: true,
          },
          0,
          z
            .number()
            .int()
            .min(0)
            .max(micro ? 4 : 84)
            .default(0),
        );
        const eccs = micro ? ['L', 'M', 'Q'] : ['L1', 'L2', 'L3', 'L4'];
        const defaultEcc = micro ? 'L' : 'L2';
        add(
          { ...field('ecc', '纠错级别', eccs), advanced: true },
          defaultEcc,
          z.enum(eccs as [string, ...string[]]).default(defaultEcc),
        );
      }
      if (symbologyId === 'mailmark')
        add(
          field('mailmarkType', 'Mailmark 2D 类型', ['7', '9', '29']),
          '29',
          z.enum(['7', '9', '29']).default('29'),
        );
      if (symbologyId === 'gs1datamatrix') {
        add(
          field('serial', '序列号（1–20 位字母数字）'),
          'ABC123',
          z.string().regex(/^[A-Za-z0-9]{1,20}$/),
        );
        add(
          field('batch', '批次（1–20 位字母数字或 -_.）'),
          'LOT123',
          z.string().regex(/^[A-Za-z0-9._-]{1,20}$/),
        );
        add(field('expiry', '有效期（YYMMDD，DD 可为 00）'), '291231', z.string().regex(/^\d{6}$/));
      }
      result.push({
        id,
        label: id === 'ntin' ? 'NTIN-DE / GS1 Data Matrix（技术生成）' : id,
        description:
          symbol.layout === 'composite'
            ? '线性编号与二维 GS1 AI 内容分开输入；校验线性编号，二维 AI 由引擎校验。'
            : (descriptions[symbologyId] ?? 'UTF-8 / ECI 26；保留原始内容和码制静区。'),
        symbologyId,
        fields: [
          ...commonFields.map((f) =>
            f.name === 'text' && symbologyId === 'gs1datamatrix'
              ? { ...f, label: 'NTIN-DE（14 位完整编号）' }
              : f,
          ),
          ...(linear ? linearFields : []),
          ...extras,
        ],
        defaults,
        inputSchema: z.strictObject({
          ...commonSchema,
          moduleMm: z.number().finite().positive().max(10).default(Number(defaults.moduleMm)),
          ...schema,
        }),
      });
    }
  }
  // PPN shares the Data Matrix carrier, but never the generic text/ECI profile.
  const dmCommon = {
    ...commonSchema,
    text: z.string().regex(/^11\d{10}$/, '当前 PPN-DE 需要 11 + 8 位 PZN + 2 位校验'),
  };
  result.push({
    id: 'ppn',
    label: 'PPN-DE / ISO 15434 Format 06（技术生成）',
    symbologyId: 'datamatrix',
    description:
      'PPN-DE / 11 前缀 / PZN 与 ASCII 加权 Mod 97 校验 / ISO 15434 Format 06；技术生成，行业验收待完成。',
    fields: [
      ...commonFields.map((f) =>
        f.name === 'text' ? { ...f, label: 'PPN-DE（12 位完整编号）' } : f,
      ),
      field('serial', '序列号'),
      field('batch', '批次'),
      field('expiry', '有效期（YYMMDD）'),
    ],
    defaults: {
      text: '110375286414',
      moduleMm: 0.4,
      foreground: '000000',
      background: 'transparent',
      mergePaths: true,
      serial: 'ABC123',
      batch: 'LOT123',
      expiry: '291231',
    },
    inputSchema: z.strictObject({
      ...dmCommon,
      moduleMm: z.number().finite().positive().max(10).default(0.4),
      serial: z.string().regex(/^[A-Za-z0-9]{1,20}$/),
      batch: z.string().regex(/^[A-Za-z0-9._-]{1,20}$/),
      expiry: z.string().regex(/^\d{6}$/),
    }),
  });
  result.push(code49Profile(commonFields, commonSchema));
  return result;
}
export function normalizeExtended(
  request: GenerateRequest,
  fields: NormalizedRequest['fields'],
): void {
  const id = request.symbologyId;
  normalizeRetail(id, fields);
  normalizePublication(id, fields);
  normalizeHealthcare(request.profileId, fields);
  const text = fields.text;
  if (id.endsWith('composite')) {
    if (/[|\r\n]/.test(text) || !fields.secondary || /[|\r\n]/.test(fields.secondary))
      invalid('secondary', '请分开填写线性与二维组件，不接受分隔符注入');
    if (!/^\(\d{2,4}\)/.test(fields.secondary))
      invalid('secondary', '二维组件需要 GS1 AI 括号语法');
  }
  const digits = ['interleaved2of5', 'msi', 'pharmacode', 'pharmacode2', 'flattermarken'];
  if (digits.includes(id) && !/^\d+$/.test(text)) invalid('text', '该码制只接受数字');
  if (id === 'interleaved2of5' && (text.length + (fields.checksum === 'mod10' ? 1 : 0)) % 2)
    invalid('text', 'Interleaved 2of5 加校验后必须为偶数位；不会静默补零');
  if (id === 'code11' && !/^[0-9-]+$/.test(text)) invalid('text', 'Code 11 只接受数字和连字符');
  if (['code39', 'code93'].includes(id) && !/^[0-9A-Z .$/+%-]+$/.test(text))
    invalid('text', 'Code 39/93 需要大写 ASCII 字符集，不含起止符 *');
  if (['code39ext', 'telepen'].includes(id) && ![...text].every((c) => c.charCodeAt(0) <= 127))
    invalid('text', '当前 Profile 只接受 ASCII（0–127）');
  if (fields.hri && [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
    invalid('hri', '控制字符无法显示为 OCR-B；请关闭人眼可读文字');
  if (id === 'pharmacode' || id === 'pharmacode2') {
    const min = id === 'pharmacode' ? 3 : 4,
      max = id === 'pharmacode' ? 131070 : 64570080;
    if (text.length > 8 || Number(text) < min || Number(text) > max)
      invalid('text', `数值范围为 ${min}–${max}`);
  }
  if (
    ['microqrcode', 'codablockf', 'maxicode', 'hanxin'].includes(id) &&
    !/^[\x20-\x7e]+$/.test(text)
  )
    invalid('text', '当前 Profile 只接受可打印 ASCII，不做字符替换');
  if (id === 'maxicode' && (fields.mode === 2 || fields.mode === 3)) {
    const postal = fields.postalCode ?? '';
    if (fields.mode === 2 ? !/^\d{1,9}$/.test(postal) : !/^[A-Z0-9 ]{1,6}$/.test(postal))
      invalid(
        'postalCode',
        fields.mode === 2
          ? '模式 2 邮编需要 1–9 位数字'
          : '模式 3 邮编需要 1–6 位大写字母、数字或空格',
      );
    for (const key of ['countryCode', 'serviceClass'] as const)
      if (!/^\d{3}$/.test(fields[key] ?? '')) invalid(key, '需要三位数字，保留前导零');
  }
  if (id === 'gs1-128' && (!/^\(\d{2,4}\)/.test(text) || /[|\r\n]/.test(text)))
    invalid('text', 'GS1-128 需要 GS1 AI 括号语法');
  if (
    id === 'mailmark' &&
    (!text.startsWith('JGB ') || text.length < 45 || !/^[\x20-\x7e]+$/.test(text))
  )
    invalid('text', 'Mailmark 2D 需要以 JGB 空格开头且至少 45 个 ASCII 字符，保留填充空格');
}
