import { expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { AstMatrixApplicationService } from '@astmatrix/application';
import { geometryContours } from '@astmatrix/host-adapter-photoshop-uxp';
import type { Vertex } from '../../packages/host-adapters/photoshop-uxp/src/shape';
import { profiles } from '@astmatrix/profiles';
import { renderSvg } from '@astmatrix/renderers-svg';
import type { PathCommand } from '@astmatrix/vector-ir';
function commands(points: Vertex[]): PathCommand[] {
  const result: PathCommand[] = [{ op: 'M', x: points[0]!.anchor[0], y: points[0]!.anchor[1] }];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    if (
      a.right[0] === a.anchor[0] &&
      a.right[1] === a.anchor[1] &&
      b.left[0] === b.anchor[0] &&
      b.left[1] === b.anchor[1]
    ) {
      result.push({ op: 'L', x: b.anchor[0], y: b.anchor[1] });
      continue;
    }
    result.push({
      op: 'C',
      x1: a.right[0],
      y1: a.right[1],
      x2: b.left[0],
      y2: b.left[1],
      x: b.anchor[0],
      y: b.anchor[1],
    });
  }
  result.push({ op: 'Z' });
  return result;
}
it.each(profiles.filter((p) => p.id !== 'qr-mobile'))(
  'preserves $id production outlines after native cubic/closure conversion (shared raster comparison)',
  async (p) => {
    const { scene } = await new AstMatrixApplicationService().generate({
      symbologyId: p.symbologyId,
      profileId: p.id,
      fields: p.defaults,
    });
    const native = {
      ...scene,
      nodes: scene.nodes.map((n) => {
        const contours = geometryContours(n.geometry);
        return {
          ...n,
          geometry: {
            kind: 'path' as const,
            fillRule:
              n.geometry.kind === 'path' || n.geometry.kind === 'polygon'
                ? n.geometry.fillRule
                : ('nonzero' as const),
            commands: contours.flatMap((c) => commands(c.points)),
          },
        };
      }),
    };
    const raster = (svg: string) =>
      new Resvg(svg, {
        fitTo: { mode: 'width', value: 400 },
        font: { loadSystemFonts: false },
      }).render().pixels;
    const before = raster(renderSvg(scene)),
      after = raster(renderSvg(native));
    expect(after.length).toBe(before.length);
    const changed = after.reduce((sum, v, i) => sum + (v !== before[i] ? 1 : 0), 0);
    // Native closure drops collinear zero-area FontLib contours; compare occupied pixels
    // and bound antialiasing differences, not the renderer's treatment of a zero-area edge.
    expect(changed / after.length).toBeLessThan(0.0005);
    let occupiedChanges = 0,
      alphaDifference = 0;
    for (let i = 3; i < after.length; i += 4) {
      if (after[i]! > 128 !== before[i]! > 128) occupiedChanges++;
      alphaDifference += Math.abs(after[i]! - before[i]!);
    }
    expect(occupiedChanges).toBe(0);
    expect(alphaDifference / (after.length / 4)).toBeLessThan(0.02);
  },
);
