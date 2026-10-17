import {
  AstMatrixApplicationService,
  PreviewController,
  InsertController,
} from '@astmatrix/application';
import type { GenerateRequest } from '@astmatrix/profiles';
import { getProfile, migrateFields, profiles, profileHint } from '@astmatrix/profiles';
import { getSymbology, symbologies } from '@astmatrix/symbology-catalog';
import type { CodeTab } from '@astmatrix/symbology-catalog';
import type { HostAdapter } from '@astmatrix/host-contract';
import { HostError } from '@astmatrix/host-contract';
import { errorMessage } from '@astmatrix/shared';
/** The supported UXP DOM subset. No browser APIs, React, storage or canvas assumed. */
export interface UxpElement {
  textContent: string | null;
  value: string;
  checked: boolean;
  disabled: boolean;
  src: string;
  className: string;
  style: { [property: string]: string };
  firstChild: UxpElement | null;
  appendChild: (node: UxpElement) => unknown;
  removeChild: (node: UxpElement) => unknown;
  setAttribute: (name: string, value: string) => void;
  addEventListener: (name: string, callback: () => void) => void;
}
export interface UxpDocument {
  createElement: (name: string) => UxpElement;
}
export interface NativePanelOptions {
  document: UxpDocument;
  root: UxpElement;
  service: AstMatrixApplicationService;
  adapter: HostAdapter;
  previewSvg: (svg: string, isCurrent: () => boolean) => Promise<string>;
  exportSvg: (svg: string, name: string) => Promise<void>;
}
export function mountNativePanel(options: NativePanelOptions): { dispose: () => void } {
  const { document, root, service, adapter } = options;
  const preview = new PreviewController(service, {
    schedule: (callback) => {
      const id = setTimeout(callback, 150);
      return () => clearTimeout(id);
    },
  });
  const insert = new InsertController(adapter, preview);
  let tab: CodeTab = 'barcode',
    profileId = 'ean13-default',
    symbolId = 'ean13',
    fields: Record<string, unknown> = { ...getProfile(profileId).defaults };
  let advanced = false,
    disposed = false,
    selectionRevision = 0,
    restoring = false;
  const last: Record<CodeTab, { symbolId: string; profileId: string }> = {
    barcode: { symbolId, profileId },
    matrix: { symbolId: 'qrcode', profileId: 'qr-default' },
  };
  const node = (tag: string, text?: string) => {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    return n;
  };
  const clear = (n: UxpElement) => {
    while (n.firstChild) n.removeChild(n.firstChild);
  };
  clear(root);
  root.className = 'astmatrix-native';
  root.appendChild(node('h2', 'AstMatrix'));
  root.appendChild(node('p', '离线编码 · Photoshop 原生矢量'));
  const tabs = node('div'),
    buttonBar = node('button', '条形码'),
    buttonMatrix = node('button', '二维码');
  tabs.appendChild(buttonBar);
  tabs.appendChild(buttonMatrix);
  root.appendChild(tabs);
  const symbolLabel = node('label', '编码格式'),
    symbols = node('select'),
    profileLabel = node('label', '业务预设'),
    presets = node('select');
  symbolLabel.appendChild(symbols);
  profileLabel.appendChild(presets);
  root.appendChild(symbolLabel);
  root.appendChild(profileLabel);
  const advancedLabel = node('label', '高级设置'),
    toggle = node('input');
  toggle.setAttribute('type', 'checkbox');
  advancedLabel.appendChild(toggle);
  root.appendChild(advancedLabel);
  const form = node('div'),
    notice = node('p'),
    image = node('img'),
    metrics = node('p'),
    status = node('p');
  image.setAttribute('alt', '条码矢量预览');
  image.style.width = '100%';
  image.style.height = '180px';
  image.style.objectFit = 'contain';
  root.appendChild(form);
  root.appendChild(notice);
  root.appendChild(image);
  root.appendChild(metrics);
  root.appendChild(status);
  const controls = node('div'),
    exportButton = node('button', '导出 SVG'),
    insertButton = node('button', '插入文档'),
    restoreButton = node('button', '读取选中对象参数');
  controls.appendChild(exportButton);
  controls.appendChild(insertButton);
  root.appendChild(controls);
  root.appendChild(restoreButton);
  const fieldErrors = new Map<string, UxpElement>();
  const renderControls = () => {
    clear(symbols);
    clear(presets);
    const s = getSymbology(symbolId);
    for (const symbol of symbologies.filter((entry) => entry.tab === tab)) {
      const o = node('option', symbol.label + (symbol.status === 'listed' ? ' · 未实现' : ''));
      o.value = symbol.id;
      symbols.appendChild(o);
    }
    symbols.value = symbolId;
    for (const id of s.profileIds) {
      const o = node('option', profiles.find((p) => p.id === id)?.label ?? id);
      o.value = id;
      presets.appendChild(o);
    }
    presets.value = profileId;
    buttonBar.className = tab === 'barcode' ? 'selected' : '';
    buttonMatrix.className = tab === 'matrix' ? 'selected' : '';
    notice.textContent = s.status === 'listed' ? s.reason : profileHint(getProfile(profileId));
    renderForm();
    request();
  };
  const request = () => {
    const s = getSymbology(symbolId);
    if (s.status === 'listed') {
      preview.invalidate();
      return;
    }
    preview.request({ symbologyId: symbolId, profileId, fields: { ...fields } });
  };
  const renderForm = () => {
    clear(form);
    fieldErrors.clear();
    const p = profiles.find((candidate) => candidate.id === profileId);
    if (!p) return;
    for (const f of p.fields.filter((field) => !field.advanced || advanced)) {
      const label = node('label', f.label),
        control = node(f.kind === 'select' ? 'select' : f.name === 'text' ? 'textarea' : 'input');
      if (f.kind === 'select')
        for (const v of f.options ?? []) {
          const o = node('option', v);
          o.value = v;
          control.appendChild(o);
        }
      if (f.kind === 'boolean') {
        control.setAttribute('type', 'checkbox');
        control.checked = fields[f.name] === true;
      } else {
        control.value = String(fields[f.name] ?? '');
        if (f.kind === 'number') {
          control.setAttribute('type', 'number');
          control.setAttribute('step', 'any');
        }
      }
      control.setAttribute('aria-label', f.label);
      const changed = () => {
        selectionRevision++;
        fields = {
          ...fields,
          [f.name]:
            f.kind === 'boolean'
              ? control.checked
              : f.kind === 'number' || f.valueType === 'number'
                ? Number(control.value)
                : control.value,
        };
        request();
      };
      control.addEventListener(
        f.kind === 'boolean' || f.kind === 'select' ? 'change' : 'input',
        changed,
      );
      label.appendChild(control);
      const error = node('span');
      error.className = 'field-error';
      fieldErrors.set(f.name, error);
      label.appendChild(error);
      form.appendChild(label);
    }
  };
  const choose = (nextSymbol: string, nextProfile: string) => {
    selectionRevision++;
    preview.invalidate();
    symbolId = nextSymbol;
    profileId = nextProfile;
    const p = profiles.find((candidate) => candidate.id === profileId);
    if (p) fields = migrateFields(fields, p).fields;
    last[tab] = { symbolId, profileId };
    renderControls();
  };
  buttonBar.addEventListener('click', () => {
    if (tab !== 'barcode') {
      tab = 'barcode';
      choose(last[tab].symbolId, last[tab].profileId);
    }
  });
  buttonMatrix.addEventListener('click', () => {
    if (tab !== 'matrix') {
      tab = 'matrix';
      choose(last[tab].symbolId, last[tab].profileId);
    }
  });
  symbols.addEventListener('change', () => {
    const s = getSymbology(symbols.value);
    choose(s.id, s.defaultProfileId);
  });
  presets.addEventListener('change', () => choose(symbolId, presets.value));
  toggle.addEventListener('change', () => {
    advanced = toggle.checked;
    renderForm();
  });
  const update = () => {
    if (disposed) return;
    const state = preview.getSnapshot(),
      insertion = insert.getSnapshot();
    insertButton.disabled = !!insert.reason();
    exportButton.disabled = state.status !== 'ready';
    restoreButton.disabled =
      restoring ||
      insertion.status === 'pending' ||
      !adapter.getSnapshot().capabilities.documentOpen;
    const errors = state.status === 'error' ? state.error.fields : {};
    fieldErrors.forEach((n, k) => {
      n.textContent = errors[k] ?? '';
    });
    if (state.status === 'ready') {
      metrics.textContent = `${state.barcode.scene.widthMm.toFixed(2)} × ${state.barcode.scene.heightMm.toFixed(2)} mm`;
      const isCurrent = () => !disposed && preview.getSnapshot() === state;
      void (async () => {
        try {
          const src = await options.previewSvg(state.barcode.svg, isCurrent);
          if (isCurrent()) image.src = src;
        } catch (error) {
          if (isCurrent()) status.textContent = `预览失败：${errorMessage(error)}`;
        }
      })();
    } else {
      image.src = '';
      metrics.textContent = '';
    }
    status.textContent =
      insertion.status === 'pending'
        ? '正在插入…'
        : insertion.status === 'error'
          ? `${insertion.error.code}：${insertion.error.message}`
          : insertion.status === 'success'
            ? '插入成功'
            : state.status === 'error'
              ? `${state.error.code}：${state.error.message}`
              : state.status === 'pending'
                ? '生成中…'
                : state.status === 'ready'
                  ? (insert.reason() ?? '预览已就绪')
                  : '等待输入';
  };
  insertButton.addEventListener('click', () => {
    void insert.insert().catch(() => {});
  });
  exportButton.addEventListener('click', () => {
    const state = preview.getSnapshot();
    if (state.status === 'ready')
      void options.exportSvg(state.barcode.svg, `astmatrix-${symbolId}.svg`).catch((e) => {
        status.textContent = errorMessage(e);
      });
  });
  restoreButton.addEventListener('click', () => {
    if (restoring) return;
    restoring = true;
    const rev = selectionRevision,
      host = adapter.getSnapshot();
    update();
    void (async () => {
      try {
        const metadata = await adapter.readSelectedMetadata();
        if (
          disposed ||
          rev !== selectionRevision ||
          host.documentId !== adapter.getSnapshot().documentId ||
          host.revision !== adapter.getSnapshot().revision
        )
          throw new HostError('CANCELLED', '输入或文档已变化');
        if (!metadata) throw new HostError('INVALID_INPUT', '请选择 AstMatrix 对象');
        const restored: GenerateRequest = service.restore(metadata);
        tab = getSymbology(restored.symbologyId).tab;
        symbolId = restored.symbologyId;
        profileId = restored.profileId;
        fields = { ...restored.fields };
        selectionRevision++;
        last[tab] = { symbolId, profileId };
        renderControls();
      } catch (e) {
        if (!disposed) status.textContent = errorMessage(e);
      } finally {
        restoring = false;
        restoreButton.disabled = false;
      }
    })();
  });
  const unsub = [preview.subscribe(update), insert.subscribe(update), adapter.subscribe(update)];
  renderControls();
  update();
  return {
    dispose: () => {
      disposed = true;
      selectionRevision++;
      unsub.forEach((f) => f());
      preview.dispose();
      insert.dispose();
      clear(root);
    },
  };
}
