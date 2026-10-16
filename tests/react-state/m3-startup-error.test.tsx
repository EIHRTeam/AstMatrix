import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { showPanelStartupError } from '../../apps/illustrator-cep/panel/startup-error';

afterEach(() => vi.unstubAllGlobals());

function BrokenPanel(): never {
  throw new Error('Panel initialization failed');
}

it('restores a visible error message when React clears a failed panel root', async () => {
  // act() rethrows render errors instead of invoking the production root error callback.
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
  document.body.innerHTML = '<div id="root"><p id="startup-status">Starting</p></div>';
  const container = document.getElementById('root')!;
  const root = createRoot(container, {
    onUncaughtError: (error) => showPanelStartupError(container, error),
  });
  root.render(<BrokenPanel />);
  await vi.waitFor(() =>
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Panel initialization failed',
    ),
  );
  expect(container.querySelector('#startup-status')).not.toBeNull();
  root.unmount();
});
