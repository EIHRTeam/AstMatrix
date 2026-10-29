#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  archiveName,
  installerName,
  releaseVersion,
  sourceCommit,
  verifyInventory,
} from './artifacts.mjs';

export async function assembleRelease(
  payloadDirectory,
  installerDirectory,
  output,
  version,
  commit,
) {
  const payload = JSON.parse(
    await readFile(path.join(payloadDirectory, 'payload-info.json'), 'utf8'),
  );
  const installers = JSON.parse(
    await readFile(path.join(installerDirectory, 'installer-info.json'), 'utf8'),
  );
  const archives = ['Illustrator', 'Photoshop', 'Figma'].map((host) => archiveName(host, version));
  const exes = ['Illustrator', 'Photoshop'].map((host) => installerName(host, version));
  assert.deepEqual(payload.artifacts.map((entry) => entry.name).sort(), [...archives].sort());
  assert.deepEqual(installers.artifacts.map((entry) => entry.name).sort(), [...exes].sort());
  assert.deepEqual(
    installers.payloadArtifacts,
    payload.artifacts,
    'Installers used different payloads',
  );
  await verifyInventory(payloadDirectory, payload, version, commit);
  await verifyInventory(installerDirectory, installers, version, commit);
  await mkdir(output, { recursive: true });
  for (const name of archives)
    await copyFile(path.join(payloadDirectory, name), path.join(output, name));
  for (const name of exes)
    await copyFile(path.join(installerDirectory, name), path.join(output, name));
  assert.deepEqual(
    (await readdir(output)).sort(),
    [...archives, ...exes].sort(),
    'Unexpected release assets',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await assembleRelease(
    'tmp/release-payload',
    'tmp/release-installers',
    'release',
    await releaseVersion(),
    sourceCommit(),
  );
}
