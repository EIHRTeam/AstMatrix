import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repository = fileURLToPath(new URL('../..', import.meta.url));
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const archiveName = (host, version) =>
  `AstMatrix-${host}-${version}.${host === 'Photoshop' ? 'ccx' : 'zip'}`;
export const installerName = (host, version) => `AstMatrix-${host}-${version}-Setup.exe`;

export async function releaseVersion(root = repository) {
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  const cep = await readFile(path.join(root, 'apps/illustrator-cep/CSXS/manifest.xml'), 'utf8');
  const versions = [
    cep.match(/ExtensionBundleVersion="([^"]+)"/)?.[1],
    ...[...cep.matchAll(/<Extension\b[^>]*\bVersion="([^"]+)"/g)].map((match) => match[1]),
  ];
  assert(
    versions.length >= 2 && versions.every((value) => value === version),
    'CEP version mismatch',
  );
  for (const name of ['manifest.json', 'manifest-webview.json']) {
    const manifest = JSON.parse(
      await readFile(path.join(root, 'apps/photoshop-uxp', name), 'utf8'),
    );
    assert.equal(manifest.version, version, `Photoshop ${name} version mismatch`);
  }
  return version;
}

export function sourceCommit() {
  return (
    process.env.GITHUB_SHA ??
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim()
  );
}

export async function verifyInventory(directory, info, version, commit) {
  assert.equal(info.version, version, 'Artifact version mismatch');
  assert.equal(info.commit, commit, 'Artifact commit mismatch');
  for (const artifact of info.artifacts) {
    assert.equal(path.basename(artifact.name), artifact.name, 'Invalid artifact name');
    const bytes = await readFile(path.join(directory, artifact.name));
    assert(bytes.length > 0, `Empty artifact: ${artifact.name}`);
    assert.equal(digest(bytes), artifact.sha256, `Artifact hash mismatch: ${artifact.name}`);
  }
}

export async function writeInventory(directory, filename, names, extra = {}) {
  const info = {
    schemaVersion: 1,
    version: await releaseVersion(),
    commit: sourceCommit(),
    ...extra,
    artifacts: await Promise.all(
      names.map(async (name) => ({
        name,
        sha256: digest(await readFile(path.join(directory, name))),
      })),
    ),
  };
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), JSON.stringify(info, null, 2) + '\n');
  return info;
}
