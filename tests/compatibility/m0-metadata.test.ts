import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { encodeSpike } from '../../packages/barcode-core/src/spike';

interface Comparison {
  status: 'pass' | 'fail';
  exactMatch: boolean;
  expectedBytes: number;
  actualBytes: number | null;
  expectedFingerprint: string;
  actualFingerprint: string | null;
  firstDifferenceUtf16Index: number | null;
}
interface Probe {
  utf8Bytes(text: string): number[];
  fingerprint(text: string): string;
  fixture(json: string, prefix: string, bytes: number): string;
  compare(actual: unknown, expected: string): Comparison;
}
const source = readFileSync('tests/compatibility/spikes/metadata/probe.cjs', 'utf8');
const context = vm.createContext({
  module: { exports: {} },
  JSON: undefined,
  TextEncoder: undefined,
});
vm.runInContext(source, context);
const probe = context['module'].exports as Probe;
const base = encodeSpike({ bcid: 'qrcode', text: 'https://example.com/barcode' }).metadata;

describe('M0 exact storage fixtures and native-operation contracts; no real-host claim', () => {
  it('runs as ES3 without JSON, TextEncoder or Math.imul, matching independent UTF-8 lengths', () => {
    expect(() => parse(source, { ecmaVersion: 3, sourceType: 'script' })).not.toThrow();
    vm.runInContext('Math.imul = undefined;', context);
    for (const value of ['', 'hello', '元数据😀', 'é', '\ud800', '\udc00', '\ud800A', '\n\r"\\']) {
      expect(probe.utf8Bytes(value)).toEqual([...Buffer.from(value, 'utf8')]);
      expect(probe.utf8Bytes(value).length).toBe(Buffer.byteLength(value, 'utf8'));
      let hash = 0x811c9dc5;
      for (const byte of Buffer.from(value, 'utf8'))
        hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
      expect(probe.fingerprint(value)).toBe(hash.toString(16).padStart(8, '0'));
    }
    expect(probe.fingerprint('hello')).toBe('4f9f2cab');
  });
  for (const prefix of ['', 'AstMatrix M0 ']) {
    it(`creates exactly 16 KiB including storage prefix ${JSON.stringify(prefix)} and preserves parameters`, () => {
      const expected = probe.fixture(JSON.stringify(base), prefix, 16384);
      expect(Buffer.byteLength(expected, 'utf8')).toBe(16384);
      expect(expected.length).toBeLessThan(16384); // Includes a multibyte/surrogate-pair marker.
      const parsed = JSON.parse(expected.slice(prefix.length));
      const { m0StorageProbe, ...metadata } = parsed;
      expect(metadata).toEqual(base);
      expect(m0StorageProbe.unicode).toBe('元数据😀');
      expect(probe.compare(expected, expected)).toMatchObject({
        status: 'pass',
        exactMatch: true,
        actualBytes: 16384,
      });
    });
  }
  it('rejects same-length corruption and truncation instead of accepting matching lengths', () => {
    const expected = probe.fixture(JSON.stringify(base), '', 16384);
    const position = expected.indexOf('AAAA');
    const changed = expected.slice(0, position) + 'B' + expected.slice(position + 1);
    expect(changed.length).toBe(expected.length);
    expect(probe.compare(changed, expected)).toMatchObject({
      status: 'fail',
      exactMatch: false,
      actualBytes: 16384,
      firstDifferenceUtf16Index: position,
    });
    expect(probe.compare(changed, expected).actualFingerprint).not.toBe(
      probe.fingerprint(expected),
    );
    expect(probe.compare(expected.slice(0, -1), expected)).toMatchObject({
      status: 'fail',
      actualBytes: 16383,
    });
    expect(probe.compare(null, expected)).toMatchObject({ status: 'fail', actualBytes: null });
  });
  it('rejects impossible fixture sizes and permits an empty base object', () => {
    for (const size of [0, -1, 1.5, NaN, Infinity, 1048577, 20])
      expect(() => probe.fixture(JSON.stringify(base), '', size)).toThrow(/size|exceeds/i);
    const expected = probe.fixture('{}', '', 1024);
    expect(Buffer.byteLength(expected)).toBe(1024);
    expect(JSON.parse(expected).m0StorageProbe.id).toBe('m0-storage-16k-v1');
  });
  it('locks the PS document/object during modal writing and verifies exact contents on read', async () => {
    const moduleContext = vm.createContext({ module: { exports: {} } });
    vm.runInContext(
      readFileSync('tests/compatibility/spikes/metadata/photoshop.cjs', 'utf8'),
      moduleContext,
    );
    const expected = probe.fixture(JSON.stringify(base), 'AstMatrix M0 ', 16384);
    const original = 'AstMatrix M0 ' + JSON.stringify(base);
    const layer = { id: 42, name: original };
    const doc = { id: 7, activeLayers: [layer] };
    const ps = {
      app: { documents: [doc], activeDocument: doc, version: '27.8.0' },
      core: {
        executeAsModal: vi.fn<(callback: () => Promise<void>) => Promise<void>>(
          async (callback) => {
            await callback();
          },
        ),
      },
    };
    const create = moduleContext['module'].exports as (
      host: typeof ps,
      value: string,
      checker: Probe,
      originalValue: string,
    ) => {
      write(): Promise<Comparison>;
      read(): Comparison;
    };
    const native = create(ps, expected, probe, original);
    expect(await native.write()).toMatchObject({ status: 'pass', actualBytes: 16384 });
    expect(native.read().status).toBe('pass');
    layer.name = expected.slice(0, -1);
    expect(native.read().status).toBe('fail');
    await expect(native.write()).rejects.toThrow('unchanged default QR metadata fixture');
    ps.core.executeAsModal.mockImplementation(async (callback) => {
      ps.app.activeDocument = { id: 8, activeLayers: [layer] };
      await callback();
    });
    await expect(native.write()).rejects.toThrow('Document or selected object changed');
    expect(layer.name).toBe(expected.slice(0, -1));
  });
});
