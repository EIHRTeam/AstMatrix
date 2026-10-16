import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { execFileSync } from 'node:child_process';
import { encodeNormalized, ENGINE_VERSION } from '../../packages/barcode-core/src/index.ts';
import { normalizeRequest } from '../../packages/profiles/src/index.ts';
import { renderSvg } from '../../packages/renderers-svg/src/index.ts';
import { originalCatalog, symbologies } from '../../packages/symbology-catalog/src/index.ts';
import { basicSamples, sampleSource } from '../../tests/fixtures/m1.ts';
const destination = process.env.ASTMATRIX_EVIDENCE_DIR ?? 'tmp/m1-evidence';
mkdirSync(destination, { recursive: true });
mkdirSync('tmp/m1-benchmark/samples', { recursive: true });
globalThis.fetch = () => {
  throw new Error('M1 benchmark forbids network fetch');
};
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const samples = [
  ...basicSamples,
  { ...basicSamples[3]!, fields: { text: 'a'.repeat(1000) } },
  ...['qrcode', 'datamatrix'].map((symbologyId) => ({
    symbologyId,
    profileId: symbologyId === 'qrcode' ? 'qr-default' : 'dm-default',
    fields: { text: '中文 / café / 😀 / ^ECI000003' },
  })),
];
const records = samples.map((input, index) => {
  const measured: { validate: number; encode: number; ir: number; svg: number; total: number }[] =
    [];
  for (let n = 0; n < 35; n++) {
    const totalStart = performance.now(),
      validateStart = performance.now();
    const normalized = normalizeRequest(input),
      validate = performance.now() - validateStart;
    const stages = { encode: 0, ir: 0 };
    const scene = encodeNormalized(normalized, {
      now: () => performance.now(),
      record: (stage, ms) => {
        stages[stage] = ms;
      },
    });
    const svgStart = performance.now(),
      svg = renderSvg(scene),
      svgMs = performance.now() - svgStart;
    if (n >= 5)
      measured.push({ validate, ...stages, svg: svgMs, total: performance.now() - totalStart });
    if (n === 34) {
      writeFileSync('tmp/m1-benchmark/samples/' + index + '.svg', svg);
      writeFileSync('tmp/m1-benchmark/samples/' + index + '.json', JSON.stringify(scene));
    }
  }
  const summary = Object.fromEntries(
    ['validate', 'encode', 'ir', 'svg', 'total'].map((stage) => {
      const values = measured.map((m) => m[stage as keyof typeof m]).sort((a, b) => a - b);
      return [stage, { medianMs: values[14], p95Ms: values[28], maxMs: values[29] }];
    }),
  );
  const scene = encodeNormalized(normalizeRequest(input)),
    svg = renderSvg(scene);
  return {
    index,
    symbologyId: input.symbologyId,
    profileId: input.profileId,
    text: input.fields.text,
    length: String(input.fields.text).length,
    summary,
    dimensions: { widthMm: scene.widthMm, heightMm: scene.heightMm },
    nodes: scene.nodes.length,
    svgBytes: Buffer.byteLength(svg),
    svgSha256: sha(svg),
    sceneSha256: sha(JSON.stringify(scene)),
    deterministic:
      JSON.stringify(scene) === JSON.stringify(encodeNormalized(normalizeRequest(input))),
  };
});
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist') return [];
    const path = directory + '/' + name;
    return statSync(path).isDirectory()
      ? sources(path)
      : path.endsWith('.ts') || path.endsWith('.tsx')
        ? [path]
        : [];
  });
}
const sourceHashes = Object.fromEntries(
  sources('packages')
    .filter((p) => !p.includes('/node_modules/') && !p.endsWith('.test.ts'))
    .map((p) => [p, sha(readFileSync(p))]),
);
writeFileSync(
  destination + '/benchmark.json',
  JSON.stringify(
    {
      task: 'M1-08',
      date: new Date().toISOString(),
      executor: 'Codex',
      sampleSource,
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      lockSha256: sha(readFileSync('pnpm-lock.yaml')),
      sourceHashes,
      engineVersion: ENGINE_VERSION,
      runtime: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      warmup: 5,
      repetitions: 30,
      network: 'fetch forbidden; pure local generic provider; repeated deterministic output',
      stages: {
        validate: 'shared schema and business normalization',
        encode: 'BWIPP plus raw custom drawing callbacks, before physical layout',
        ir: 'physical layout, HRI transforms, rectangle grouping and Scene validation',
        svg: 'Scene validation and SVG serialization',
      },
      scope: 'Node shared pipeline only; no industry certification or host timing',
      records,
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  destination + '/catalog.json',
  JSON.stringify(
    {
      sourceCount: originalCatalog.length,
      registryCount: symbologies.length,
      source: originalCatalog,
      registry: symbologies,
    },
    null,
    2,
  ) + '\n',
);
console.log('M1 benchmark: ' + records.length + ' samples, 5 warmup / 30 measurements each.');
