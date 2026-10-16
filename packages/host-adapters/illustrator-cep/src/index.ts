/* oxlint-disable no-await-in-loop -- evalScript chunks are an ordered protocol. */
import { HostError, RemoteHostAdapter, validateEnvelope } from '@astmatrix/host-contract';
import type { HostEnvelope, HostTransport } from '@astmatrix/host-contract';
import { stableStringify } from '@astmatrix/shared';
export interface CSInterfaceLike {
  evalScript: (script: string, callback: (result: string) => void) => void;
  getHostEnvironment: () => { appId: string; appVersion: string; appUILocale?: string };
  openURLInDefaultBrowser?: (url: string) => number;
  isWindowVisible?: () => boolean;
  addEventListener?: (type: string, listener: (event: { data?: string }) => void) => void;
  removeEventListener?: (type: string, listener: (event: { data?: string }) => void) => void;
  getCurrentApiVersion: () => {
    major: number | string;
    minor: number | string;
    micro: number | string;
  };
}
export function selectCepProfile(
  host: { appId: string; appVersion: string },
  cep: { major: number | string },
): 'cep11' | 'cep12' {
  const parts = host.appVersion.split('.').map(Number),
    [major, minor = 0, patch = 0] = parts;
  // Match the bootstrap: only numbers or decimal integer strings may cross this boundary.
  const raw = cep.major;
  const cepMajor =
    typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw)) ? Number(raw) : NaN;
  if (host.appId !== 'ILST' || !major || major < 27 || major > 30 || ![11, 12].includes(cepMajor))
    throw new HostError(
      'UNSUPPORTED_HOST_VERSION',
      '仅支持 Illustrator 27–30 / CEP 11–12 开发范围',
    );
  const expected =
    major >= 30 || (major === 29 && (minor > 5 || (minor === 5 && patch >= 1))) ? 12 : 11;
  if (cepMajor !== expected)
    throw new HostError('UNSUPPORTED_HOST_VERSION', '宿主与 CEP 档位不匹配');
  return expected === 12 ? 'cep12' : 'cep11';
}
export class CepTransport implements HostTransport {
  private readonly cs: CSInterfaceLike;
  private closed = false;
  private activeId: string | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(cs: CSInterfaceLike) {
    this.cs = cs;
    selectCepProfile(cs.getHostEnvironment(), cs.getCurrentApiVersion());
  }
  private eval(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new HostError('CANCELLED', '面板已关闭'));
        return;
      }
      // Do not time out a mutation: a late host callback could represent a committed insert.
      this.cs.evalScript(script, (result) =>
        result === 'EvalScript error.'
          ? reject(new HostError('UNKNOWN_HOST_ERROR', 'ExtendScript 执行失败，请重新加载面板'))
          : resolve(result),
      );
    });
  }
  request(envelope: HostEnvelope, isCurrent = () => true): Promise<unknown> {
    validateEnvelope(envelope);
    const run = async () => {
      const encoded = encodeURIComponent(stableStringify(envelope)).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      if (encoded.length > 8 * 1024 * 1024)
        throw new HostError('INVALID_INPUT', 'Scene 超过 8 MiB 传输上限');
      const id = envelope.requestId;
      if (!/^[a-z0-9-]+$/i.test(id)) throw new HostError('INVALID_INPUT', '无效传输 ID');
      // Small read-only status requests need one host crossing, not a chunk-transfer session.
      // Keep mutations on the ordered begin/append/finish/abort protocol.
      if (envelope.operation === 'capabilities' && encoded.length <= 16384) {
        if (!isCurrent()) throw new HostError('CANCELLED', '输入已变化');
        return JSON.parse(
          await this.eval(
            `$._astmatrix.dispatch($._astmatrix.json.parse(decodeURIComponent('${encoded}')))`,
          ),
        ) as unknown;
      }
      const chunks = Math.ceil(encoded.length / 16384);
      let started = false;
      try {
        const begin = await this.eval(`$._astmatrix.begin('${id}',${chunks})`);
        if (begin !== 'OK') throw new HostError('HOST_BUSY', begin);
        started = true;
        this.activeId = id;
        for (let i = 0; i < chunks; i++) {
          if (!isCurrent()) throw new HostError('CANCELLED', '输入已变化，已取消传输');
          const ack = await this.eval(
            `$._astmatrix.append('${id}',${i},'${encoded.slice(i * 16384, (i + 1) * 16384)}')`,
          );
          if (ack !== 'OK') throw new HostError('INVALID_INPUT', ack);
        }
        if (!isCurrent()) throw new HostError('CANCELLED', '输入已变化');
        return JSON.parse(await this.eval(`$._astmatrix.finish('${id}')`)) as unknown;
      } finally {
        if (started && !this.closed) await this.eval(`$._astmatrix.abort('${id}')`);
        this.activeId = null;
      }
    };
    const result = this.chain.then(run);
    this.chain = result.catch(() => {});
    return result;
  }
  dispose(): void {
    if (this.activeId) this.cs.evalScript(`$._astmatrix.abort('${this.activeId}')`, () => {});
    this.closed = true;
  }
}
export class IllustratorCepAdapter extends RemoteHostAdapter {
  constructor(cs: CSInterfaceLike) {
    super('illustrator-cep', new CepTransport(cs));
  }
}
