#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  archiveName,
  installerName,
  installerArchitectures,
  releaseVersion,
  sourceCommit,
  verifyInventory,
  writeInventory,
  digest,
} from '../artifacts.mjs';
import { readZip } from './zip.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

export async function compilePayloadInstallers(
  iscc,
  host,
  version,
  payload,
  archive,
  output,
  execute = execFileSync,
) {
  const names = [];
  for (const architecture of installerArchitectures) {
    const name = installerName(host, version, architecture);
    execute(
      iscc,
      [
        `/DAppVersion=${version}`,
        `/DTargetArchitecture=${architecture}`,
        `/DPayloadDir=${payload}`,
        `/DArchivePath=${archive}`,
        `/O${output}`,
        `/F${name.slice(0, -4)}`,
        path.join(here, `${host.toLowerCase()}.iss`),
      ],
      { stdio: 'inherit' },
    );
    const executable = await readFile(path.join(output, name));
    assert(
      executable.length > 1024 && executable.toString('ascii', 0, 2) === 'MZ',
      `Invalid installer executable: ${name}`,
    );
    names.push(name);
  }
  return names;
}

export function checkCompilerVersion(iscc, execute = execFileSync) {
  // Inno 7.1's --version loads the compiler engine and prints its exact version.
  // Do not rely on the ISCC.exe PE resource or the major-version help banner.
  const version = execute(iscc, ['--version'], {
    encoding: 'utf8',
  }).trim();
  assert.match(
    version,
    /^\d+\.\d+\.\d+$/,
    `ISCC did not report its compiler engine version:\n${version}`,
  );
  assert.equal(version, '7.1.1', 'Expected Inno Setup compiler engine 7.1.1');
  return version;
}

export function validatePayload(host, files, version) {
  assert(!files.has('payload-files.json'), 'Reserved installer payload inventory name');
  const required = [
    'LICENSE',
    'PRIVACY.md',
    'README.md',
    'licenses/BWIP-JS-MIT.txt',
    'licenses/OCR-A-NOTICE.txt',
    'licenses/OCR-B-NOTICE.txt',
    `Installation_Guide_${host}.txt`,
    'host-build-info.json',
  ];
  if (host === 'Illustrator') {
    required.push(
      'CSXS/manifest.xml',
      'bootstrap/index.html',
      'jsx/astmatrix.jsx',
      'vendor/CSInterface.js',
      'web/cep11/index.html',
      'web/cep12/index.html',
    );
    const xml = files.get('CSXS/manifest.xml')?.toString();
    assert(xml?.includes(`ExtensionBundleVersion="${version}"`), 'CEP payload version mismatch');
    assert(xml.includes('Version="[27.0,30.9]"'), 'CEP host range changed');
  } else {
    required.push(
      'manifest.json',
      'index.html',
      'index.js',
      'index.css',
      'icons/list@1x.png',
      'icons/list@2x.png',
      'icons/panel@1x.png',
      'icons/panel@2x.png',
      'webview/index.html',
    );
    const manifest = JSON.parse(files.get('manifest.json')?.toString() ?? '{}');
    assert.equal(manifest.version, version, 'UXP payload version mismatch');
    assert.equal(manifest.id, '1f4db629');
    assert.equal(manifest.host?.app, 'PS');
    assert.equal(manifest.host?.minVersion, '26.0.0');
    assert.equal(manifest.requiredPermissions?.webview?.enableMessageBridge, 'localOnly');
  }
  for (const name of required) assert(files.get(name)?.length, `Missing ${host} resource: ${name}`);
  const info = JSON.parse(files.get('host-build-info.json').toString());
  assert.equal(info.target, host === 'Illustrator' ? 'illustrator-cep' : 'photoshop-uxp-webview');
  const expected = new Set(['host-build-info.json']);
  for (const artifact of info.artifacts) {
    assert(!expected.has(artifact.path), 'Duplicate payload inventory entry');
    expected.add(artifact.path);
    assert(files.has(artifact.path), `Missing inventoried resource: ${artifact.path}`);
    assert.equal(
      digest(files.get(artifact.path)),
      artifact.sha256,
      `Payload hash mismatch: ${artifact.path}`,
    );
  }
  assert.deepEqual(
    [...files.keys()].sort(),
    [...expected].sort(),
    'Uninventoried payload resource',
  );
}

async function main() {
  assert.equal(process.platform, 'win32', 'ISCC compilation requires Windows');
  const options = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const match = arg.match(/^--(input-dir|output-dir)=(.+)$/);
      assert(match, `Unknown option: ${arg}`);
      return [match[1], path.resolve(match[2])];
    }),
  );
  const input = options['input-dir'] ?? path.resolve('release');
  const output = options['output-dir'] ?? path.resolve('tmp/inno-output');
  const version = await releaseVersion();
  const inventory = JSON.parse(await readFile(path.join(input, 'payload-info.json'), 'utf8'));
  await verifyInventory(input, inventory, version, sourceCommit());
  for (const host of ['Illustrator', 'Photoshop'])
    assert(
      inventory.artifacts.some((entry) => entry.name === archiveName(host, version)),
      `Missing ${host} archive inventory`,
    );
  const iscc = process.env.ASTMATRIX_ISCC;
  assert(iscc, 'ASTMATRIX_ISCC must point to the pinned Inno Setup compiler');
  const compilerVersion = checkCompilerVersion(iscc);
  console.log(`Verified Inno Setup compiler engine ${compilerVersion}`);
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(path.join(output, '.stage-'));
  const names = [];
  try {
    for (const host of ['Illustrator', 'Photoshop']) {
      const archive = path.join(input, archiveName(host, version));
      const files = readZip(await readFile(archive));
      validatePayload(host, files, version);
      const payload = path.join(stage, host);
      for (const [name, bytes] of files) {
        const destination = path.join(payload, name);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
      }
      await writeFile(
        path.join(payload, 'payload-files.json'),
        JSON.stringify(
          [...files].map(([name, bytes]) => ({ path: name, sha256: digest(bytes) })),
          null,
          2,
        ),
      );
      names.push(
        ...(await compilePayloadInstallers(iscc, host, version, payload, archive, output)),
      );
    }
    const info = await writeInventory(output, 'installer-info.json', names, {
      compilerVersion,
      architectures: installerArchitectures,
      payloadArtifacts: inventory.artifacts,
    });
    await writeFile(
      path.join(output, 'SHA256SUMS.txt'),
      info.artifacts.map((entry) => `${entry.sha256}  ${entry.name}`).join('\n') + '\n',
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
