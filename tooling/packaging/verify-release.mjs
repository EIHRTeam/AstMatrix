#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  archiveName,
  illustratorCertificateFingerprintName,
  illustratorZxpName,
  installerName,
  installerArchitectures,
  releaseVersion,
  sourceCommit,
  verifyInventory,
} from './artifacts.mjs';

export async function assembleRelease(
  payloadDirectory,
  installerDirectory,
  signedDirectory,
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
  const signed = JSON.parse(await readFile(path.join(signedDirectory, 'signed-info.json'), 'utf8'));
  const archives = ['Illustrator', 'Photoshop', 'Figma'].map((host) => archiveName(host, version));
  const zxp = illustratorZxpName(version);
  const fingerprint = illustratorCertificateFingerprintName(version);
  const exes = ['Illustrator', 'Photoshop'].flatMap((host) =>
    installerArchitectures.map((architecture) => installerName(host, version, architecture)),
  );
  assert.deepEqual(payload.artifacts.map((entry) => entry.name).sort(), [...archives].sort());
  assert.deepEqual(signed.artifacts.map((entry) => entry.name).sort(), [zxp, fingerprint].sort());
  assert.deepEqual(
    signed.sourceArtifact,
    payload.artifacts.find((entry) => entry.name === archiveName('Illustrator', version)),
    'Signed ZXP used a different Illustrator payload',
  );
  assert.deepEqual(
    installers.artifacts.map((entry) => entry.name).sort(),
    [...exes].sort(),
    'Installer architecture set mismatch',
  );
  assert.deepEqual(
    installers.payloadArtifacts,
    payload.artifacts,
    'Installers used different payloads',
  );
  await verifyInventory(payloadDirectory, payload, version, commit);
  await verifyInventory(installerDirectory, installers, version, commit);
  await verifyInventory(signedDirectory, signed, version, commit);
  assert.match(
    await readFile(path.join(signedDirectory, fingerprint), 'utf8'),
    /^SHA-256 \(X\.509 certificate\): (?:[0-9A-F]{2}:){31}[0-9A-F]{2}\r?\n$/,
    'Invalid Illustrator certificate fingerprint',
  );
  await mkdir(output, { recursive: true });
  const publishedArchives = ['Photoshop', 'Figma'].map((host) => archiveName(host, version));
  for (const name of publishedArchives)
    await copyFile(path.join(payloadDirectory, name), path.join(output, name));
  for (const name of exes)
    await copyFile(path.join(installerDirectory, name), path.join(output, name));
  await copyFile(path.join(signedDirectory, zxp), path.join(output, zxp));
  await copyFile(path.join(signedDirectory, fingerprint), path.join(output, fingerprint));
  assert.deepEqual(
    (await readdir(output)).sort(),
    [...publishedArchives, ...exes, zxp, fingerprint].sort(),
    'Unexpected release assets',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await assembleRelease(
    'tmp/release-payload',
    'tmp/release-installers',
    'tmp/release-signed',
    'release',
    await releaseVersion(),
    sourceCommit(),
  );
}
