/* oxlint-disable no-await-in-loop -- Sequential sample decoding keeps native scanner state and evidence ordering deterministic. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { decoderTooling, rasterizeSvg, decodeImage, requireDecodedText } from './m0-decoders.ts';
const inputs = 'tests/compatibility/spikes/dist/samples';
const output = process.argv[2] ?? 'tests/compatibility/spikes/dist/decode';
await mkdir(output, { recursive: true });
const records = [];
// WASM modules were configured with local resources; every attempted fetch is an error.
globalThis.fetch = () => {
  throw new Error('Decoder run must be offline');
};
for (const name of ['ean13-0', 'qrcode-1', 'qrcode-2', 'ean13-hri']) {
  const svg = await readFile(`${inputs}/${name}.svg`, 'utf8');
  const scene = JSON.parse(await readFile(`${inputs}/${name}.json`, 'utf8'));
  for (const dpi of [150, 300, 600]) {
    const { image, png, pngSha256, svgSha256 } = rasterizeSvg(svg, dpi);
    const decoded = await decodeImage(image);
    const required = dpi >= 300;
    const bothMatch = Object.values(decoded).every(
      (symbols) => symbols.length === 1 && symbols[0].text === scene.metadata.sourceValue,
    );
    if (required)
      requireDecodedText(decoded, scene.metadata.sourceValue, scene.metadata.symbologyId);
    const pngFile = `${name}-${dpi}dpi.png`;
    await writeFile(`${output}/${pngFile}`, png);
    records.push({
      name,
      dpi,
      pngFile,
      pngSha256,
      svgSha256,
      pixels: { width: image.width, height: image.height },
      decoded,
      required,
      status: bothMatch ? 'pass' : 'partial',
    });
  }
}
await writeFile(
  `${output}/report.json`,
  JSON.stringify(
    {
      task: 'M0-02/M0-09',
      date: new Date().toISOString(),
      status: 'pass',
      scope:
        'Shared SVG two-decoder gate at 300/600 DPI, exploratory 150 DPI; not host export or full conformance',
      requiredDpis: [300, 600],
      exploratoryDpis: [150],
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      runtime: process.version,
      platform: process.platform,
      arch: process.arch,
      lockSha256: createHash('sha256')
        .update(await readFile('pnpm-lock.yaml'))
        .digest('hex'),
      tooling: decoderTooling,
      network: 'fetch forbidden; local WASM only',
      records,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Independent decode: ${records.filter((record) => record.required).length} required sample/DPI pairs passed in both decoders; ${records.filter((record) => record.status !== 'pass').length} exploratory limitations. ${output}/report.json`,
);
