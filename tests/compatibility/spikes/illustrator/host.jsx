/* M0 experiment only. ES3; no production adapter. Called once via CEP evalScript. */
if (!$._astmatrixM0) $._astmatrixM0 = {};
$._astmatrixM0.insert = function (scene, metadataJson, failAfter) {
    if (!app.documents.length) return 'FAIL: open a disposable document';
    var doc = app.activeDocument;
    var group = null;
    var pt = 72 / 25.4;
    var box = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    var ox = box[0] + 10 * pt;
    var oy = box[1] - 10 * pt;
    var previousCoordinates = app.coordinateSystem;
    try {
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        group = doc.groupItems.add();
        group.name = 'AstMatrix M0';
        group.note = metadataJson;
        var envelope = group.pathItems.rectangle(oy, ox, scene.widthMm * pt, scene.heightMm * pt);
        envelope.filled = false; envelope.stroked = false;
        envelope.name = 'M0 quiet-zone bounds (verify export manually)';
        var color = new RGBColor(); color.red = 0; color.green = 0; color.blue = 0;
        for (var i = 0; i < scene.nodes.length; i++) {
            var g = scene.nodes[i].geometry;
            var path, compound, j, c, p, last;
            if (g.kind === 'rect') {
                path = group.pathItems.rectangle(oy - g.y * pt, ox + g.x * pt, g.w * pt, g.h * pt);
                path.filled = true; path.stroked = false; path.fillColor = color;
            } else if (g.kind === 'path') {
                compound = group.compoundPathItems.add();
                path = null;
                for (j = 0; j < g.commands.length; j++) {
                    c = g.commands[j];
                    if (c.op === 'M') path = compound.pathItems.add();
                    if (c.op === 'M' || c.op === 'L' || c.op === 'C') {
                        if (!path) throw new Error('Missing path start');
                        if (c.op === 'C') {
                            last = path.pathPoints[path.pathPoints.length - 1];
                            last.rightDirection = [ox + c.x1 * pt, oy - c.y1 * pt];
                        }
                        p = path.pathPoints.add();
                        p.anchor = [ox + c.x * pt, oy - c.y * pt];
                        p.leftDirection = c.op === 'C' ? [ox + c.x2 * pt, oy - c.y2 * pt] : p.anchor;
                        p.rightDirection = p.anchor;
                        p.pointType = PointType.CORNER;
                    } else if (c.op === 'Z') {
                        path.closed = true; path.filled = true; path.stroked = false;
                        path.fillColor = color; path.evenodd = g.fillRule === 'evenodd';
                    }
                }
            } else throw new Error('Unsupported geometry');
            if (failAfter >= 0 && i >= failAfter) throw new Error('M0 injected failure');
        }
        doc.selection = null; group.selected = true;
        return 'INSERTED; host=' + app.version + '; OS=' + $.os + '; ExtendScript=' + $.version +
            '; sceneMm=' + scene.widthMm + 'x' + scene.heightMm +
            '; groupBoundsPt=' + group.geometricBounds.join(',') + '; noteLength=' + group.note.length +
            '; editable/undo/save/export=MANUAL';
    } catch (error) {
        if (group) group.remove();
        return 'FAIL cleaned experiment group: ' + error;
    } finally { app.coordinateSystem = previousCoordinates; }
};
$._astmatrixM0.read = function () {
    if (!app.documents.length || app.activeDocument.selection.length !== 1) return 'FAIL: select M0 group';
    return app.activeDocument.selection[0].note || 'FAIL: no note';
};

$._astmatrixM0.writeNote = function (value) {
    if (!app.documents.length || app.activeDocument.selection.length !== 1) return 'FAIL: select M0 group';
    var item = app.activeDocument.selection[0];
    if (item.name !== 'AstMatrix M0') return 'FAIL: select M0 group';
    item.note = value;
    return 'requestedChars=' + value.length + '; storedChars=' + item.note.length + '; save/reopen exact comparison=MANUAL';
};
