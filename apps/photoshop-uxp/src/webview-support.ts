/** UXP documents versions.uxp as a prefixed string, e.g. "uxp-9.3.0". */
export function localWebviewUnavailableReason(
  photoshopVersion: string,
  uxpVersion: string,
  postMessage: unknown,
): string | null {
  const ps = /^(\d+)\.\d+\.\d+(?:[-+].*)?$/.exec(photoshopVersion);
  const uxp = /^(?:uxp-)?(\d+)\.\d+\.\d+(?:[-+].*)?$/.exec(uxpVersion);
  if (!ps || !uxp) return '无法识别宿主版本';
  if (Number(ps[1]) < 26 || Number(uxp[1]) < 8) return '需要 Photoshop 26+ / UXP 8+';
  if (typeof postMessage !== 'function') return 'WebView 消息桥不可用';
  return null;
}
