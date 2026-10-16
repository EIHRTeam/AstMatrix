/* M0 native operations only. The immutable expected text is provided by the build. */
module.exports = function (ps, expected, probe, original) {
  function selected() {
    if (!ps.app.documents.length) throw new Error('Open disposable document');
    const doc = ps.app.activeDocument;
    if (doc.activeLayers.length !== 1) throw new Error('Select exactly one M0 layer/group');
    const layer = doc.activeLayers[0];
    if (!layer.name.startsWith('AstMatrix M0 ')) throw new Error('Select M0 layer/group');
    return { doc, layer };
  }
  function report(doc, layer, stage) {
    return {
      task: 'M0-07',
      probeId: 'm0-storage-16k-v1',
      host: ps.app.version,
      documentID: doc.id,
      layerID: layer.id,
      stage,
      ...probe.compare(layer.name, expected),
      scope: 'Selected field equality now; save/reopen/move must each be executed manually',
    };
  }
  return {
    read() {
      const { doc, layer } = selected();
      return report(doc, layer, 'read');
    },
    async write() {
      const { doc, layer } = selected();
      let result;
      await ps.core.executeAsModal(
        async () => {
          if (
            ps.app.activeDocument.id !== doc.id ||
            ps.app.activeDocument.activeLayers.length !== 1 ||
            ps.app.activeDocument.activeLayers[0].id !== layer.id
          )
            throw new Error('Document or selected object changed');
          if (layer.name !== original && layer.name !== expected)
            throw new Error('Select the unchanged default QR metadata fixture');
          layer.name = expected;
          result = report(doc, layer, 'write-immediate');
        },
        { commandName: 'M0 exact 16 KiB metadata' },
      );
      return result;
    },
  };
};
