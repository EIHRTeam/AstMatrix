/* oxlint-disable no-await-in-loop -- Preserve ordered probe artifacts and isolated write/read mock runs. */
/* Validate generated native entry points against mocks; never count this as host evidence. */
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const probe = require('./probe.cjs');
const psOperations = require('./photoshop.cjs');
export async function checkMetadataProbes(output, scene) {
  const metadata = `${output}/metadata`;
  for (const action of ['write', 'read']) {
    const expectedAi = await readFile(`${metadata}/illustrator-expected.txt`, 'utf8');
    const selected = {
      name: 'AstMatrix M0',
      note: action === 'write' ? JSON.stringify(scene.metadata) : expectedAi,
    };
    const messages = [];
    const ai = vm.createContext({
      app: { documents: [{}], activeDocument: { selection: [selected] }, version: 'mock-30.6' },
      $: { os: 'mock', writeln: (message) => messages.push(message) },
      File: { saveDialog: () => null },
      alert: () => {},
      JSON: undefined,
    });
    vm.runInContext(await readFile(`${metadata}/illustrator-${action}.jsx`, 'utf8'), ai);
    assert.equal(selected.note, expectedAi);
    assert(
      messages[0].includes('status=pass; exactMatch=true; expectedBytes=16384; actualBytes=16384'),
    );
    if (action === 'read') {
      selected.note = selected.note.slice(0, -1);
      vm.runInContext(await readFile(`${metadata}/illustrator-read.jsx`, 'utf8'), ai);
      assert(messages[1].includes('status=fail; exactMatch=false'));
    }
    const expectedNamed = await readFile(`${metadata}/named-expected.txt`, 'utf8');
    const node = {
      userDescription:
        action === 'write' ? 'AstMatrix M0 ' + JSON.stringify(scene.metadata) : expectedNamed,
    };
    const afMessages = [];
    const afContext = () =>
      vm.createContext({
        require: (id) =>
          id === '/document.js'
            ? { Document: { current: { selection: { nodes: { toArray: () => [node] } } } } }
            : { Application: { version: 'mock-3.3.1' } },
        console: { log: (message) => afMessages.push(JSON.parse(message)) },
      });
    const afSource = await readFile(`${metadata}/affinity-${action}-editor.js`, 'utf8');
    vm.runInContext(afSource, afContext());
    assert.equal(node.userDescription, expectedNamed);
    assert.equal(afMessages[0].status, 'pass');
    if (action === 'read') {
      node.userDescription = node.userDescription.replace('AAAA', 'BAAA');
      vm.runInContext(afSource, afContext());
      assert.equal(afMessages[1].status, 'fail');
      assert.equal(afMessages[1].actualBytes, 16384);
    }
  }
  const dom = new JSDOM(await readFile(`${output}/photoshop-metadata/index.html`, 'utf8'));
  const original = 'AstMatrix M0 ' + JSON.stringify(scene.metadata);
  const layer = { id: 42, name: original };
  const doc = { id: 7, activeLayers: [layer] };
  const ps = {
    app: { version: 'mock-27.8', documents: [doc], activeDocument: doc },
    core: { executeAsModal: async (action) => action() },
  };
  const expected = await readFile(`${metadata}/named-expected.txt`, 'utf8');
  const context = vm.createContext({
    document: dom.window.document,
    navigator: { userAgent: 'mock' },
    require: (id) =>
      ({
        photoshop: ps,
        './scene.js': scene,
        './metadata-native.js': psOperations,
        './metadata-probe.js': probe,
        './metadata-expected.js': expected,
        './metadata-original.js': original,
      })[id],
  });
  vm.runInContext(await readFile(`${output}/photoshop-metadata/index.js`, 'utf8'), context);
  dom.window.document.getElementById('stress').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(layer.name, expected);
  dom.window.document.getElementById('read').click();
  await new Promise((resolve) => setImmediate(resolve));
  const records = vm.runInContext('records', context);
  assert(records.includes('"expectedBytes": 16384'));
  assert(records.includes('"stage": "write-immediate"'));
  assert(records.includes('"stage": "read"'));
  dom.window.close();
  return {
    scope: 'Generated native sources against mocks only',
    illustrator: 'pass',
    affinity: 'pass',
    photoshop: 'pass',
    actualHost: 'not-run',
  };
}
