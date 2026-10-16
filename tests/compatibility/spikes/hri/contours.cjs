/* M0 native point conversion; pure data, no host/DOM/encoding APIs. */
function vertex(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error('Non-finite native path coordinate');
  return { anchor: [x, y], left: [x, y], right: [x, y] };
}
function equal(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
function toContours(scene) {
  if (scene.version !== 1 || scene.units !== 'mm') throw new Error('Invalid native scene');
  return scene.nodes.map((node) => {
    const g = node.geometry;
    if (g.kind === 'rect') {
      if (!(g.w > 0 && g.h > 0)) throw new Error('Invalid native rectangle');
      return {
        id: node.id,
        fillRule: 'nonzero',
        contours: [
          [
            vertex(g.x, g.y),
            vertex(g.x + g.w, g.y),
            vertex(g.x + g.w, g.y + g.h),
            vertex(g.x, g.y + g.h),
          ],
        ],
      };
    }
    if (g.kind !== 'path' || !['nonzero', 'evenodd'].includes(g.fillRule))
      throw new Error('Unsupported native geometry');
    const contours = [];
    let points = null;
    for (const c of g.commands) {
      if (c.op === 'M') {
        if (points) throw new Error('Unclosed native contour');
        points = [vertex(c.x, c.y)];
      } else if (c.op === 'L' || c.op === 'C') {
        if (!points) throw new Error('Missing native contour start');
        const p = vertex(c.x, c.y);
        if (c.op === 'C') {
          points[points.length - 1].right = vertex(c.x1, c.y1).anchor;
          p.left = vertex(c.x2, c.y2).anchor;
        }
        points.push(p);
      } else if (c.op === 'Z') {
        if (!points || points.length < 2) throw new Error('Empty native contour');
        // Transfer the final incoming handle to the first vertex, then let native closed
        // paths express the last segment. Avoid duplicate coincident end/start anchors.
        if (equal(points[0].anchor, points[points.length - 1].anchor)) {
          points[0].left = points[points.length - 1].left;
          points.pop();
        }
        if (points.length < 2) throw new Error('Degenerate native contour');
        contours.push(points);
        points = null;
      } else throw new Error('Unsupported native command');
    }
    if (points || !contours.length) throw new Error('Unclosed/empty native geometry');
    return { id: node.id, fillRule: g.fillRule, contours };
  });
}
module.exports = { toContours, equal };
