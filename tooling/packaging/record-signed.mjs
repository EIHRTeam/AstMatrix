#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  archiveName,
  illustratorCertificateFingerprintName,
  illustratorZxpName,
  releaseVersion,
  sourceCommit,
  verifyInventory,
  writeInventory,
} from './artifacts.mjs';

const version = await releaseVersion();
const payloadDirectory = path.resolve('tmp/release-payload');
const signedDirectory = path.resolve('tmp/release-signed');
const payload = JSON.parse(
  await readFile(path.join(payloadDirectory, 'payload-info.json'), 'utf8'),
);
await verifyInventory(payloadDirectory, payload, version, sourceCommit());
const sourceArtifact = payload.artifacts.find(
  (entry) => entry.name === archiveName('Illustrator', version),
);
assert(sourceArtifact, 'Illustrator ZIP missing from release payload');
await writeInventory(
  signedDirectory,
  'signed-info.json',
  [illustratorZxpName(version), illustratorCertificateFingerprintName(version)],
  { sourceArtifact },
);
