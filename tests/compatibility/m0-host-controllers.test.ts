import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { encodeSpike } from '../../packages/barcode-core/src/spike';

const scene = encodeSpike({ bcid: 'qrcode', text: 'https://example.com/barcode' });

function photoshop(
  failAtFill = false,
  options: {
    maskExists?: boolean;
    consumedPath?: boolean;
    metadataFailure?: boolean;
    quiet?: {
      dpi?: number;
      groupFailure?: boolean;
      omitEnvelopeBounds?: boolean;
      smallCanvas?: boolean;
      loseShapeMask?: boolean;
    };
  } = {},
) {
  const dom = new JSDOM(readFileSync('tests/compatibility/spikes/photoshop/index.html', 'utf8'));
  const resumeHistory = vi.fn<(id: string, commit: boolean) => Promise<void>>(async () => {});
  const remove = vi.fn<() => Promise<void>>(async () => {});
  let lastBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  const add = vi.fn<(name: string, paths: unknown[]) => Promise<{ remove: typeof remove }>>(
    async (_name, paths) => {
      const anchors = (paths as Array<{ entireSubPath: Array<{ anchor: number[] }> }>).flatMap(
        (path) => path.entireSubPath.map((point) => point.anchor),
      );
      lastBounds = {
        left: Math.min(...anchors.map((anchor) => anchor[0]!)),
        top: Math.min(...anchors.map((anchor) => anchor[1]!)),
        right: Math.max(...anchors.map((anchor) => anchor[0]!)),
        bottom: Math.max(...anchors.map((anchor) => anchor[1]!)),
      };
      return { remove };
    },
  );
  const layer = { id: 42, name: '' };
  if (options.metadataFailure)
    Object.defineProperty(layer, 'name', {
      get: () => '',
      set: () => {
        throw new Error('Layer name rejected');
      },
    });
  const doc = {
    id: 7,
    resolution: options.quiet?.dpi ?? 300,
    mode: 'RGBColorMode',
    width: options.quiet?.smallCanvas ? 10 : 2000,
    height: options.quiet?.smallCanvas ? 10 : 2000,
    pathItems: { length: 0, add },
    activeLayers: [layer],
  };
  const envelope = { id: 43, name: '', opacity: 100, boundsNoEffects: lastBounds };
  const group = { id: 44, name: '', boundsNoEffects: lastBounds };
  const createLayerGroup = vi.fn<
    (config: { name: string; fromLayers: unknown[] }) => Promise<typeof group>
  >(async (config) => {
    if (options.quiet?.groupFailure) throw new Error('Group creation rejected');
    group.name = config.name;
    group.boundsNoEffects = options.quiet?.omitEnvelopeBounds
      ? { left: 0, top: 0, right: 0, bottom: 0 }
      : envelope.boundsNoEffects;
    return group;
  });
  Object.assign(doc, { createLayerGroup });
  let fillCount = 0;
  let hasMask = options.maskExists || false;
  const batchPlay = vi.fn<
    (commands: Array<Record<string, unknown>>) => Promise<Array<Record<string, unknown>>>
  >(async (commands) => {
    const c = commands[0]!;
    if (
      c['_obj'] === 'make' &&
      (c['_target'] as Array<{ _ref: string }>)[0]!['_ref'] === 'contentLayer'
    ) {
      fillCount++;
      if (fillCount === 2) {
        envelope.boundsNoEffects = lastBounds;
        doc.activeLayers = [envelope];
      }
    }
    if (
      c['_obj'] === 'make' &&
      (c['_target'] as Array<{ _ref: string }>)[0]!['_ref'] === 'contentLayer' &&
      failAtFill
    )
      return [{ _obj: 'error', message: 'Program error', result: -32005 }];
    if (c['_obj'] === 'make' && (c['_target'] as Array<{ _ref: string }>)[0]!['_ref'] === 'path')
      hasMask = true;
    if (c['_obj'] === 'get') {
      const ref = (c['_target'] as Array<{ _name?: string; _enum?: string }>)[0]!;
      if (ref['_enum'] === 'path')
        if (
          options.quiet?.loseShapeMask &&
          createLayerGroup.mock.calls.length &&
          (c['_target'] as Array<{ _id?: number }>)[1]!['_id'] === layer.id
        )
          return [{ pathContents: { pathComponents: [] } }];
      if (ref['_enum'] === 'path')
        return hasMask
          ? [{ pathContents: { pathComponents: [{ subpathListKey: [] }] } }]
          : [{ _obj: 'error', result: -25920 }];
      return options.consumedPath
        ? [{ _obj: 'error', result: -25920 }]
        : [{ pathContents: { pathComponents: [] } }];
    }
    if (c['_obj'] === 'delete') {
      const ref = (c['_target'] as Array<{ _name?: string }>)[0]!;
      if (
        !ref['_name']?.startsWith('AstMatrix M0 temporary ') &&
        !ref['_name']?.startsWith('AstMatrix M0 quiet temporary ')
      )
        throw new Error('Unsafe path delete');
    }
    return [{}];
  });
  const ps = {
    app: {
      documents: [doc],
      activeDocument: doc,
      version: '27.8.0',
      PathPointInfo: class {
        anchor: number[] = [];
        leftDirection: number[] = [];
        rightDirection: number[] = [];
        kind = '';
      },
      SubPathInfo: class {
        closed = false;
        operation = '';
        entireSubPath: unknown[] = [];
      },
    },
    constants: { PointKind: { CORNERPOINT: 'cornerPoint' }, ShapeOperation: { SHAPEXOR: 'xor' } },
    core: {
      executeAsModal: async (callback: (ctx: unknown) => Promise<void>) =>
        callback({ hostControl: { suspendHistory: async () => 'history', resumeHistory } }),
    },
    action: { batchPlay },
  };
  const helperContext = vm.createContext({ module: { exports: {} } });
  vm.runInContext(
    readFileSync('tests/compatibility/spikes/photoshop/quiet-zone.js', 'utf8'),
    helperContext,
  );
  const context = vm.createContext({
    document: dom.window.document,
    navigator: { userAgent: 'mock' },
    require: (name: string) =>
      name === 'photoshop'
        ? ps
        : name === './quiet-zone.js'
          ? helperContext['module'].exports
          : scene,
  });
  vm.runInContext(readFileSync('tests/compatibility/spikes/photoshop/index.js', 'utf8'), context);
  return { context, dom, add, remove, resumeHistory, batchPlay, layer, envelope, createLayerGroup };
}

describe('M0 host controller regressions (mock contracts, no host acceptance)', () => {
  it('builds Affinity switches on a group and exits on cancel before creating objects', () => {
    const addSwitch = vi.fn<(_label: string, value: boolean) => { value: boolean }>(
      (_label, value) => ({ value }),
    );
    const addGroup = vi.fn<() => { addSwitch: typeof addSwitch }>(() => ({ addSwitch }));
    const executeCommand = vi.fn<(command: unknown, preview: boolean) => void>();
    const output = vi.fn<(value: string) => void>();
    const modules: Record<string, unknown> = {
      '/document.js': { Document: { current: { dpi: 300, executeCommand } } },
      '/provider.cjs': { encodeSpike: () => scene },
      '/environment.js': {
        Environment: {
          getHeapStatistics: () => ({}),
          sdkVersionStr: '0.1',
          v8VersionStr: '11.5.150.4',
        },
      },
      '/application.js': { Application: { version: '3.3.1', platformName: 'MacOS' } },
      '/dialog.js': {
        Dialog: { create: () => ({ addColumn: () => ({ addGroup }), runModal: () => 0 }) },
        DialogResult: { Ok: { value: 1 } },
      },
    };
    const context = vm.createContext({
      require: (name: string) => modules[name] || {},
      module: { exports: {} },
      console: { log: output },
    });
    vm.runInContext(readFileSync('tests/compatibility/spikes/affinity/main.cjs', 'utf8'), context);
    vm.runInContext('main()', context);
    expect(addGroup).toHaveBeenCalledWith('M0 insert options');
    expect(addSwitch).toHaveBeenCalledTimes(2);
    expect(executeCommand).not.toHaveBeenCalled();
    expect(JSON.parse(output.mock.calls[0]![0]).heapAfter).toEqual({
      status: 'unavailable',
      reason: 'No numeric heap fields exposed',
    });
  });

  it('converts primitive anchors and Bezier handles at document DPI, attaches a mask, deletes only the named path, then commits', async () => {
    const host = photoshop();
    host.dom.window.document.getElementById('sample-primitives')!.click();
    await vm.runInContext('insert(false)', host.context);
    const paths = host.add.mock.calls[0]![1] as Array<{
      entireSubPath: Array<{ anchor: number[]; rightDirection: number[] }>;
    }>;
    expect(
      paths[0]!.entireSubPath[1]!.anchor[0]! - paths[0]!.entireSubPath[0]!.anchor[0]!,
    ).toBeCloseTo((20 * 300) / 25.4, 10);
    expect(paths[1]!.entireSubPath[0]!.rightDirection[0]!).toBeCloseTo((40 * 300) / 25.4, 10);
    expect(host.layer.name).toContain('m0-primitives');
    expect(host.remove).not.toHaveBeenCalled();
    expect(
      host.batchPlay.mock.calls
        .flatMap(([commands]) => commands)
        .filter((c) => c['_obj'] === 'delete'),
    ).toHaveLength(1);
    expect(host.resumeHistory).toHaveBeenCalledWith('history', true);
    host.dom.window.close();
  });

  it('accepts readable vector geometry when layer flags are absent and the source path was consumed', async () => {
    const host = photoshop(false, { maskExists: true, consumedPath: true });
    await vm.runInContext('insert(false)', host.context);
    expect(
      host.batchPlay.mock.calls
        .flatMap(([commands]) => commands)
        .filter(
          (c) =>
            c['_obj'] === 'delete' ||
            (c['_obj'] === 'make' &&
              (c['_target'] as Array<{ _ref: string }>)[0]!['_ref'] === 'path'),
        ),
    ).toHaveLength(0);
    expect(host.resumeHistory).toHaveBeenCalledWith('history', true);
    host.dom.window.close();
  });

  it('keeps verified geometry when the separate layer-name metadata candidate fails', async () => {
    const host = photoshop(false, { maskExists: true, metadataFailure: true });
    await vm.runInContext('insert(false)', host.context);
    expect(host.resumeHistory).toHaveBeenCalledWith('history', true);
    expect(host.resumeHistory).not.toHaveBeenCalledWith('history', false);
    expect((host.dom.window.document.getElementById('log') as HTMLTextAreaElement).value).toContain(
      'Layer name rejected',
    );
    host.dom.window.close();
  });

  it('has a bounded scroll region and a fixed log entry outside that region', () => {
    const host = photoshop();
    const content = host.dom.window.document.getElementById('panel-content')!;
    expect(host.dom.window.getComputedStyle(content).overflow).toBe('auto');
    expect(host.dom.window.getComputedStyle(content).bottom).toBe('78px');
    expect(
      host.dom.window.document.getElementById('show-log')!.closest('#panel-content'),
    ).toBeNull();
    host.dom.window.close();
  });

  it('opens the entire log in a modal independently of the scrollable content', async () => {
    const host = photoshop();
    let copiedLog = '';
    Object.defineProperty(host.dom.window.HTMLElement.prototype, 'uxpShowModal', {
      value: function (this: HTMLElement) {
        copiedLog = (this.querySelector('textarea') as HTMLTextAreaElement).value;
        return Promise.resolve();
      },
    });
    await vm.runInContext('showLog()', host.context);
    expect(copiedLog).toContain('hotfix-03');
    expect(copiedLog).toContain('27.8.0');
    expect(host.dom.window.document.querySelector('dialog')).toBeNull();
    host.dom.window.close();
  });

  it('never requests rollback after a successful commit when logging fails', async () => {
    const host = photoshop();
    const log = host.dom.window.document.getElementById('log') as HTMLTextAreaElement;
    let stored = log.value;
    Object.defineProperty(log, 'value', {
      get: () => stored,
      set: (value: string) => {
        if (value.includes('"status": "inserted"')) throw new Error('Log rejected');
        stored = value;
      },
    });
    await vm.runInContext('insert(false)', host.context);
    expect(host.resumeHistory).toHaveBeenCalledWith('history', true);
    expect(host.resumeHistory).not.toHaveBeenCalledWith('history', false);
    expect(vm.runInContext('records', host.context)).toContain('"status": "inserted"');
    host.dom.window.close();
  });

  it('rolls back an injected failure after creating the path and never makes a layer', async () => {
    const host = photoshop();
    await expect(vm.runInContext('insert(true)', host.context)).rejects.toThrow(/injected failure/);
    expect(host.add).toHaveBeenCalledOnce();
    expect(host.batchPlay).not.toHaveBeenCalled();
    expect(host.resumeHistory).toHaveBeenCalledWith('history', false);
    host.dom.window.close();
  });

  it('reports the failing action step and restores controls after a Photoshop program error', async () => {
    const host = photoshop(true);
    await vm.runInContext('run(() => insert(false))', host.context);
    const log = host.dom.window.document.getElementById('log') as HTMLTextAreaElement;
    expect(log.value.startsWith('null')).toBe(false);
    expect(log.value).toContain('make-fill-layer');
    expect(log.value).toContain('-32005');
    expect(host.resumeHistory).toHaveBeenCalledWith('history', false);
    expect((host.dom.window.document.getElementById('insert') as HTMLButtonElement).disabled).toBe(
      false,
    );
    host.dom.window.close();
  });

  for (const dpi of [72, 300, 600]) {
    it(`optional PS quiet envelope: complete 14.8 mm rectangle at ${dpi} DPI, transparent group and one history commit`, async () => {
      const host = photoshop(false, { maskExists: true, quiet: { dpi } });
      await vm.runInContext('insert(false, true)', host.context);
      const paths = host.add.mock.calls[1]![1] as Array<{
        entireSubPath: Array<{ anchor: number[] }>;
      }>;
      expect(paths).toHaveLength(1);
      const anchors = paths[0]!.entireSubPath.map((p) => p.anchor);
      expect(anchors).toHaveLength(4);
      expect(anchors[0]![0]).toBeCloseTo((10 * dpi) / 25.4, 8);
      expect(anchors[1]![0]! - anchors[0]![0]!).toBeCloseTo((14.8 * dpi) / 25.4, 8);
      expect(anchors[2]![1]! - anchors[1]![1]!).toBeCloseTo((14.8 * dpi) / 25.4, 8);
      expect(host.envelope.opacity).toBe(0);
      expect(host.createLayerGroup).toHaveBeenCalledWith({
        name: `AstMatrix M0 ${JSON.stringify(scene.metadata)}`,
        fromLayers: [host.layer, host.envelope],
      });
      expect(host.resumeHistory.mock.calls).toEqual([['history', true]]);
      const records = vm.runInContext('records', host.context) as string;
      expect(records).toContain('"groupBoundsCandidate": "pass"');
      expect(records).toContain('not-run; transparent helper may be excluded');
      expect(
        host.batchPlay.mock.calls
          .flatMap(([commands]) => commands)
          .filter((c) => c['_obj'] === 'delete'),
      ).toHaveLength(2);
      host.dom.window.close();
    });
  }
  it('records excluded transparent bounds as a failed candidate, not a quiet-zone export pass', async () => {
    const host = photoshop(false, { maskExists: true, quiet: { omitEnvelopeBounds: true } });
    await vm.runInContext('insert(false, true)', host.context);
    expect(vm.runInContext('records', host.context)).toContain('"groupBoundsCandidate": "fail"');
    expect(host.resumeHistory.mock.calls).toEqual([['history', true]]);
    host.dom.window.close();
  });
  it('rolls back the shape and envelope together if failure happens after envelope creation', async () => {
    const host = photoshop(false, { maskExists: true, quiet: {} });
    await expect(vm.runInContext('insert(true, true)', host.context)).rejects.toThrow(
      'after quiet envelope',
    );
    expect(host.add).toHaveBeenCalledTimes(2);
    expect(host.createLayerGroup).not.toHaveBeenCalled();
    expect(host.resumeHistory.mock.calls).toEqual([['history', false]]);
    host.dom.window.close();
  });
  it('rolls back when grouping fails, and rejects a cropped quiet envelope before creating it', async () => {
    const grouped = photoshop(false, { maskExists: true, quiet: { groupFailure: true } });
    await expect(vm.runInContext('insert(false, true)', grouped.context)).rejects.toThrow(
      'Group creation rejected',
    );
    expect(grouped.resumeHistory.mock.calls).toEqual([['history', false]]);
    grouped.dom.window.close();
    const cropped = photoshop(false, { maskExists: true, quiet: { smallCanvas: true } });
    await expect(vm.runInContext('insert(false, true)', cropped.context)).rejects.toThrow(
      'exceeds document canvas',
    );
    expect(cropped.add).toHaveBeenCalledOnce();
    expect(cropped.resumeHistory.mock.calls).toEqual([['history', false]]);
    cropped.dom.window.close();
  });
  it('rolls back if grouping consumes or loses the original barcode vector mask', async () => {
    const host = photoshop(false, { maskExists: true, quiet: { loseShapeMask: true } });
    await expect(vm.runInContext('insert(false, true)', host.context)).rejects.toThrow(
      'Shape mask lost after grouping',
    );
    expect(host.resumeHistory.mock.calls).toEqual([['history', false]]);
    host.dom.window.close();
  });
});
