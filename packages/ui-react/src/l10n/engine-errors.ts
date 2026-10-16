import type { AstMatrixError } from '@astmatrix/shared';

/** Raw provider messages remain diagnostic data; the UI only displays these localized actions. */
export function engineErrorMessage(error: Pick<AstMatrixError, 'code' | 'message'>): string {
  if (
    error.code === 'CAPACITY_EXCEEDED' ||
    /NoValidSymbol|maximum length|capacity|too[ _-]?long|does not fit|data.{0,20}too large/i.test(
      error.message,
    )
  )
    return '内容过长或不符合当前编码设置，请缩短内容或调整版本、尺寸及纠错级别。';
  if (error.code === 'MISSING_FONT' || /font|glyph/i.test(error.message))
    return '当前字体无法显示部分字符，请调整编码内容或关闭人眼可读文字。';
  if (error.code === 'PROVIDER_REQUEST_MISMATCH' || error.code === 'PROVIDER_VERSION_MISMATCH')
    return '编码结果校验失败，请重试或切换编码格式。';
  if (
    /invalid.{0,20}(option|version|level|rows|columns)|unsupported.{0,20}(option|version)|badOption/i.test(
      error.message,
    )
  )
    return '当前编码参数不受支持，请检查高级设置或恢复默认参数。';
  if (
    /invalid.{0,20}(character|content|data|input)|check.?digit|badCharacter|must contain|GS1/i.test(
      error.message,
    )
  )
    return '当前内容不符合所选编码格式，请检查字符范围和输入格式。';
  return '编码失败，请检查内容与参数后重试，或切换编码格式。';
}
