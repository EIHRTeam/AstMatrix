import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { IllustratorCepAdapter } from '@astmatrix/host-adapter-illustrator-cep';
import type { CSInterfaceLike } from '@astmatrix/host-adapter-illustrator-cep';
declare const CSInterface: new () => CSInterfaceLike;
import { AstMatrixPanel, AstMatrixProviders } from '@astmatrix/ui-react';
import '@astmatrix/ui-react/styles.css';
import { afterPanelPaint, startHostRefresh } from './host-refresh';
import { createCepLinkOpener } from './external-links';
import { showPanelStartupError } from './startup-error';
const service = new AstMatrixApplicationService();
const cs = new CSInterface();
const adapter = new IllustratorCepAdapter(cs);
const hostLocale = cs.getHostEnvironment().appUILocale;
const openExternal = createCepLinkOpener(cs);
const stopRefresh = afterPanelPaint(window, () =>
  startHostRefresh(adapter, cs, document, window, console.error),
);
window.addEventListener('beforeunload', () => {
  stopRefresh();
  adapter.dispose();
});
const container = document.getElementById('root');
if (!container) throw new Error('AstMatrix panel requires #root');
createRoot(container, {
  onUncaughtError: (error) => showPanelStartupError(container, error),
}).render(
  <StrictMode>
    <AstMatrixProviders
      service={service}
      adapter={adapter}
      hostLocale={hostLocale}
      openExternal={openExternal}
    >
      <AstMatrixPanel />
    </AstMatrixProviders>
  </StrictMode>,
);
