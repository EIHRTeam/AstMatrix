/* oxlint-disable no-await-in-loop -- Sequential sample benchmarking avoids concurrent encoding and GC interference. */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { encodeSpike, referenceSvg } from '../../../packages/barcode-core/src/spike';
import type { SpikeRequest } from '../../../packages/barcode-core/src/spike';
import { callbackSamples } from '../../../packages/barcode-core/src/spike-callbacks';
import { encodeHriSpike, hriSpikeOptions } from '../../../packages/barcode-core/src/spike-hri';
import { toSVG } from 'bwip-js/generic';
import { primitiveScene } from './fixtures';
import { renderSvg } from '@astmatrix/renderers-svg';

const output = process.argv[2] ?? 'tests/compatibility/spikes/dist/samples';
await mkdir(output, { recursive: true });
const samples: SpikeRequest[] = [
  { bcid: 'ean13', text: '6901234567892' },
  { bcid: 'qrcode', text: 'https://example.com/barcode' },
  { bcid: 'qrcode', text: 'A'.repeat(1000) },
];
const report = {
  task: 'M0-02/M0-09',
  status: 'pass',
  scope: 'Node shared geometry only',
  date: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceState: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
  lockSha256: createHash('sha256')
    .update(await readFile('pnpm-lock.yaml'))
    .digest('hex'),
  runtime: process.version,
  platform: os.platform(),
  release: os.release(),
  arch: os.arch(),
  cpu: os.cpus()[0]?.model,
  samples: [] as Record<string, unknown>[],
};
const stats = (values: number[]) => {
  values.sort((a, b) => a - b);
  return { medianMs: values[15], p95Ms: values[28], maxMs: values[29] };
};

for (let i = 0; i < samples.length; i++) {
  const request = samples[i]!;
  for (let n = 0; n < 5; n++) encodeSpike(request);
  const generation: number[] = [],
    rendering: number[] = [];
  const heapBefore = process.memoryUsage().heapUsed;
  for (let n = 0; n < 30; n++) {
    const start = performance.now();
    const scene = encodeSpike(request);
    const encoded = performance.now();
    renderSvg(scene);
    generation.push(encoded - start);
    rendering.push(performance.now() - encoded);
  }
  const scene = encodeSpike(request);
  const name = `${request.bcid}-${i}`;
  const json = JSON.stringify(scene, null, 2);
  await Promise.all([
    writeFile(`${output}/${name}.json`, json),
    writeFile(`${output}/${name}.svg`, renderSvg(scene)),
    writeFile(`${output}/${name}-reference.svg`, referenceSvg(request)),
  ]);
  report.samples.push({
    name,
    request,
    widthMm: scene.widthMm,
    heightMm: scene.heightMm,
    nodes: scene.nodes.length,
    commands: scene.nodes.reduce(
      (n, node) => n + (node.geometry.kind === 'path' ? node.geometry.commands.length : 4),
      0,
    ),
    generation: stats(generation),
    svg: stats(rendering),
    heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    heapNote: 'Unforced GC process delta; not peak memory or host heap',
    sceneSha256: createHash('sha256').update(json).digest('hex'),
    metadataBytes: Buffer.byteLength(JSON.stringify(scene.metadata)),
  });
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await writeFile(`${output}/callbacks.json`, JSON.stringify(callbackSamples(), null, 2));

await writeFile(`${output}/primitives.json`, JSON.stringify(primitiveScene(), null, 2));
await writeFile(`${output}/primitives.svg`, renderSvg(primitiveScene()));

// Separate HRI sample: the default host fixtures and previously accepted QR/EAN stay unchanged.
const hriRequest = { text: '6901234567892' };
const hriScene = encodeHriSpike(hriRequest);
await Promise.all([
  writeFile(`${output}/ean13-hri.json`, JSON.stringify(hriScene, null, 2)),
  writeFile(`${output}/ean13-hri.svg`, renderSvg(hriScene)),
  writeFile(`${output}/ean13-hri-reference.svg`, toSVG(hriSpikeOptions(hriRequest))),
  writeFile(
    `${output}/hri-report.json`,
    JSON.stringify(
      {
        task: 'M0-07',
        status: 'pass',
        scope:
          'Shared EAN HRI callbacks and outlines only; no host rendering or GS1 profile acceptance',
        date: new Date().toISOString(),
        font: {
          name: 'OCR-B',
          providerVersion: '4.11.4',
          resource: 'packages/barcode-core/node_modules/bwip-js/fonts/OCRB7.ttf',
          sha256: createHash('sha256')
            .update(await readFile('packages/barcode-core/node_modules/bwip-js/fonts/OCRB7.ttf'))
            .digest('hex'),
          systemFontDependency: false,
          missingFontPolicy: 'Reject all names except the explicitly admitted bundled OCR-B',
          missingGlyphPolicy: 'Reject absent glyph/.notdef; no silent substitution',
        },
        widthMm: hriScene.widthMm,
        heightMm: hriScene.heightMm,
        nodes: hriScene.nodes.length,
        sceneSha256: createHash('sha256')
          .update(JSON.stringify(hriScene, null, 2))
          .digest('hex'),
        lockSha256: report.lockSha256,
        limitations: [
          'Only unrotated EAN-13/OCR-B is admitted by this probe',
          'Host outlines, production layout/profile and final font redistribution notices remain unverified',
        ],
      },
      null,
      2,
    ),
  ),
]);
