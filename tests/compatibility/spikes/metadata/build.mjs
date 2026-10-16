/* oxlint-disable no-await-in-loop -- Preserve ordered probe artifacts and isolated write/read mock runs. */
/* Native metadata probes only; building these files does not execute them in a host. */
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'acorn';
const require = createRequire(import.meta.url);
const probe = require('./probe.cjs');
const sha = (text) => createHash('sha256').update(text).digest('hex');
// All generated native source uses ASCII escapes, including surrogate pairs and line separators.
const literal = (text) =>
  JSON.stringify(text).replace(
    /[\u007f-\uffff]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
export async function prepareMetadataProbes(scene, output) {
  const source = await readFile('tests/compatibility/spikes/metadata/probe.cjs', 'utf8');
  parse(source, { ecmaVersion: 3, sourceType: 'script' });
  const boot = `function loadStorageProbe() {\nvar module = { exports: {} };\n${source}\nreturn module.exports;\n}\nvar probe = loadStorageProbe();\n`;
  const base = JSON.stringify(scene.metadata);
  const bare = probe.fixture(base, '', 16 * 1024);
  const named = probe.fixture(base, 'AstMatrix M0 ', 16 * 1024);
  const root = `${output}/metadata`;
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const files = [];
  const put = async (name, code, syntax) => {
    if (syntax) parse(code, { ecmaVersion: syntax, sourceType: 'script' });
    const file = `${root}/${name}`;
    await writeFile(file, code);
    files.push({ file, sha256: sha(code) });
  };
  for (const [name, prefix, expected] of [
    ['illustrator', '', bare],
    ['named', 'AstMatrix M0 ', named],
  ]) {
    assert.equal(Buffer.byteLength(expected, 'utf8'), 16384);
    const metadata = JSON.parse(expected.slice(prefix.length));
    assert.equal(metadata.sourceValue, scene.metadata.sourceValue);
    assert.equal(metadata.m0StorageProbe.unicode, '元数据😀');
    await put(`${name}-expected.txt`, expected);
  }
  for (const action of ['write', 'read']) {
    const ai =
      boot +
      `var expected = ${literal(bare)};\nvar original = ${literal(base)};\n` +
      'if (!app.documents.length || app.activeDocument.selection.length !== 1) throw new Error("Select one M0 group");\n' +
      'var item = app.activeDocument.selection[0];\nif (item.name !== "AstMatrix M0") throw new Error("Select M0 group");\n' +
      (action === 'write'
        ? 'if (item.note !== original && item.note !== expected) throw new Error("Select the unchanged default QR metadata fixture");\nitem.note = expected;\n'
        : '') +
      `var result = probe.compare(item.note, expected);\n` +
      `var report = "M0-07 m0-storage-16k-v1 stage=${action} host=" + app.version + " OS=" + $.os + "\\n" + probe.summary(result);\n` +
      '$.writeln(report);\n' +
      'var outputFile = File.saveDialog("Save M0 metadata result", "Text:*.txt");\n' +
      'if (outputFile) { outputFile.encoding = "UTF-8"; if (!outputFile.open("w")) throw new Error("Cannot save report"); outputFile.write(report); outputFile.close(); }\n' +
      'alert(probe.summary(result));\n';
    await put(`illustrator-${action}.jsx`, ai, 3);
    const af =
      boot +
      `var expected = ${literal(named)};\nvar original = ${literal('AstMatrix M0 ' + base)};\n` +
      'const { Document } = require("/document.js");\n' +
      'const { Application } = require("/application.js");\n' +
      'if (!Document.current) throw new Error("Open disposable document");\n' +
      'const selected = Document.current.selection.nodes.toArray();\n' +
      'if (selected.length !== 1 || !selected[0].userDescription.startsWith("AstMatrix M0 ")) throw new Error("Select one M0 group");\n' +
      (action === 'write'
        ? 'if (selected[0].userDescription !== original && selected[0].userDescription !== expected) throw new Error("Select the unchanged default QR metadata fixture");\nselected[0].userDescription = expected;\n'
        : '') +
      `console.log(JSON.stringify({ task: "M0-07", probeId: "m0-storage-16k-v1", stage: "${action}", host: Application.version, ...probe.compare(selected[0].userDescription, expected), scope: "Selected field equality now; save/reopen/move are separate manual runs" }));\n`;
    await put(`affinity-${action}-editor.js`, af, 2020);
  }
  const photoshop = `${output}/photoshop-metadata`;
  await rm(photoshop, { recursive: true, force: true });
  await cp(`${output}/photoshop`, photoshop, { recursive: true });
  await cp('tests/compatibility/spikes/metadata/probe.cjs', `${photoshop}/metadata-probe.js`);
  await cp('tests/compatibility/spikes/metadata/photoshop.cjs', `${photoshop}/metadata-native.js`);
  await writeFile(`${photoshop}/metadata-expected.js`, `module.exports = ${literal(named)};\n`);
  await writeFile(
    `${photoshop}/metadata-original.js`,
    `module.exports = ${literal('AstMatrix M0 ' + base)};\n`,
  );
  let index = await readFile(`${photoshop}/index.js`, 'utf8');
  const readStart = index.indexOf("document.getElementById('read').addEventListener");
  const readEnd = index.indexOf("document.getElementById('dialog').addEventListener", readStart);
  assert(readStart >= 0 && readEnd > readStart);
  index =
    index.slice(0, readStart) +
    "document.getElementById('read').addEventListener('click', () => run(() => append(storageProbe.read())));\n" +
    index.slice(readEnd);
  const stressStart = index.indexOf("document.getElementById('stress').addEventListener");
  const stressEnd = index.indexOf('async function showLog()', stressStart);
  assert(stressStart >= 0 && stressEnd > stressStart);
  index =
    index.slice(0, stressStart) +
    "document.getElementById('stress').addEventListener('click', () => run(async () => append(await storageProbe.write())));\n" +
    index.slice(stressEnd);
  index =
    index.replace("revision: 'hotfix-03'", "revision: 'metadata-01'") +
    '\nconst storageProbe = require("./metadata-native.js")(ps, require("./metadata-expected.js"), require("./metadata-probe.js"), require("./metadata-original.js"));\n';
  parse(index, { ecmaVersion: 2020, sourceType: 'script' });
  await writeFile(`${photoshop}/index.js`, index);
  const html = (await readFile(`${photoshop}/index.html`, 'utf8'))
    .replace('hotfix-03', 'metadata-01')
    .replace('写入约 16 KiB 参数', '写入精确 16 KiB 参数')
    .replace('读取所选层参数', '精确比较所选层参数');
  await writeFile(`${photoshop}/index.html`, html);
  const manifest = JSON.parse(await readFile(`${photoshop}/manifest.json`, 'utf8'));
  manifest.id = 'com.astmatrix.m0.photoshop.metadata';
  manifest.name = 'AstMatrix M0 Metadata';
  manifest.entrypoints[0].label.default = manifest.name;
  await writeFile(`${photoshop}/manifest.json`, JSON.stringify(manifest, null, 2));
  for (const name of [
    'index.js',
    'index.html',
    'manifest.json',
    'metadata-probe.js',
    'metadata-native.js',
    'metadata-expected.js',
    'metadata-original.js',
  ]) {
    const file = `${photoshop}/${name}`;
    files.push({ file, sha256: sha(await readFile(file)) });
  }
  const fixtures = [
    { host: 'Illustrator note', prefix: '', expected: bare },
    {
      host: 'Photoshop layer/group name; Affinity userDescription',
      prefix: 'AstMatrix M0 ',
      expected: named,
    },
  ].map(({ host, prefix, expected }) => ({
    host,
    prefixBytes: Buffer.byteLength(prefix),
    storageBytes: Buffer.byteLength(expected),
    jsonPayloadBytes: Buffer.byteLength(expected.slice(prefix.length)),
    chars: expected.length,
    fingerprint: probe.fingerprint(expected),
    sha256: sha(expected),
  }));
  const report = {
    task: 'M0-07',
    date: new Date().toISOString(),
    status: 'pass',
    scope:
      'Exact storage fixtures, generated native source and mock contracts only; no host capacity or persistence claim',
    fixtures,
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
