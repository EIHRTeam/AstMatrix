/** Copy source text, including in embedded Chromium without the async Clipboard API. */
export async function copySvgToClipboard(svg: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(svg);
      return;
    } catch {
      // Embedded panels may deny the async API while allowing a user-initiated copy command.
    }
  }
  const previousFocus = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = svg;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    if (typeof document.execCommand !== 'function' || !document.execCommand('copy'))
      throw new Error('无法访问剪贴板，请允许剪贴板访问后重试。');
  } finally {
    textarea.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}
