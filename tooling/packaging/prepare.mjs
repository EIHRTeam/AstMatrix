#!/usr/bin/env node
import { mkdir, rm, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { archiveName, releaseVersion, repository, writeInventory } from './artifacts.mjs';

const version = await releaseVersion();
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\ntag=v${version}\n`);
}
if (!process.argv.includes('--version-only')) {
  const output = path.join(repository, 'release');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const hosts = [
    ['Illustrator', 'apps/illustrator-cep/dist'],
    ['Photoshop', 'apps/photoshop-uxp/dist/enhanced'],
  ];
  if (process.argv.includes('--with-figma')) hosts.push(['Figma', 'apps/figma-plugin/dist']);
  const names = [];
  for (const [host, source] of hosts) {
    const name = archiveName(host, version);
    execFileSync('zip', ['-qr', path.join(output, name), '.'], {
      cwd: path.join(repository, source),
      stdio: 'inherit',
    });
    names.push(name);
  }
  await writeInventory(output, 'payload-info.json', names);
}
