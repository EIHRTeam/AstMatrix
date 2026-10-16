/** React may clear #root after a fatal render error, including its original startup message. */
export function showPanelStartupError(container: HTMLElement, error: unknown): void {
  const status = container.ownerDocument.createElement('p');
  status.id = 'startup-status';
  status.setAttribute('role', 'alert');
  status.textContent =
    'AstMatrix 无法启动 / Unable to start AstMatrix\n' +
    (error instanceof Error ? error.message : String(error));
  container.replaceChildren(status);
}
