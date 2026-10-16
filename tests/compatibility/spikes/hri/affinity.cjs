/* oxlint-disable import/no-absolute-path -- Affinity SDK resolves these built-in module IDs from its root. */
/* Standalone M0 HRI Script Editor entry; data/helper are embedded by the build. */
const { Document } = require('/document.js');
const { Application } = require('/application.js');
const { Environment } = require('/environment.js');
const { CurveBuilder, PolyCurve, Curve, Rectangle } = require('/geometry.js');
const { PolyCurveNodeDefinition, ContainerNodeDefinition } = require('/nodes.js');
const { AddChildNodesCommandBuilder, CompoundCommandBuilder } = require('/commands.js');
const { FillDescriptor } = require('/fills.js');
const { LineStyleDescriptor } = require('/linestyle.js');
const { SVG11 } = require('/colours.js');
const { BlendMode } = require('affinity:common');
const { toContours, equal } = require('./hri-contours.js');
const scene = require('./hri-scene.js');
const doc = Document.current;
if (!doc) throw new Error('Open a disposable document');
const factor = doc.dpi / 25.4;
if (!Number.isFinite(factor) || factor <= 0) throw new Error('Invalid document DPI');
const start = Date.now();
const px = (p) => [(p[0] + 10) * factor, (p[1] + 10) * factor];
const none = FillDescriptor.createNone();
const black = FillDescriptor.createSolid(SVG11.black, BlendMode.Normal);
const style = LineStyleDescriptor.createDefault(0);
const defs = [];
for (const node of toContours(scene)) {
  const poly = PolyCurve.create();
  for (const points of node.contours) {
    const builder = CurveBuilder.create().beginXY(...px(points[0].anchor));
    // Include the curved last→first segment, which contains the transferred incoming handle.
    for (let i = 1; i <= points.length; i++) {
      const a = points[i - 1],
        b = points[i % points.length];
      if (!equal(a.right, a.anchor) || !equal(b.left, b.anchor))
        builder.addBezierXY(...px(a.right), ...px(b.left), ...px(b.anchor));
      else if (i < points.length) builder.lineToXY(...px(b.anchor));
    }
    builder.close();
    poly.addCurve(builder.createCurve());
  }
  const def = PolyCurveNodeDefinition.create(poly, black, none, style, none);
  def.userDescription = `M0 HRI ${node.id}; source fillRule=${node.fillRule}; verify holes`;
  defs.push(def);
}
const envelope = PolyCurve.create();
envelope.addCurve(
  Curve.createRectangle(
    new Rectangle(10 * factor, 10 * factor, scene.widthMm * factor, scene.heightMm * factor),
  ),
);
const helper = PolyCurveNodeDefinition.create(envelope, none, none, style, none);
helper.userDescription = 'M0 HRI transparent scene envelope';
defs.push(helper);
const group = ContainerNodeDefinition.create(`AstMatrix M0 ${JSON.stringify(scene.metadata)}`);
const parent = AddChildNodesCommandBuilder.create();
parent.addNode(group);
const children = AddChildNodesCommandBuilder.create();
for (const def of defs) children.addNode(def);
doc.executeCommand(
  CompoundCommandBuilder.create()
    .addCommand(parent.createCommand(true))
    .addCommand(children.createCommand(false))
    .createCommand(),
  false,
);
console.log(
  JSON.stringify({
    task: 'M0-07',
    revision: 'hri-01',
    host: Application.version,
    sdk: Environment.sdkVersionStr,
    v8: Environment.v8VersionStr,
    dpi: doc.dpi,
    widthMm: scene.widthMm,
    heightMm: scene.heightMm,
    definitions: defs.length,
    insertMs: Date.now() - start,
    scope: 'HRI native candidate; edit/holes/physical dimensions/Undo/export are manual checks',
  }),
);
