import { z } from 'zod';
import type { FieldDefinition, ProfileDefinition } from '../index';

/** Code 49 is an ASCII stacked symbol; the renderer owns its row geometry, never a linear bar stretch. */
export function code49Profile(
  commonFields: FieldDefinition[],
  commonSchema: Record<string, z.ZodType>,
): ProfileDefinition {
  return {
    id: 'code49-default',
    symbologyId: 'code49',
    label: 'Code 49 / ASCII',
    description:
      'ASCII 0–127，保留大小写与控制字符；自动生成行/符号校验。2–8 行堆叠，不支持 Unicode 或 ECI。',
    fields: [
      ...commonFields,
      { name: 'rows', label: 'Code 49 行数（0 自动，2–8）', kind: 'number', advanced: true },
      {
        name: 'rowHeightModules',
        label: 'Code 49 行高（8–50 模块）',
        kind: 'number',
        advanced: true,
      },
      {
        name: 'separatorHeightModules',
        label: 'Code 49 分隔高度（1–5 模块）',
        kind: 'number',
        advanced: true,
      },
    ],
    defaults: {
      text: 'MULTIPLE ROWS IN CODE 49',
      moduleMm: 0.4,
      foreground: '000000',
      background: 'transparent',
      mergePaths: true,
      rows: 0,
      rowHeightModules: 8,
      separatorHeightModules: 1,
    },
    inputSchema: z.strictObject({
      ...commonSchema,
      text: z
        .string()
        .min(1, '请输入编码内容')
        .max(500, 'Code 49 输入超过 500 字符')
        .refine(
          (text) => [...text].every((c) => c.charCodeAt(0) <= 127),
          'Code 49 只接受 ASCII（0–127），不做字符替换',
        ),
      moduleMm: z.number().finite().positive().max(10).default(0.4),
      rows: z
        .number()
        .int()
        .min(0)
        .max(8)
        .refine((rows) => rows !== 1, 'Code 49 行数需为 0 或 2–8')
        .default(0),
      rowHeightModules: z.number().int().min(8).max(50).default(8),
      separatorHeightModules: z.number().int().min(1).max(5).default(1),
    }),
  };
}
