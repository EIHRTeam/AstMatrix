import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { verifyPhotoshopIcons } from './photoshop-icons';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'astmatrix-photoshop-icons-'));
  cpSync('apps/photoshop-uxp/manifest.json', path.join(directory, 'manifest.json'));
  cpSync('apps/photoshop-uxp/icons', path.join(directory, 'icons'), { recursive: true });
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it.each(['panel', 'list'])('rejects a missing %s @2x resource', (name) => {
  rmSync(path.join(directory, `icons/${name}@2x.png`));
  expect(() => verifyPhotoshopIcons(directory)).toThrow(`${name}@2x.png`);
});

it.each(['panel', 'list'])('rejects the oversized source logo used as a %s icon', (name) => {
  cpSync('icon.png', path.join(directory, `icons/${name}@1x.png`));
  expect(() => verifyPhotoshopIcons(directory)).toThrow('pixel width');
});

it('rejects an unsupported scale without packaged assets', () => {
  const file = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.icons[0].scale = [1, 1.25, 1.5, 2];
  writeFileSync(file, JSON.stringify(manifest));
  expect(() => verifyPhotoshopIcons(directory)).toThrow('1x and 2x variants');
});
