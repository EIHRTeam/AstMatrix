import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  useState,
  useRef,
  useCallback,
  useSyncExternalStore,
} from 'react';
import type { Dispatch, ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { FieldErrors, Resolver } from 'react-hook-form';
import {
  AstMatrixApplicationService,
  PreviewController,
  InsertController,
} from '@astmatrix/application';
import { AstMatrixError, errorMessage } from '@astmatrix/shared';
import { migrateFields, normalizeRequest, profiles } from '@astmatrix/profiles';
import type { ProfileDefinition } from '@astmatrix/profiles';
import { getSymbology, symbologies } from '@astmatrix/symbology-catalog';
import type { CodeTab } from '@astmatrix/symbology-catalog';
import { insertionReason } from '@astmatrix/host-contract';
import type { HostAdapter } from '@astmatrix/host-contract';
import { initialSelection, selectionReducer } from './selection';
import { copySvgToClipboard } from './clipboard';
import { LocaleProvider, useLocale } from './l10n';
import { ExternalLinkContext, HeaderActions, ProjectLinkContext } from './header-actions';
import { contentPlaceholder } from './input-guidance';
import { engineErrorMessage } from './l10n/engine-errors';
import type { SelectionAction, SelectionState } from './selection';

const SelectionStateContext = createContext<SelectionState>(initialSelection);
const SelectionDispatchContext = createContext<Dispatch<SelectionAction>>(() => {});
const HostContext = createContext<HostAdapter | null>(null);
const HostStatusContext = createContext<string | undefined>(undefined);
const ServiceContext = createContext<AstMatrixApplicationService | null>(null);
const SettingsContext = createContext({ advanced: false, debounceMs: 150 });
const SettingsDispatchContext = createContext<Dispatch<boolean>>(() => {});
export function AstMatrixProviders({
  service,
  adapter,
  children,
  debounceMs = 150,
  hostLocale,
  openProject,
  openExternal,
  hostStatusMessage,
}: {
  service: AstMatrixApplicationService;
  adapter: HostAdapter;
  children: ReactNode;
  debounceMs?: number;
  hostLocale?: string;
  openProject?: () => void | Promise<void>;
  openExternal?: (url: string) => void | Promise<void>;
  hostStatusMessage?: string;
}) {
  const [selection, dispatch] = useReducer(selectionReducer, initialSelection);
  const [advanced, setAdvanced] = useReducer((_previous: boolean, next: boolean) => next, false);
  const settings = useMemo(() => ({ advanced, debounceMs }), [advanced, debounceMs]);
  return (
    <LocaleProvider hostLocale={hostLocale}>
      <ExternalLinkContext value={openExternal}>
        <ProjectLinkContext value={openProject}>
          <ServiceContext value={service}>
            <HostContext value={adapter}>
              <HostStatusContext value={hostStatusMessage}>
                <SettingsContext value={settings}>
                  <SettingsDispatchContext value={setAdvanced}>
                    <SelectionStateContext value={selection}>
                      <SelectionDispatchContext value={dispatch}>
                        {children}
                      </SelectionDispatchContext>
                    </SelectionStateContext>
                  </SettingsDispatchContext>
                </SettingsContext>
              </HostStatusContext>
            </HostContext>
          </ServiceContext>
        </ProjectLinkContext>
      </ExternalLinkContext>
    </LocaleProvider>
  );
}
export const useAstMatrixPreview = (controller: PreviewController) =>
  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
export const useInsert = (controller: InsertController) =>
  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
export function useHostSnapshot() {
  const adapter = useContext(HostContext);
  if (!adapter) throw new Error('Host Provider required');
  return useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
}
interface Runtime {
  preview: PreviewController;
  insert: InsertController;
}
export function AstMatrixPanel() {
  const service = useContext(ServiceContext),
    adapter = useContext(HostContext);
  const { debounceMs } = useContext(SettingsContext);
  const runtime = useMemo<Runtime>(() => {
    if (!service || !adapter) throw new Error('Application and Host Providers required');
    const preview = new PreviewController(service, {
      schedule: (callback) => {
        const timer = setTimeout(callback, debounceMs);
        return () => clearTimeout(timer);
      },
    });
    return { preview, insert: new InsertController(adapter, preview) };
  }, [service, adapter, debounceMs]);
  useEffect(() => {
    runtime.preview.activate();
    runtime.insert.activate();
    return () => {
      runtime.preview.dispose();
      runtime.insert.dispose();
    };
  }, [runtime]);
  return (
    <main className="astmatrix">
      <header className="brand">
        <div className="brand-mark" aria-hidden="true">
          ▥
        </div>
        <h1>AstMatrix</h1>
        <HeaderActions />
      </header>
      <Workbench runtime={runtime} />
    </main>
  );
}
function Workbench({ runtime }: { runtime: Runtime }) {
  const { t } = useLocale();
  const selection = useContext(SelectionStateContext),
    dispatch = useContext(SelectionDispatchContext);
  const settings = useContext(SettingsContext),
    setAdvanced = useContext(SettingsDispatchContext);
  const symbol = getSymbology(selection.symbologyId);
  const p = profiles.find((definition) => definition.id === selection.profileId);
  const [lastProfile, setLastProfile] = useState(profiles[0]!);
  if (p && p !== lastProfile) setLastProfile(p);
  const enabled = symbol.status !== 'listed' && !!p;
  const choose = (action: SelectionAction) => {
    if (
      (action.type === 'tab' && action.tab === selection.tab) ||
      (action.type === 'symbology' && action.id === selection.symbologyId) ||
      (action.type === 'profile' && action.id === selection.profileId)
    )
      return;
    runtime.preview.invalidate();
    dispatch(action);
  };
  return (
    <>
      <div role="tablist" aria-label={t('编码类别')} className="tabs">
        {(['barcode', 'matrix'] as CodeTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={'tab-' + tab}
            aria-controls={'panel-' + selection.tab}
            tabIndex={selection.tab === tab ? 0 : -1}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 'barcode'
                    : event.key === 'End'
                      ? 'matrix'
                      : selection.tab === 'barcode'
                        ? 'matrix'
                        : 'barcode';
                choose({ type: 'tab', tab: next });
                document.getElementById('tab-' + next)?.focus();
              }
            }}
            aria-selected={selection.tab === tab}
            onClick={() => choose({ type: 'tab', tab })}
          >
            {t(tab === 'barcode' ? '条形码' : '二维码')}
          </button>
        ))}
      </div>
      <div
        className="workspace"
        role="tabpanel"
        id={'panel-' + selection.tab}
        aria-labelledby={'tab-' + selection.tab}
      >
        <section className="editor" aria-label={t('编码参数')}>
          <div className="section-heading editor-heading">
            <label className="settings">
              <input
                type="checkbox"
                checked={settings.advanced}
                onChange={(e) => setAdvanced(e.target.checked)}
              />
              {t('高级设置')}
            </label>
          </div>
          <label className="field">
            {t('编码格式')}
            <select
              aria-label={t('编码格式')}
              value={symbol.id}
              onChange={(e) => choose({ type: 'symbology', id: e.target.value })}
            >
              {symbologies
                .filter((s) => s.tab === selection.tab)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.label)}
                    {s.status === 'listed' ? ' · ' + t('未实现') : ''}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            {t('业务预设')}
            <select
              aria-label={t('业务预设')}
              value={selection.profileId}
              onChange={(e) => choose({ type: 'profile', id: e.target.value })}
            >
              {symbol.profileIds.map((id) => (
                <option key={id} value={id}>
                  {t(profiles.find((candidate) => candidate.id === id)?.label ?? id)}
                </option>
              ))}
            </select>
          </label>
          {!enabled ? (
            <div role="alert" className="notice">
              {t(symbol.reason)}
            </div>
          ) : null}
          <div hidden={!enabled}>
            <BarcodeForm profile={p ?? lastProfile} runtime={runtime} enabled={enabled} />
          </div>
        </section>
        <PreviewPanel runtime={runtime} />
      </div>
    </>
  );
}
function BarcodeForm({
  profile,
  runtime,
  enabled,
}: {
  profile: ProfileDefinition;
  runtime: Runtime;
  enabled: boolean;
}) {
  const { advanced } = useContext(SettingsContext);
  const { t } = useLocale();
  const previousProfile = useRef(profile);
  const currentFields = useCallback(
    (values: Record<string, unknown>) =>
      Object.fromEntries(
        profile.fields.map((field) => [
          field.name,
          values[field.name] === undefined ? profile.defaults[field.name] : values[field.name],
        ]),
      ),
    [profile],
  );

  const resolver: Resolver<Record<string, unknown>> = (values) => {
    try {
      normalizeRequest({
        symbologyId: profile.symbologyId,
        profileId: profile.id,
        fields: currentFields(values),
      });
      return { values: currentFields(values), errors: {} };
    } catch (error) {
      const errors: FieldErrors<Record<string, unknown>> = {};
      if (error instanceof AstMatrixError)
        for (const [field, message] of Object.entries(error.fields))
          errors[field] = { type: 'validate', message };
      return { values: {}, errors };
    }
  };
  const {
    register,
    control,
    reset,
    getValues,
    subscribe,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    defaultValues: { ...profile.defaults, text: '' },
    resolver,
    mode: 'onChange',
  });
  const [checkDigit, hri, text] = useWatch({ control, name: ['checkDigit', 'hri', 'text'] });
  useEffect(() => {
    if (!enabled) return;
    const values = getValues();
    const previous = Object.fromEntries(
      previousProfile.current.fields
        .filter((field) => field.name in values)
        .map((field) => [field.name, values[field.name]]),
    );
    const migrated = migrateFields(previous, profile);
    previousProfile.current = profile;
    reset(migrated.fields);

    const request = (fields: Record<string, unknown>) => {
      if (fields.text === '') {
        runtime.preview.invalidate();
        return;
      }
      runtime.preview.request({
        symbologyId: profile.symbologyId,
        profileId: profile.id,
        fields: currentFields(fields),
      });
    };
    request(migrated.fields);
    return subscribe({
      formState: { values: true },
      callback: ({ values: nextValues }) => request({ ...nextValues }),
    });
  }, [profile, runtime, enabled, reset, getValues, subscribe, currentFields]);
  const preview = useAstMatrixPreview(runtime.preview);
  const fieldErrors =
    preview.status === 'error' && preview.error.layer !== 'provider' ? preview.error.fields : {};
  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="barcode-form">
      {profile.fields
        .filter((f) => !f.advanced || advanced)
        .map((f) => {
          const error =
            f.name === 'text' && text === ''
              ? undefined
              : (fieldErrors[f.name] ?? errors[f.name]?.message);
          const attrs = register(f.name, {
            valueAsNumber: f.kind === 'number' || f.valueType === 'number',
          });
          return (
            <label key={f.name} className={f.kind === 'boolean' ? 'field checkbox' : 'field'}>
              {f.kind === 'boolean' ? (
                <>
                  <input type="checkbox" {...attrs} />
                  {t(f.label)}
                </>
              ) : (
                <>
                  {t(f.label)}
                  {f.kind === 'select' ? (
                    <select {...attrs} aria-label={t(f.label)}>
                      {f.options?.map((v) => (
                        <option key={v} value={v}>
                          {t(v === 'validate' ? '校验已有' : v === 'generate' ? '自动生成' : v)}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === 'text' && f.name === 'text' ? (
                    <textarea
                      placeholder={t(contentPlaceholder(profile, { checkDigit, hri }))}
                      rows={4}
                      spellCheck={false}
                      {...attrs}
                      aria-label={t(f.label)}
                      aria-invalid={!!error}
                    />
                  ) : (
                    <input
                      type={f.kind === 'number' ? 'number' : 'text'}
                      step="any"
                      {...attrs}
                      aria-label={t(f.label)}
                      aria-invalid={!!error}
                    />
                  )}
                </>
              )}
              {error ? (
                <span className="field-error" role="alert">
                  {t(String(error))}
                </span>
              ) : null}
            </label>
          );
        })}
    </form>
  );
}
function PreviewPanel({ runtime }: { runtime: Runtime }) {
  const { t } = useLocale();
  const preview = useAstMatrixPreview(runtime.preview),
    insert = useInsert(runtime.insert);
  const host = useHostSnapshot();
  const hostStatusMessage = useContext(HostStatusContext);
  const adapter = useContext(HostContext);
  const [copyResult, setCopyResult] = useState<{
    revision: number;
    status: 'pending' | 'success' | 'error';
    message?: string;
  } | null>(null);
  const copyFeedback = copyResult?.revision === preview.revision ? copyResult : null;
  const copying = copyFeedback?.status === 'pending';
  const fake = adapter?.id === 'development-fake';
  const ready = preview.status === 'ready' ? preview.barcode : null;
  const insertionMessage = hostStatusMessage ?? (ready ? insertionReason(host, ready.scene) : null);
  const reason =
    insert.status === 'pending' ? t('正在插入，请稍候') : insertionMessage && t(insertionMessage);
  const copySvg = async () => {
    if (!ready || copying) return;
    const revision = preview.revision;
    setCopyResult({ revision, status: 'pending' });
    try {
      await copySvgToClipboard(ready.svg);
      setCopyResult((current) =>
        current?.revision === revision ? { revision, status: 'success' } : current,
      );
    } catch (error) {
      setCopyResult((current) =>
        current?.revision === revision
          ? { revision, status: 'error', message: errorMessage(error) }
          : current,
      );
    }
  };
  return (
    <section className="preview" aria-label={t('矢量预览')}>
      <div className="section-heading">
        <span>{t('矢量预览')}</span>
        {preview.status === 'pending' || preview.status === 'error' ? (
          <output className="status">
            {t(preview.status === 'pending' ? '生成中' : '需要修正')}
          </output>
        ) : null}
      </div>
      <div className="preview-stage">
        {ready ? (
          <img
            alt={`${t(getSymbology(ready.request.symbologyId).label)} ${t('矢量预览')}`}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(ready.svg)}`}
          />
        ) : (
          <div className="placeholder">
            <span aria-hidden="true">▥</span>
            <p>{t(preview.status === 'pending' ? '正在生成矢量…' : '输入有效内容以生成预览')}</p>
          </div>
        )}
      </div>
      {preview.status === 'error' ? (
        <div className="error" role="alert">
          {preview.error.layer === 'provider' ? (
            <>
              {t('编码引擎')}：{t(engineErrorMessage(preview.error))}
            </>
          ) : (
            <>
              {t('输入校验')}：{t(preview.error.message)}
            </>
          )}
        </div>
      ) : null}
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!ready || !!reason}
          onClick={() => {
            void runtime.insert.insert().catch(() => {});
          }}
        >
          {t(
            insert.status === 'pending'
              ? fake
                ? '正在模拟插入…'
                : '正在插入…'
              : fake
                ? '模拟插入文档'
                : '插入文档',
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            void copySvg();
          }}
          disabled={!ready}
          aria-disabled={copying || undefined}
          aria-busy={copying}
        >
          {t(copying ? '复制中…' : '复制 SVG')}
        </button>
      </div>
      {copyFeedback?.status === 'success' ? (
        <output className="success">{t('SVG 已复制')}</output>
      ) : copyFeedback?.status === 'error' ? (
        <p role="alert" className="error">
          {t('复制 SVG 失败')}：{t(copyFeedback.message ?? '')}
        </p>
      ) : null}
      {reason ? <p className="hint">{reason}</p> : null}
      {insert.status === 'success' ? (
        <output className="success">
          {t(fake ? '模拟插入成功' : '插入成功')}：{insert.result.objectId} /{' '}
          {insert.result.documentId}
        </output>
      ) : insert.status === 'error' ? (
        <div role="alert" className="error">
          {insert.error.code}：{t(insert.error.message)}
        </div>
      ) : null}
    </section>
  );
}
