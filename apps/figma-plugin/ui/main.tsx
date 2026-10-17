import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { FigmaPluginAdapter, FigmaTransport } from '@astmatrix/host-adapter-figma-plugin';
import { FigmaPanel } from './panel';
import '@astmatrix/ui-react/styles.css';
import './styles.css';

const transport = new FigmaTransport(window);
const adapter = new FigmaPluginAdapter(transport);
const service = new AstMatrixApplicationService();
window.addEventListener('beforeunload', () => adapter.dispose());
const container = document.getElementById('root');
if (!container) throw new Error('AstMatrix Figma panel requires #root');
createRoot(container, {
  onUncaughtError: () => {
    container.textContent =
      'AstMatrix could not start. Please reopen the plugin. / 插件启动失败，请重新打开。';
  },
}).render(
  <StrictMode>
    <FigmaPanel service={service} adapter={adapter} transport={transport} />
  </StrictMode>,
);
