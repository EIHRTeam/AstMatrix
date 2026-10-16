import { StrictMode, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { FakeHostAdapter } from '@astmatrix/host-contract';
import type { FakeFailure } from '@astmatrix/host-contract';
import { AstMatrixPanel, AstMatrixProviders, useLocale } from '@astmatrix/ui-react';
import '@astmatrix/ui-react/styles.css';
const service = new AstMatrixApplicationService();
const adapter = new FakeHostAdapter();
function DemoControls() {
  const { t } = useLocale();
  const host = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const [failure, setFailure] = useState<FakeFailure>('none');
  return (
    <aside className="demo-controls" aria-label={t('模拟宿主控制')}>
      <strong>{t('模拟宿主')}</strong>
      <button
        onClick={() =>
          adapter.setDocument(
            host.documentId === 'demo-document' ? 'other-document' : 'demo-document',
          )
        }
      >
        {t('切换文档')}
      </button>
      <button onClick={() => adapter.setDocument(host.documentId ? null : 'demo-document')}>
        {t(host.documentId ? '关闭文档' : '打开文档')}
      </button>
      <label>
        {t('失败场景')}{' '}
        <select
          aria-label={t('失败场景')}
          value={failure}
          onChange={(e) => {
            const value = e.target.value as FakeFailure;
            adapter.failure = value;
            setFailure(value);
          }}
        >
          <option value="none">{t('正常插入')}</option>
          <option value="provider-independent-host">{t('权限拒绝')}</option>
          <option value="partial-rollback">{t('部分失败 / 清理成功')}</option>
          <option value="rollback-failed">{t('部分失败 / 清理失败')}</option>
        </select>
      </label>
      <span>
        {t('文档')}：{host.documentId ?? t('无文档')} · {t('对象仅存于浏览器内存')}
      </span>
    </aside>
  );
}
const container = document.getElementById('root');
if (!container) throw new Error('AstMatrix playground requires #root');
createRoot(container).render(
  <StrictMode>
    <AstMatrixProviders service={service} adapter={adapter}>
      <AstMatrixPanel />
      <DemoControls />
    </AstMatrixProviders>
  </StrictMode>,
);
