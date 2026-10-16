import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { AstMatrixApplicationService } from '@astmatrix/application';
import {
  CepTransport,
  IllustratorCepAdapter,
  selectCepProfile,
} from '@astmatrix/host-adapter-illustrator-cep';
import type { CSInterfaceLike } from '@astmatrix/host-adapter-illustrator-cep';
import type { HostEnvelope } from '@astmatrix/host-contract';
import { profiles } from '@astmatrix/profiles';
const sources = ['json.jsx', 'renderer.jsx', 'astmatrix.jsx']
  .map((f) => readFileSync('apps/illustrator-cep/jsx/' + f, 'utf8'))
  .join('\n');
function environment() {
  const app = { documents: [] as unknown[], activeDocument: null as unknown };
  const context = vm.createContext({ $: {}, app });
  vm.runInContext(sources, context);
  const scripts: string[] = [];
  const cs: CSInterfaceLike = {
    getHostEnvironment: () => ({ appId: 'ILST', appVersion: '30.6.0' }),
    getCurrentApiVersion: () => ({ major: 12, minor: 1, micro: 0 }),
    evalScript: (script, callback) => {
      scripts.push(script);
      callback(String(vm.runInContext(script, context)));
    },
  };
  return { context, cs, scripts, app };
}
const service = new AstMatrixApplicationService();
describe('M3 strict CEP transport and ES3 dispatcher (no real Illustrator evidence)', () => {
  it('reads status in one validated host call without allocating a transfer session', async () => {
    const { cs, scripts } = environment();
    const adapter = new IllustratorCepAdapter(cs);
    await adapter.refresh();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(/^\$\._astmatrix\.dispatch\(/);
    expect(adapter.getSnapshot().capabilities.documentOpen).toBe(false);
    await adapter.refresh();
    expect(scripts).toHaveLength(2);
    adapter.dispose();
  });
  it('chooses profiles from host minor and actual CEP, rejects unknown/mismatched hosts', () => {
    for (const [version, cep, profile] of [
      ['27.0.0', 11, 'cep11'],
      ['27.0.0', '11', 'cep11'],
      ['28.5.0', 11, 'cep11'],
      ['29.5.0', 11, 'cep11'],
      ['29.5.1', 12, 'cep12'],
      ['30.6.0', 12, 'cep12'],
      ['30.6.0', '12', 'cep12'],
    ] as const)
      expect(selectCepProfile({ appId: 'ILST', appVersion: version }, { major: cep })).toBe(
        profile,
      );
    for (const [appId, version, cep] of [
      ['ILST', '31.0', 12],
      ['ILST', '27.0', 12],
      ['PHXS', '30.0', 12],
      ['ILST', '30.0', 13],
      ['ILST', '27.0', '12'],
      ['ILST', '30.0', '11'],
      ['ILST', '30.0', '12junk'],
      ['ILST', '30.0', '12.0'],
      ['ILST', '30.0', ''],
    ] as const)
      expect(() => selectCepProfile({ appId, appVersion: version }, { major: cep })).toThrow(Error);
  });
  it('accepts the captured native CEP string components when creating the production transport', async () => {
    const { cs } = environment();
    const report = JSON.parse(
      readFileSync('docs/plan/evidence/M0/2026-10-14-hotfix-02/user-report.json', 'utf8'),
    ) as { illustrator: { host: string; cep: { major: string; minor: string; micro: string } } };
    cs.getHostEnvironment = () => ({ appId: 'ILST', appVersion: report.illustrator.host });
    cs.getCurrentApiVersion = () => report.illustrator.cep;
    const adapter = new IllustratorCepAdapter(cs);
    await adapter.refresh();
    expect(adapter.getSnapshot().documentId).toBeNull();
    adapter.dispose();
  });
  it('uses strict JSON without eval; accepts Unicode/quotes and rejects malformed input', () => {
    const { context } = environment();
    for (const value of [{ text: '中文😀\n\t"\'\\\u2028', array: [1, false, null] }, [1, 2]]) {
      context.input = JSON.stringify(value);
      expect(
        JSON.parse(
          String(
            vm.runInContext('$._astmatrix.json.stringify($._astmatrix.json.parse(input))', context),
          ),
        ),
      ).toEqual(value);
    }
    for (const input of [
      '{"x":1,}',
      '{"x":1,"x":2}',
      '[1,]',
      'NaN',
      '1e999',
      '{"__proto__":{}}',
      '{"x":(function(){})()}',
      '"\n"',
    ]) {
      context.input = input;
      expect(() => vm.runInContext('$._astmatrix.json.parse(input)', context)).toThrow(
        /Invalid JSON/,
      );
    }
  });
  it('chunks all five production Scenes, never embeds executable user content and clears transfers', async () => {
    for (const profile of profiles.filter((p) => p.id !== 'qr-mobile')) {
      const { cs, context, scripts } = environment(),
        transport = new CepTransport(cs);
      const scene = (
        await service.generate({
          symbologyId: profile.symbologyId,
          profileId: profile.id,
          fields: profile.defaults,
        })
      ).scene;
      const request: HostEnvelope = {
        requestId: 'test-' + profile.symbologyId,
        payloadVersion: 1,
        operation: 'insert',
        payload: { scene, documentId: 'missing', documentRevision: 0, placement: 'center' },
      };
      const response = (await transport.request(request)) as { error: { code: string } };
      expect(response.error.code).toBe('NO_DOCUMENT');
      expect(scripts.filter((s) => s.includes('.append(')).length).toBeGreaterThan(0);
      expect(
        scripts
          .filter((s) => s.includes('.append('))
          .every((s) => /^\$\._astmatrix\.append\('[a-z0-9-]+',\d+,'[a-z0-9%_.~-]+'\)$/i.test(s)),
      ).toBe(true);
      expect(vm.runInContext("$._astmatrix.begin('new-test',1)", context)).toBe('OK');
      transport.dispose();
    }
  });
  it('cleans partial chunk transfers and refuses replay/incomplete messages', async () => {
    const { cs, context } = environment(),
      transport = new CepTransport(cs);
    let calls = 0;
    await expect(
      transport.request(
        { requestId: 'cancel-test', payloadVersion: 1, operation: 'capabilities', payload: {} },
        () => ++calls < 1,
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(vm.runInContext("$._astmatrix.begin('incomplete',2)", context)).toBe('OK');
    expect(vm.runInContext("$._astmatrix.append('incomplete',1,'abc')", context)).toBe(
      'INVALID_INPUT',
    );
    expect(
      JSON.parse(String(vm.runInContext("$._astmatrix.finish('incomplete')", context))),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(vm.runInContext("$._astmatrix.begin('after',1)", context)).toBe('OK');
    transport.dispose();
  });
  it('publishes real document absence and rejects unsupported capabilities instead of simulating insert', async () => {
    const { cs } = environment(),
      adapter = new IllustratorCepAdapter(cs);
    await adapter.refresh();
    expect(adapter.getSnapshot().documentId).toBeNull();
    expect(adapter.getSnapshot().capabilities.canInsertNativeVector).toBe(false);
    adapter.dispose();
    await expect(adapter.refresh()).rejects.toMatchObject({ code: 'CANCELLED' });
  });
  it('rejects malformed/extra operations before reaching Illustrator APIs', () => {
    const { context } = environment();
    for (const request of [
      { requestId: 'bad', payloadVersion: 2, operation: 'insert', payload: {} },
      {
        requestId: 'bad',
        payloadVersion: 1,
        operation: 'eval',
        payload: { code: 'app.documents.add()' },
      },
      { requestId: 'bad', payloadVersion: 1, operation: 'capabilities', payload: { scene: 1 } },
    ]) {
      context.input = JSON.stringify(request);
      expect(
        JSON.parse(
          String(vm.runInContext('$._astmatrix.dispatch($._astmatrix.json.parse(input))', context)),
        ),
      ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    }
  });
});
