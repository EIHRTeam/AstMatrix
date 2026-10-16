/* oxlint-disable no-await-in-loop -- Ordered native artifacts preserve the report's deterministic entry order. */
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import assert from 'node:assert/strict';
const sha = (text) => createHash('sha256').update(text).digest('hex');
export async function prepareHriHostProbes(output) {
  const sceneJson = await readFile(`${output}/samples/ean13-hri.json`, 'utf8');
  const scene = JSON.parse(sceneJson);
  assert.equal(scene.metadata.profileId, 'm0-hri-spike');
  const root = `${output}/hri-hosts`;
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const files = [];
  const put = async (file, text, version) => {
    if (version) parse(text, { ecmaVersion: version, sourceType: 'script' });
    await writeFile(file, text);
    files.push({ file, sha256: sha(text) });
  };
  const jsx = await readFile('tests/compatibility/spikes/illustrator/host.jsx', 'utf8');
  await put(
    `${root}/illustrator-hri.jsx`,
    jsx +
      `\nvar scene = ${JSON.stringify(scene)};\nvar metadata = ${JSON.stringify(JSON.stringify(scene.metadata))};\n` +
      'var result = $._astmatrixM0.insert(scene, metadata, -1);\n$.writeln(result);\nalert(result);\n',
    3,
  );
  const helper = await readFile('tests/compatibility/spikes/hri/contours.cjs', 'utf8');
  let affinity = await readFile('tests/compatibility/spikes/hri/affinity.cjs', 'utf8');
  affinity = affinity
    .replace("require('./hri-contours.js')", 'loadHriContours()')
    .replace("require('./hri-scene.js')", JSON.stringify(scene));
  const embedded =
    `function loadHriContours() {\nconst module = {exports:{}};\n${helper}\nreturn module.exports;\n}\n` +
    affinity;
  await put(`${root}/affinity-hri-editor.js`, embedded, 2020);
  const ps = `${output}/photoshop-hri`;
  await rm(ps, { recursive: true, force: true });
  await cp(`${output}/photoshop`, ps, { recursive: true });
  await put(`${ps}/scene.js`, `module.exports = ${JSON.stringify(scene)};\n`, 2020);
  await put(`${ps}/hri-contours.js`, helper, 2020);
  await put(
    `${ps}/hri-subpaths.js`,
    await readFile('tests/compatibility/spikes/hri/photoshop.cjs', 'utf8'),
    2020,
  );
  let index = await readFile(`${ps}/index.js`, 'utf8');
  const start = index.indexOf('function subpaths(dpi) {');
  const end = index.indexOf('function primitives(dpi)', start);
  assert(start >= 0 && end > start);
  index =
    index.slice(0, start) +
    "function subpaths(dpi) { return require('./hri-subpaths.js')(scene, dpi, point, pathInfo); }\n" +
    index.slice(end);
  index = index
    .replace("revision: 'hotfix-03'", "revision: 'hri-01'")
    .replace('() => insert(false)', '() => insert(false, true)')
    .replace('() => insert(true)', '() => insert(true, true)')
    .replaceAll(
      'sample: selectedSample',
      "sample: selectedSample === 'qrcode' ? 'ean13-hri' : selectedSample",
    )
    .replace('`样本：${value}`', '`样本：${value === "qrcode" ? "ean13-hri" : value}`');
  await put(`${ps}/index.js`, index, 2020);
  const html = (await readFile(`${ps}/index.html`, 'utf8'))
    .replace('hotfix-03', 'hri-01')
    .replace('QR 多子路径', 'EAN-13 + HRI 轮廓')
    .replace('插入 Shape Layer', '插入 HRI + 包络组');
  await put(`${ps}/index.html`, html);
  const manifest = JSON.parse(await readFile(`${ps}/manifest.json`, 'utf8'));
  manifest.id = 'com.astmatrix.m0.photoshop.hri';
  manifest.name = 'AstMatrix M0 HRI';
  manifest.entrypoints[0].label.default = manifest.name;
  await put(`${ps}/manifest.json`, JSON.stringify(manifest, null, 2));
  const report = {
    task: 'M0-07',
    date: new Date().toISOString(),
    status: 'pass',
    scope: 'HRI native probe construction only; actual host HRI rendering not-run',
    sourceSceneSha256: sha(sceneJson),
    widthMm: scene.widthMm,
    heightMm: scene.heightMm,
    nodes: scene.nodes.length,
    files,
    actualHost: 'not-run',
  };
  await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2));
  return {
    reportPath: `${root}/report.json`,
    reportSha256: sha(JSON.stringify(report, null, 2)),
    files,
  };
}
