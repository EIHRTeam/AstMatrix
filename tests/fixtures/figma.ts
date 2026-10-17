import { vi } from 'vitest';
import { generateScene } from '@astmatrix/barcode-core';
import type { FigmaRuntimeAPI } from '@astmatrix/host-adapter-figma-plugin/runtime';

export const figmaScene = () =>
  generateScene({
    symbologyId: 'code128',
    profileId: 'code128-default',
    fields: { text: 'ABC-12345' },
  });

export class TestFigmaNode {
  id: string;
  removed = false;
  name = '';
  x = 0;
  y = 0;
  width = 100;
  height = 100;
  fills: readonly Paint[] = [];
  strokes: readonly Paint[] = [];
  vectorPaths: VectorPaths = [];
  children: TestFigmaNode[] = [];
  parent: TestFigmaNode | null = null;
  data = new Map<string, string>();
  clipsContent = true;
  layoutMode = 'NONE';
  readonly type: string;
  constructor(type: string, id: string) {
    this.type = type;
    this.id = id;
  }
  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }
  appendChild(node: TestFigmaNode): void {
    if (node.parent) node.parent.children = node.parent.children.filter((n) => n !== node);
    node.parent = this;
    this.children.push(node);
  }
  setPluginData(key: string, value: string): void {
    this.data.set(key, value);
  }
  remove = vi.fn<() => void>(() => {
    this.removed = true;
    this.children.forEach((n) => {
      n.removed = true;
    });
    if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
  });
}
export function fakeFigma() {
  const created: TestFigmaNode[] = [];
  const events = new Map<string, () => void>();
  let page = Object.assign(new TestFigmaNode('PAGE', 'page-1'), {
    selection: [] as TestFigmaNode[],
  });
  const make = (type: string) => {
    const node = new TestFigmaNode(type, `node-${created.length}`);
    created.push(node);
    page.appendChild(node);
    return node;
  };
  const api = {
    root: { id: 'root' },
    get currentPage() {
      return page;
    },
    viewport: { center: { x: 250, y: 360 } },
    createFrame: vi.fn<() => TestFigmaNode>(() => make('FRAME')),
    createRectangle: vi.fn<() => TestFigmaNode>(() => make('RECTANGLE')),
    createEllipse: vi.fn<() => TestFigmaNode>(() => make('ELLIPSE')),
    createVector: vi.fn<() => TestFigmaNode>(() => make('VECTOR')),
    commitUndo: vi.fn<() => void>(),
    openExternal: vi.fn<(url: string) => void>(),
    ui: {
      onmessage: undefined as undefined | ((value: unknown) => void),
      postMessage: vi.fn<(message: Record<string, unknown>) => void>(),
    },
    on: vi.fn<(name: string, listener: () => void) => void>((name, listener) => {
      events.set(name, listener);
    }),
    off: vi.fn<(name: string) => void>((name) => {
      events.delete(name);
    }),
  };
  return {
    api: api as unknown as FigmaRuntimeAPI,
    mock: api,
    created,
    changePage() {
      page = Object.assign(new TestFigmaNode('PAGE', 'page-2'), {
        selection: [] as TestFigmaNode[],
      });
      events.get('currentpagechange')?.();
    },
    emit(name: string) {
      events.get(name)?.();
    },
  };
}
