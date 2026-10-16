/* M0 experiment. Host built-in SDK; generated SDK copy is for reference/notices only. */
const { Environment } = require('/environment.js');
const { Application } = require('/application.js');
const { Document } = require('/document.js');
const { Dialog, DialogResult } = require('/dialog.js');
const { Curve, CurveBuilder, PolyCurve, Rectangle } = require('/geometry.js');
const { PolyCurveNodeDefinition, ContainerNodeDefinition } = require('/nodes.js');
const { AddChildNodesCommandBuilder, CompoundCommandBuilder } = require('/commands.js');
const { FillDescriptor } = require('/fills.js');
const { LineStyleDescriptor } = require('/linestyle.js');
const { SVG11 } = require('/colours.js');
const { BlendMode } = require('affinity:common');

function main() {
  const doc = Document.current;
  if (!doc) throw new Error('Open a disposable document');
  // Native statistics expose non-enumerable properties: JSON.stringify may produce {}.
  const heap = () => {
    const stats = Environment.getHeapStatistics();
    const values = {};
    for (const name of [
      'totalHeapSize',
      'totalHeapSizeExecutable',
      'totalPhysicalSize',
      'totalAvailableSize',
      'usedHeapSize',
      'heapSizeLimit',
      'mallocedMemory',
      'peakMallocedMemory',
    ]) {
      if (typeof stats[name] === 'number' && isFinite(stats[name])) values[name] = stats[name];
    }
    return Object.keys(values).length
      ? values
      : { status: 'unavailable', reason: 'No numeric heap fields exposed' };
  };
  const before = heap();
  const start = Date.now();
  const provider = require('/provider.cjs');
  const loaded = Date.now();
  const scene = provider.encodeSpike({ bcid: 'qrcode', text: 'https://example.com/barcode' });
  const encoded = Date.now();
  console.log(
    JSON.stringify({
      task: 'M0-06',
      revision: 'hotfix-02',
      host: Application.version,
      platform: Application.platformName,
      sdk: Environment.sdkVersionStr,
      v8: Environment.v8VersionStr,
      loading: 'generic → bundled CJS; SDK paths resolve to host built-in library',
      loadMs: loaded - start,
      encodeMs: encoded - loaded,
      heapBefore: before,
      heapAfter: heap(),
      nodes: scene.nodes.length,
      widthMm: scene.widthMm,
      heightMm: scene.heightMm,
      dpi: doc.dpi,
    }),
  );
  const dialog = Dialog.create('AstMatrix M0');
  const groupControls = dialog.addColumn().addGroup('M0 insert options');
  const insert = groupControls.addSwitch('Insert QR PolyCurve and group', true);
  const fail = groupControls.addSwitch('Inject failure before command execution', false);
  const result = dialog.runModal();
  if ((result?.value ?? result) !== DialogResult.Ok.value || !insert.value) return;
  const mm = doc.dpi / 25.4;
  const noFill = FillDescriptor.createNone();
  const black = FillDescriptor.createSolid(SVG11.black, BlendMode.Normal);
  const style = LineStyleDescriptor.createDefault(0);
  const defs = [];
  const make = (poly, name, fill) => {
    const def = PolyCurveNodeDefinition.create(poly, fill, noFill, style, noFill);
    def.userDescription = name;
    defs.push(def);
  };
  for (const node of scene.nodes) {
    const poly = PolyCurve.create();
    let builder;
    if (node.geometry.kind !== 'path') throw new Error('QR path fixture required');
    for (const c of node.geometry.commands) {
      if (c.op === 'M') builder = CurveBuilder.create().beginXY((c.x + 10) * mm, (c.y + 10) * mm);
      else if (c.op === 'L') builder.lineToXY((c.x + 10) * mm, (c.y + 10) * mm);
      else if (c.op === 'Z') {
        builder.close();
        poly.addCurve(builder.createCurve());
      } else throw new Error('Unsupported QR curve command');
    }
    make(poly, 'M0 QR; check hole fill rule manually', black);
  }
  const envelope = PolyCurve.create();
  envelope.addCurve(
    Curve.createRectangle(new Rectangle(10 * mm, 10 * mm, scene.widthMm * mm, scene.heightMm * mm)),
  );
  make(envelope, 'M0 quiet-zone envelope (no fill/stroke)', noFill);
  const testCurve = PolyCurve.create();
  testCurve.addCurve(
    Curve.createEllipse(new Rectangle((scene.widthMm + 15) * mm, 10 * mm, 10 * mm, 5 * mm)),
  );
  make(testCurve, 'M0 editable curve sample outside symbol', black);
  const group = ContainerNodeDefinition.create(`AstMatrix M0 ${JSON.stringify(scene.metadata)}`);
  const layer = AddChildNodesCommandBuilder.create();
  layer.addNode(group);
  const children = AddChildNodesCommandBuilder.create();
  for (const def of defs) children.addNode(def);
  const command = CompoundCommandBuilder.create()
    .addCommand(layer.createCommand(true))
    .addCommand(children.createCommand(false))
    .createCommand();
  if (fail.value) throw new Error('M0 injected failure; document not changed');
  doc.executeCommand(command, false);
  console.log(
    'INSERTED; validate editable group/holes/units/undo/save/reopen; description metadata candidate only',
  );
}
function read() {
  const nodes = Document.current.selection.nodes.toArray();
  for (const node of nodes) console.log('selected description', node.userDescription);
}
function stress() {
  const node = Document.current.selection.nodes.toArray()[0];
  if (!node || !node.userDescription.startsWith('AstMatrix M0 '))
    throw new Error('Select M0 group');
  const metadata = JSON.parse(node.userDescription.slice('AstMatrix M0 '.length));
  metadata.options.m0Padding = 'A'.repeat(16 * 1024);
  const candidate = `AstMatrix M0 ${JSON.stringify(metadata)}`;
  node.userDescription = candidate;
  console.log(
    'requestedChars',
    candidate.length,
    'storedChars',
    node.userDescription.length,
    'exactImmediateMatch',
    candidate === node.userDescription,
  );
}
module.exports = { main, read, stress };
