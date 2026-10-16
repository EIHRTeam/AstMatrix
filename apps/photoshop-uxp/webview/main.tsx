import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { AstMatrixPanel, AstMatrixProviders } from '@astmatrix/ui-react';
import { createWebviewAdapter } from '../src/webview-client';
import type { WebviewClientWindow } from '../src/webview-client';
import '@astmatrix/ui-react/styles.css';
const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');
try {
  new RegExp('(?<=a)b');
  if (
    typeof TextEncoder !== 'function' ||
    typeof Promise !== 'function' ||
    typeof URL !== 'function'
  )
    throw new Error('WebView 缺少必需的 Web API，请使用原生面板');
  const { adapter, transport } = createWebviewAdapter(window as unknown as WebviewClientWindow);
  void adapter.refresh().catch(console.error);
  const timer = setInterval(() => {
    void adapter.refresh().catch(console.error);
  }, 750);
  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
    adapter.dispose();
  });
  const service = new AstMatrixApplicationService();
  function WebviewPanel() {
    const hostLocale = useSyncExternalStore(transport.subscribeLocale, transport.getLocale);
    return (
      <AstMatrixProviders
        service={service}
        adapter={adapter}
        hostLocale={hostLocale}
        openProject={() => transport.openProject()}
      >
        <AstMatrixPanel />
      </AstMatrixProviders>
    );
  }
  createRoot(container).render(<WebviewPanel />);
} catch (error) {
  container.textContent = String(error);
}
