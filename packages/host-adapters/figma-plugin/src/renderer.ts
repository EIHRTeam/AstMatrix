import { HostError, validateMetadata } from '@astmatrix/host-contract';
import { errorMessage, stableStringify } from '@astmatrix/shared';
import { geometryBounds, validateScene } from '@astmatrix/vector-ir';
import type { Color, Geometry, VectorScene } from '@astmatrix/vector-ir';

export const MM_TO_FIGMA = 96 / 25.4;
export const FIGMA_METADATA_KEY = 'astmatrix-v1';
export type FigmaDrawingAPI = Pick<
  PluginAPI,
  | 'createFrame'
  | 'createRectangle'
  | 'createEllipse'
  | 'createVector'
  | 'currentPage'
  | 'viewport'
  | 'commitUndo'
>;
export function paint(color: Color): SolidPaint {
  const rgb =
    color.space === 'RGB'
      ? [0, 2, 4].map((i) => parseInt(color.hex.slice(i, i + 2), 16) / 255)
      : [color.c, color.m, color.y].map((v) => (1 - v / 100) * (1 - color.k / 100));
  return { type: 'SOLID', color: { r: rgb[0]!, g: rgb[1]!, b: rgb[2]! }, opacity: 1 };
}
/** Normalize paths around their true bounds before assigning Figma-local geometry. */
export function vectorPath(g: Extract<Geometry, { kind: 'path' | 'polygon' }>): VectorPath {
  const b = geometryBounds(g);
  const xy = (x: number, y: number) => `${(x - b.x) * MM_TO_FIGMA} ${(y - b.y) * MM_TO_FIGMA}`;
  const data =
    g.kind === 'polygon'
      ? g.points.map((p, i) => `${i ? 'L' : 'M'} ${xy(p.x, p.y)}`).join(' ') + ' Z'
      : g.commands
          .map((c) => {
            if (c.op === 'Z') return 'Z';
            if (c.op === 'C') return `C ${xy(c.x1, c.y1)} ${xy(c.x2, c.y2)} ${xy(c.x, c.y)}`;
            return `${c.op} ${xy(c.x, c.y)}`;
          })
          .join(' ');
  return { windingRule: g.fillRule === 'evenodd' ? 'EVENODD' : 'NONZERO', data };
}

/** Synchronous commit: no async boundary between the final guard and node creation. */
export function insertScene(
  api: FigmaDrawingAPI,
  scene: VectorScene,
  isCurrent: () => boolean,
): FrameNode {
  validateScene(scene);
  validateMetadata(scene.metadata);
  if (scene.nodes.some((n) => n.geometry.kind === 'text'))
    throw new HostError('UNSUPPORTED_FEATURE', 'Figma 首版仅支持文字轮廓');
  if (!isCurrent()) throw new HostError('CANCELLED', '输入或页面已变化');
  const page = api.currentPage;
  const previousSelection = [...page.selection];
  const created: SceneNode[] = [];
  try {
    const frame = api.createFrame();
    created.push(frame);
    frame.name = `AstMatrix · ${scene.metadata.symbologyId}`;
    frame.layoutMode = 'NONE';
    frame.clipsContent = false;
    frame.strokes = [];
    frame.fills = scene.background ? [paint(scene.background)] : [];
    frame.resize(scene.widthMm * MM_TO_FIGMA, scene.heightMm * MM_TO_FIGMA);
    frame.x = api.viewport.center.x - frame.width / 2;
    frame.y = api.viewport.center.y - frame.height / 2;
    for (const source of scene.nodes) {
      if (source.role === 'quiet-zone') continue;
      const g = source.geometry;
      if (g.kind === 'text') throw new HostError('UNSUPPORTED_FEATURE', '不支持可编辑文本');
      const node =
        g.kind === 'rect'
          ? api.createRectangle()
          : g.kind === 'ellipse'
            ? api.createEllipse()
            : api.createVector();
      // Creation APIs parent to the page; track before append/configuration can fail.
      created.push(node);
      frame.appendChild(node);
      const bounds = geometryBounds(g);
      if (node.type === 'VECTOR' && (g.kind === 'path' || g.kind === 'polygon'))
        node.vectorPaths = [vectorPath(g)];
      else node.resize(bounds.width * MM_TO_FIGMA, bounds.height * MM_TO_FIGMA);
      node.x = bounds.x * MM_TO_FIGMA;
      node.y = bounds.y * MM_TO_FIGMA;
      node.name = `${source.role} · ${source.id}`;
      node.strokes = [];
      node.fills = [paint(source.fill ?? scene.foreground)];
    }
    frame.setPluginData(FIGMA_METADATA_KEY, stableStringify(scene.metadata));
    page.selection = [frame];
    api.commitUndo();
    return frame;
  } catch (error) {
    const cleanup: string[] = [];
    for (const node of [...created].reverse()) {
      try {
        if (!node.removed) node.remove();
      } catch (failure) {
        cleanup.push(errorMessage(failure));
      }
    }
    try {
      page.selection = previousSelection.filter((n) => !n.removed);
    } catch (failure) {
      cleanup.push(errorMessage(failure));
    }
    throw new HostError(
      cleanup.length ? 'ROLLBACK_FAILED' : 'PARTIAL_INSERT_ROLLED_BACK',
      cleanup.length ? '插入失败，清理也失败；文档中可能残留对象' : '插入失败，已清理本次对象',
      {
        originalError: errorMessage(error),
        ...(cleanup.length ? { cleanupError: cleanup.join('; ') } : {}),
      },
    );
  }
}
