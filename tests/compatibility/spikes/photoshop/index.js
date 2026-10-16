/* Experimental Action Descriptors; real-host verification required before promotion. */
const ps = require('photoshop');
const scene = require('./scene.js');
const log = document.getElementById('log');
let records = '';
const append = (value) => {
  records += `${JSON.stringify(value, null, 2)}\n`;
  try {
    log.value = records;
  } catch (error) {
    // The diagnostic view is not part of the document transaction.
    console.warn('M0 log display failed; records retained', String(error));
  }
};
append({
  host: ps.app.version,
  runtime: navigator.userAgent,
  status: 'ready',
  revision: 'hotfix-03',
  pathApi: { PathPointInfo: typeof ps.app.PathPointInfo, SubPathInfo: typeof ps.app.SubPathInfo },
  manifestFloor: '24.0.0 candidate',
});
let sample = 'qrcode';
const chooseSample = (value) => {
  sample = value;
  document.getElementById('sample-qr').className = value === 'qrcode' ? 'selected' : '';
  document.getElementById('sample-primitives').className = value === 'primitives' ? 'selected' : '';
  document.getElementById('status').textContent = `样本：${value}`;
};
document.getElementById('sample-qr').addEventListener('click', () => chooseSample('qrcode'));
document
  .getElementById('sample-primitives')
  .addEventListener('click', () => chooseSample('primitives'));

// The DOM Path API consumes pixel coordinates; always derive px from document DPI.
function point(x, y, dpi, left, right) {
  const factor = dpi / 25.4;
  const convert = (p) => [p[0] * factor, p[1] * factor];
  const p = new ps.app.PathPointInfo();
  p.anchor = convert([x, y]);
  p.leftDirection = convert(left || [x, y]);
  p.rightDirection = convert(right || [x, y]);
  p.kind = ps.constants.PointKind.CORNERPOINT;
  return p;
}
function pathInfo(points) {
  const path = new ps.app.SubPathInfo();
  path.closed = true;
  path.operation = ps.constants.ShapeOperation.SHAPEXOR;
  path.entireSubPath = points;
  return path;
}
function subpaths(dpi) {
  const result = [];
  for (const node of scene.nodes) {
    if (node.geometry.kind !== 'path') throw new Error('QR path fixture required');
    let points = [];
    for (const c of node.geometry.commands) {
      if (c.op === 'M') points = [point(c.x + 10, c.y + 10, dpi)];
      else if (c.op === 'L') points.push(point(c.x + 10, c.y + 10, dpi));
      else if (c.op === 'Z') result.push(pathInfo(points));
      else throw new Error('QR only');
    }
  }
  return result;
}
function primitives(dpi) {
  return [
    pathInfo([point(10, 10, dpi), point(30, 10, dpi), point(30, 20, dpi), point(10, 20, dpi)]),
    pathInfo([
      point(35, 10, dpi, undefined, [40, 0]),
      point(50, 20, dpi, [50, 5]),
      point(35, 20, dpi),
    ]),
  ];
}
async function batch(step, commands) {
  const result = await ps.action.batchPlay(
    commands.map((command) => ({ ...command, _options: { dialogOptions: 'dontDisplay' } })),
    {},
  );
  const error = result.find((item) => item._obj === 'error');
  if (error) {
    const failure = new Error(`${step}: ${JSON.stringify(error)}`);
    failure.m0Step = step;
    failure.descriptor = error;
    throw failure;
  }
  return result;
}
async function insert(injectFailure, quietZone = false) {
  if (!ps.app.documents.length) throw new Error('Open disposable test document');
  const selectedDocument = ps.app.activeDocument.id;
  const selectedSample = sample;
  const start = Date.now();
  await ps.core.executeAsModal(
    async (context) => {
      if (ps.app.activeDocument.id !== selectedDocument) throw new Error('Document switched');
      const doc = ps.app.activeDocument;
      if (doc.pathItems.length)
        throw new Error('Existing document paths: use a fresh test document');
      if (typeof ps.app.PathPointInfo !== 'function' || typeof ps.app.SubPathInfo !== 'function')
        throw new Error('PathPointInfo/SubPathInfo unavailable on photoshop.app');
      const dpi = doc.resolution;
      if (!Number.isFinite(dpi) || dpi <= 0) throw new Error('Invalid document resolution');
      const suspension = await context.hostControl.suspendHistory({
        documentID: doc.id,
        name: 'AstMatrix M0 shape',
      });
      let step = 'create-path';
      let committed = false;
      try {
        const paths = selectedSample === 'primitives' ? primitives(dpi) : subpaths(dpi);
        const pathName = `AstMatrix M0 temporary ${Date.now()}`;
        await doc.pathItems.add(pathName, paths);
        append({ step, status: 'ok', subpaths: paths.length, dpi, sample: selectedSample });
        if (injectFailure && !quietZone) throw new Error('M0 injected failure after path creation');
        step = 'select-path';
        await batch(step, [{ _obj: 'select', _target: [{ _ref: 'path', _name: pathName }] }]);
        step = 'make-fill-layer';
        await batch(step, [
          {
            _obj: 'make',
            _target: [{ _ref: 'contentLayer' }],
            using: {
              _obj: 'contentLayer',
              type: {
                _obj: 'solidColorLayer',
                color: { _obj: 'RGBColor', red: 0, grain: 0, blue: 0 },
              },
            },
          },
        ]);
        const layer = doc.activeLayers[0];
        const metadata =
          selectedSample === 'qrcode'
            ? scene.metadata
            : {
                ...scene.metadata,
                symbologyId: 'm0-primitives',
                sourceValue: '',
                profileId: 'm0-primitives',
              };
        const maskQuery = [
          {
            _obj: 'get',
            _target: [
              { _ref: 'path', _enum: 'path', _value: 'vectorMask' },
              { _ref: 'layer', _id: layer.id },
              { _ref: 'document', _id: doc.id },
            ],
            _options: { dialogOptions: 'dontDisplay' },
          },
        ];
        step = 'inspect-vector-mask';
        const [existingMask] = await ps.action.batchPlay(maskQuery, {});
        if (existingMask._obj === 'error') {
          append({ step, status: 'mask-not-readable', descriptor: existingMask });
          step = 'attach-vector-mask';
          await batch(step, [
            {
              _obj: 'make',
              _target: [
                { _ref: 'path' },
                { _ref: 'layer', _id: layer.id },
                { _ref: 'document', _id: doc.id },
              ],
              at: { _ref: 'path', _enum: 'path', _value: 'vectorMask' },
              using: { _ref: 'path', _name: pathName },
            },
          ]);
        }
        step = 'verify-vector-geometry';
        const [mask] = await batch(step, maskQuery);
        if (!mask.pathContents?.pathComponents?.length)
          throw new Error('Vector mask has no readable path components');
        // Probe/delete by the exact document-scoped name. A consumed path may no longer exist.
        // Do not use a cached DOM path handle or an ordinal target after selecting a vector mask.
        step = 'probe-temporary-path';
        const namedTarget = [
          { _ref: 'path', _name: pathName },
          { _ref: 'document', _id: doc.id },
        ];
        const [remainingPath] = await ps.action.batchPlay(
          [{ _obj: 'get', _target: namedTarget, _options: { dialogOptions: 'dontDisplay' } }],
          {},
        );
        if (remainingPath._obj !== 'error') {
          step = 'remove-temporary-path';
          await batch(step, [{ _obj: 'delete', _target: namedTarget }]);
        } else append({ step, status: 'already-consumed-or-absent', descriptor: remainingPath });
        step = 'verify-mask-after-cleanup';
        const [finalMask] = await batch(step, maskQuery);
        if (!finalMask.pathContents?.pathComponents?.length)
          throw new Error('Vector mask lost after temporary path cleanup');
        step = 'write-metadata';
        const candidate = `AstMatrix M0 ${JSON.stringify(metadata)}`;
        try {
          layer.name = candidate;
          append({
            metadataStatus: layer.name === candidate ? 'written' : 'truncated',
            requestedChars: candidate.length,
            storedChars: layer.name.length,
          });
        } catch (error) {
          // Metadata is a separate M0-07 candidate, not a prerequisite for geometry acceptance.
          append({ metadataStatus: 'fail', error: String(error), layerID: layer.id });
        }
        let quietZoneResult;
        if (quietZone) {
          step = 'create-quiet-zone';
          const { addQuietZone } = require('./quiet-zone.js');
          const quietScene =
            selectedSample === 'qrcode'
              ? scene
              : { quietZoneBounds: { x: 0, y: 0, width: 45, height: 30 } };
          quietZoneResult = await addQuietZone({
            ps,
            doc,
            scene: quietScene,
            shape: layer,
            metadata,
            point,
            pathInfo,
            batch,
            injectFailure,
          });
        }
        step = 'commit-history';
        await context.hostControl.resumeHistory(suspension, true);
        committed = true;
        append({
          status: 'inserted',
          constructed: 'candidate editable Shape Layer',
          host: ps.app.version,
          documentID: doc.id,
          dpi,
          mode: doc.mode,
          layerID: layer.id,
          hasVectorMask: true,
          sample: selectedSample,
          mask,
          widthMm: selectedSample === 'qrcode' ? scene.widthMm : null,
          heightMm: selectedSample === 'qrcode' ? scene.heightMm : null,
          insertMs: Date.now() - start,
          quietZone: quietZoneResult || 'not enabled in the default accepted spike',
          note: 'Measure dimensions, edit nodes, undo, save/reopen/move/export manually.',
        });
      } catch (error) {
        error.m0Step = error.m0Step || step;
        if (!committed) {
          await context.hostControl.resumeHistory(suspension, false);
          append({ step: error.m0Step, rollback: 'requested', error: String(error) });
        } else
          append({
            step: error.m0Step,
            status: 'diagnostic-error-after-commit',
            error: String(error),
          });
        throw error;
      }
    },
    { commandName: 'AstMatrix M0 spike' },
  );
}
let busy = false;
async function run(action) {
  if (busy) return;
  busy = true;
  document.getElementById('status').textContent = '执行中…';
  for (const id of ['insert', 'fail', 'read', 'stress', 'dialog'])
    document.getElementById(id).disabled = true;
  try {
    await action();
    document.getElementById('status').textContent = '操作已结束，请查看记录';
  } catch (error) {
    document.getElementById('status').textContent =
      `失败：${error.m0Step || 'UI/action'} — ${String(error)}`;
    append({
      status: 'fail',
      step: error.m0Step || 'UI/action',
      error: String(error),
      stack: error.stack,
      descriptor: error.descriptor,
    });
  } finally {
    busy = false;
    for (const id of ['insert', 'fail', 'read', 'stress', 'dialog'])
      document.getElementById(id).disabled = false;
  }
}
document.getElementById('insert').addEventListener('click', () => run(() => insert(false)));
document.getElementById('fail').addEventListener('click', () => run(() => insert(true)));
document.getElementById('read').addEventListener('click', () =>
  run(async () => {
    const name = ps.app.activeDocument.activeLayers[0].name;
    if (!name.startsWith('AstMatrix M0 ')) throw new Error('Select M0 layer');
    const metadata = JSON.parse(name.slice('AstMatrix M0 '.length));
    if (metadata.schemaVersion !== 1) throw new Error('Unknown metadata version');
    append({ metadata, storage: 'layer-name candidate; size/truncation limits unverified' });
  }),
);
document.getElementById('dialog').addEventListener('click', () =>
  run(async () => {
    const dialog = document.createElement('dialog');
    const text = document.createElement('p');
    text.textContent = 'M0: Esc / Enter / 焦点 / 中文输入';
    const input = document.createElement('input');
    const close = document.createElement('button');
    close.textContent = '关闭';
    close.addEventListener('click', () => dialog.close());
    dialog.appendChild(text);
    dialog.appendChild(input);
    dialog.appendChild(close);
    document.body.appendChild(dialog);
    try {
      await dialog.uxpShowModal({
        title: 'M0 native UI',
        resize: 'both',
        size: { width: 360, height: 220 },
      });
    } finally {
      dialog.remove();
    }
  }),
);

document.getElementById('stress').addEventListener('click', () =>
  run(async () => {
    await ps.core.executeAsModal(
      async () => {
        const layer = ps.app.activeDocument.activeLayers[0];
        if (!layer.name.startsWith('AstMatrix M0 ')) throw new Error('Select M0 layer');
        const metadata = JSON.parse(layer.name.slice('AstMatrix M0 '.length));
        metadata.options.m0Padding = 'A'.repeat(16 * 1024);
        const candidate = `AstMatrix M0 ${JSON.stringify(metadata)}`;
        layer.name = candidate;
        append({
          requestedChars: candidate.length,
          storedChars: layer.name.length,
          exactImmediateMatch: layer.name === candidate,
          storage: 'layer-name candidate; save/reopen=MANUAL',
        });
      },
      { commandName: 'M0 metadata size' },
    );
  }),
);

async function showLog() {
  const dialog = document.createElement('dialog');
  const title = document.createElement('h2');
  title.textContent = 'M0 完整运行记录';
  const text = document.createElement('textarea');
  text.readOnly = true;
  text.value = records;
  text.style.height = '280px';
  text.style.width = '100%';
  const close = document.createElement('button');
  close.textContent = '关闭';
  close.addEventListener('click', () => dialog.close());
  dialog.appendChild(title);
  dialog.appendChild(text);
  dialog.appendChild(close);
  document.body.appendChild(dialog);
  try {
    await dialog.uxpShowModal({ title: 'M0 运行记录', size: { width: 520, height: 420 } });
  } finally {
    dialog.remove();
  }
}
document.getElementById('show-log').addEventListener('click', () =>
  showLog().catch((error) => {
    document.getElementById('status').textContent = `打开记录失败：${String(error)}`;
  }),
);
