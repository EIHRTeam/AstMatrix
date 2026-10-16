/* M0 optional native quiet-zone probe. Called inside the existing modal/history boundary. */
function finiteBounds(layer) {
  // DOM bounds are rasterized pixel bounds, not an independent measurement of vector precision.
  const bounds = layer.boundsNoEffects;
  const values = ['left', 'top', 'right', 'bottom'].map((key) => bounds?.[key]);
  return values.every(Number.isFinite)
    ? { left: values[0], top: values[1], right: values[2], bottom: values[3] }
    : null;
}
async function addQuietZone({
  ps,
  doc,
  scene,
  shape,
  metadata,
  point,
  pathInfo,
  batch,
  injectFailure,
}) {
  if (typeof doc.createLayerGroup !== 'function') throw new Error('createLayerGroup unavailable');
  const { x, y, width, height } = scene.quietZoneBounds;
  if (![x, y, width, height, doc.resolution].every(Number.isFinite) || width <= 0 || height <= 0)
    throw new Error('Invalid quiet-zone physical bounds');
  const dpi = doc.resolution;
  const left = x + 10,
    top = y + 10;
  const pixels = {
    left: (left * dpi) / 25.4,
    top: (top * dpi) / 25.4,
    right: ((left + width) * dpi) / 25.4,
    bottom: ((top + height) * dpi) / 25.4,
  };
  // The disposable document must contain the complete envelope, not just its black pixels.
  if (Number.isFinite(doc.width) && Number.isFinite(doc.height)) {
    if (pixels.left < 0 || pixels.top < 0 || pixels.right > doc.width || pixels.bottom > doc.height)
      throw new Error('Quiet-zone envelope exceeds document canvas');
  }
  const name = `AstMatrix M0 quiet temporary ${Date.now()}`;
  await doc.pathItems.add(name, [
    pathInfo([
      point(left, top, dpi),
      point(left + width, top, dpi),
      point(left + width, top + height, dpi),
      point(left, top + height, dpi),
    ]),
  ]);
  const target = [
    { _ref: 'path', _name: name },
    { _ref: 'document', _id: doc.id },
  ];
  await batch('quiet-select-path', [{ _obj: 'select', _target: target }]);
  await batch('quiet-make-envelope', [
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
  const envelope = doc.activeLayers[0];
  if (!envelope || envelope.id === shape.id)
    throw new Error('Quiet envelope layer was not created');
  envelope.opacity = 0;
  envelope.name = 'M0 quiet-zone envelope (0% opacity; verify selection/export)';
  if (envelope.opacity !== 0) throw new Error('Quiet envelope is not transparent');
  const maskQuery = [
    {
      _obj: 'get',
      _target: [
        { _ref: 'path', _enum: 'path', _value: 'vectorMask' },
        { _ref: 'layer', _id: envelope.id },
        { _ref: 'document', _id: doc.id },
      ],
      _options: { dialogOptions: 'dontDisplay' },
    },
  ];
  const [maskBefore] = await ps.action.batchPlay(maskQuery, {});
  if (maskBefore._obj === 'error') {
    await batch('quiet-attach-mask', [
      {
        _obj: 'make',
        _target: [
          { _ref: 'path' },
          { _ref: 'layer', _id: envelope.id },
          { _ref: 'document', _id: doc.id },
        ],
        at: { _ref: 'path', _enum: 'path', _value: 'vectorMask' },
        using: { _ref: 'path', _name: name },
      },
    ]);
  }
  const [remaining] = await ps.action.batchPlay(
    [{ _obj: 'get', _target: target, _options: { dialogOptions: 'dontDisplay' } }],
    {},
  );
  if (remaining._obj !== 'error')
    await batch('quiet-remove-path', [{ _obj: 'delete', _target: target }]);
  const [mask] = await batch('quiet-verify-mask', maskQuery);
  if (!mask.pathContents?.pathComponents?.length)
    throw new Error('Quiet envelope has no vector geometry');
  if (injectFailure) throw new Error('M0 injected failure after quiet envelope creation');
  const group = await doc.createLayerGroup({
    name: `AstMatrix M0 ${JSON.stringify(metadata)}`,
    fromLayers: [shape, envelope],
  });
  await batch('quiet-select-group', [
    {
      _obj: 'select',
      _target: [
        { _ref: 'layer', _id: group.id },
        { _ref: 'document', _id: doc.id },
      ],
    },
  ]);
  const shapeQuery = [
    {
      _obj: 'get',
      _target: [
        { _ref: 'path', _enum: 'path', _value: 'vectorMask' },
        { _ref: 'layer', _id: shape.id },
        { _ref: 'document', _id: doc.id },
      ],
    },
  ];
  const [shapeMask] = await batch('quiet-verify-shape-after-grouping', shapeQuery);
  if (!shapeMask.pathContents?.pathComponents?.length)
    throw new Error('Shape mask lost after grouping');
  const actualEnvelopeBoundsPx = finiteBounds(envelope);
  const actualGroupBoundsPx = finiteBounds(group);
  // Pixel-quantized DOM bounds may exclude a zero-opacity helper. Record that as a failed
  // candidate instead of inventing dimensions or claiming the export behavior is verified.
  const match =
    actualGroupBoundsPx &&
    Object.keys(pixels).every((key) => Math.abs(actualGroupBoundsPx[key] - pixels[key]) <= 1);
  return {
    groupID: group.id,
    envelopeID: envelope.id,
    opacity: envelope.opacity,
    expectedBoundsPx: pixels,
    actualEnvelopeBoundsPx,
    actualGroupBoundsPx,
    groupBoundsCandidate: actualGroupBoundsPx ? (match ? 'pass' : 'fail') : 'unavailable',
    boundTolerancePx: 1,
    widthMm: width,
    heightMm: height,
    mask,
    exportQuietZone: 'not-run; transparent helper may be excluded by export trimming',
  };
}
module.exports = { addQuietZone };
