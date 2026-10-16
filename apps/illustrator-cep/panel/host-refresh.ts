import type { CSInterfaceLike } from '@astmatrix/host-adapter-illustrator-cep';

const visibilityEvent = 'com.adobe.csxs.events.panelWindowStatusChanged';
const pollMs = 2500;
const interactionDelayMs = 500;

/** Give the initial UI a paint before registering native listeners or reading the host. */
export function afterPanelPaint(view: Window, start: () => () => void): () => void {
  let stop: (() => void) | undefined;
  let closed = false;
  let frame = view.requestAnimationFrame(() => {
    frame = view.requestAnimationFrame(() => {
      if (!closed) stop = start();
    });
  });
  return () => {
    closed = true;
    view.cancelAnimationFrame(frame);
    stop?.();
  };
}

/** Keep background host reads away from panel interaction and never queue polling work. */
export function startHostRefresh(
  adapter: { refresh: () => Promise<void> },
  cs: CSInterfaceLike,
  page: Document,
  view: Window,
  onError: (error: unknown) => void,
): () => void {
  let stopped = false;
  // isWindowVisible() is a synchronous native invoke. Never put it on the startup path.
  // The DOM visibility state and CEP show/hide events are sufficient for background polling.
  let visible = true;
  let inFlight = false;
  let lastInteraction = -Infinity;
  let timer: number | undefined;
  const active = () => visible && !page.hidden;
  const schedule = (delay: number) => {
    view.clearTimeout(timer);
    timer = undefined;
    if (!stopped && active() && !inFlight) timer = view.setTimeout(refresh, delay);
  };
  const refresh = () => {
    timer = undefined;
    if (stopped || !active() || inFlight) return;
    const remaining = interactionDelayMs - (Date.now() - lastInteraction);
    if (remaining > 0) {
      schedule(remaining);
      return;
    }
    inFlight = true;
    void adapter
      .refresh()
      .catch((error: unknown) => {
        if (!stopped) onError(error);
      })
      .finally(() => {
        inFlight = false;
        schedule(pollMs);
      });
  };
  const interact = () => {
    lastInteraction = Date.now();
  };
  const visibilityChanged = () => schedule(0);
  const hostVisibilityChanged = (event: { data?: string }) => {
    if (event.data !== 'true' && event.data !== 'false') return;
    visible = event.data === 'true';
    visibilityChanged();
  };
  const interactions = ['pointerdown', 'pointermove', 'keydown', 'input', 'wheel'];
  for (const event of interactions) page.addEventListener(event, interact, { passive: true });
  page.addEventListener('visibilitychange', visibilityChanged);
  view.addEventListener('focus', visibilityChanged);
  if (cs.addEventListener && cs.removeEventListener)
    cs.addEventListener(visibilityEvent, hostVisibilityChanged);
  schedule(0);
  return () => {
    stopped = true;
    view.clearTimeout(timer);
    for (const event of interactions) page.removeEventListener(event, interact);
    page.removeEventListener('visibilitychange', visibilityChanged);
    view.removeEventListener('focus', visibilityChanged);
    if (cs.addEventListener && cs.removeEventListener)
      cs.removeEventListener(visibilityEvent, hostVisibilityChanged);
  };
}
