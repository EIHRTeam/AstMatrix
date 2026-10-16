/* Illustrator native renderer. Units are mm, Scene y increases down. */
$._astmatrix.render = function (doc, scene, placement, objectId) {
    var pt = 72 / 25.4, group = null, previousCoordinates = app.coordinateSystem;
    var oldSelection = doc.selection, artboard = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    var centerX = (artboard[0] + artboard[2]) / 2, centerY = (artboard[1] + artboard[3]) / 2;
    if (placement === 'selection') {
        if (!oldSelection || !oldSelection.length) throw $._astmatrix.error('INVALID_INPUT', '请先选择定位对象');
        var left = Infinity, right = -Infinity, top = -Infinity, bottom = Infinity, b;
        for (var s = 0; s < oldSelection.length; s++) {
            b = oldSelection[s].geometricBounds;
            if (!b) throw $._astmatrix.error('UNSUPPORTED_FEATURE', '当前选择没有几何尺寸');
            left = Math.min(left, b[0]); top = Math.max(top, b[1]); right = Math.max(right, b[2]); bottom = Math.min(bottom, b[3]);
        }
        centerX = (left + right) / 2; centerY = (top + bottom) / 2;
    }
    var ox = centerX - scene.widthMm * pt / 2, oy = centerY + scene.heightMm * pt / 2;
    function color(fill) {
        var c, sample, r, g, b;
        if (fill.space === 'CMYK') {
            sample = [fill.c, fill.m, fill.y, fill.k];
            if (doc.documentColorSpace === DocumentColorSpace.RGB) {
                sample = app.convertSampleColor(ImageColorSpace.CMYK, sample, ImageColorSpace.RGB, ColorConvertPurpose.defaultpurpose);
                c = new RGBColor(); c.red = sample[0]; c.green = sample[1]; c.blue = sample[2]; return c;
            }
        } else {
            r = parseInt(fill.hex.substr(0, 2), 16); g = parseInt(fill.hex.substr(2, 2), 16); b = parseInt(fill.hex.substr(4, 2), 16);
            if (doc.documentColorSpace === DocumentColorSpace.RGB) {
                c = new RGBColor(); c.red = r; c.green = g; c.blue = b; return c;
            }
            sample = app.convertSampleColor(ImageColorSpace.RGB, [r, g, b], ImageColorSpace.CMYK, ColorConvertPurpose.defaultpurpose);
        }
        c = new CMYKColor(); c.cyan = sample[0]; c.magenta = sample[1]; c.yellow = sample[2]; c.black = sample[3]; return c;
    }
    function paint(path, fill, rule) { path.stroked = false; path.filled = true; path.fillColor = color(fill); path.evenodd = rule === 'evenodd'; }
    function point(x, y) { return [ox + x * pt, oy - y * pt]; }
    try {
        if (doc.activeLayer.locked || !doc.activeLayer.visible) throw $._astmatrix.error('PERMISSION_DENIED', '当前图层锁定或不可见');
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        group = doc.activeLayer.groupItems.add(); group.name = 'AstMatrix ' + scene.metadata.symbologyId;
        var note = $._astmatrix.json.stringify({ astmatrix: 1, objectId: objectId, metadata: scene.metadata });
        group.note = note;
        if (group.note !== note) throw new Error('Metadata write failed');
        var envelope = group.pathItems.rectangle(oy, ox, scene.widthMm * pt, scene.heightMm * pt);
        envelope.name = 'AstMatrix quiet-zone envelope'; envelope.filled = false; envelope.stroked = false;
        if (scene.background) {
            var background = group.pathItems.rectangle(oy, ox, scene.widthMm * pt, scene.heightMm * pt);
            paint(background, scene.background, 'nonzero'); background.name = 'Background';
        }
        for (var i = 0; i < scene.nodes.length; i++) {
            if (scene.nodes[i].role === 'quiet-zone') continue;
            var n = scene.nodes[i], g = n.geometry, fill = n.fill || scene.foreground;
            var path, compound, p, last, c, j, points;
            if (g.kind === 'rect') {
                path = group.pathItems.rectangle(oy - g.y * pt, ox + g.x * pt, g.w * pt, g.h * pt); paint(path, fill, 'nonzero');
            } else if (g.kind === 'ellipse') {
                path = group.pathItems.ellipse(oy - (g.cy - g.ry) * pt, ox + (g.cx - g.rx) * pt, g.rx * 2 * pt, g.ry * 2 * pt); paint(path, fill, 'nonzero');
            } else if (g.kind === 'polygon') {
                points = []; for (j = 0; j < g.points.length; j++) points.push(point(g.points[j].x, g.points[j].y));
                path = group.pathItems.add(); path.setEntirePath(points); path.closed = true; paint(path, fill, g.fillRule);
            } else if (g.kind === 'text') {
                var frame = group.textFrames.add(); frame.contents = g.text;
                frame.textRange.characterAttributes.textFont = app.textFonts.getByName(g.fontFamily);
                frame.textRange.characterAttributes.size = g.fontSizeMm * pt;
                frame.textRange.characterAttributes.fillColor = color(fill); frame.position = point(g.x, g.y); frame.name = n.id;
            } else if (g.kind === 'path') {
                compound = group.compoundPathItems.add(); compound.name = n.id; path = null;
                for (j = 0; j < g.commands.length; j++) {
                    c = g.commands[j];
                    if (c.op === 'M') path = compound.pathItems.add();
                    if (c.op === 'M' || c.op === 'L' || c.op === 'C') {
                        if (c.op === 'C') { last = path.pathPoints[path.pathPoints.length - 1]; last.rightDirection = point(c.x1, c.y1); }
                        p = path.pathPoints.add(); p.anchor = point(c.x, c.y);
                        p.leftDirection = c.op === 'C' ? point(c.x2, c.y2) : p.anchor; p.rightDirection = p.anchor; p.pointType = PointType.CORNER;
                    } else if (c.op === 'Z') {
                        var first = path.pathPoints[0], end = path.pathPoints[path.pathPoints.length - 1];
                        if (path.pathPoints.length > 2 && first.anchor[0] === end.anchor[0] && first.anchor[1] === end.anchor[1]) {
                            first.leftDirection = end.leftDirection; end.remove();
                        }
                        path.closed = true; paint(path, fill, g.fillRule);
                    }
                }
            }
            if (path) path.name = n.id;
        }
        doc.selection = null; group.selected = true; app.redraw();
        return { objectId: objectId, documentId: $._astmatrix.snapshot().documentId };
    } catch (error) {
        if (group) {
            try { group.remove(); doc.selection = oldSelection; }
            catch (cleanup) { var failed = $._astmatrix.error('ROLLBACK_FAILED', '插入失败且清理失败'); failed.originalError = String(error); failed.cleanupError = String(cleanup); throw failed; }
            var rolled = $._astmatrix.error('PARTIAL_INSERT_ROLLED_BACK', '插入失败，已清理本次对象'); rolled.originalError = String(error); throw rolled;
        }
        throw error;
    } finally { app.coordinateSystem = previousCoordinates; }
};
