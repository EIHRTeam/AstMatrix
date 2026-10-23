import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type ManifestIcon = {
  width: number;
  height: number;
  path: string;
  scale: number[];
  theme: string[];
};

type IconManifest = {
  icons: ManifestIcon[];
  entrypoints: { type: string; icons?: ManifestIcon[] }[];
};

/** UXP resolves a base path such as panel.png to panel@1x.png and panel@2x.png. */
export function verifyPhotoshopIcons(directory: string, manifestFile = 'manifest.json'): void {
  const manifest = JSON.parse(
    readFileSync(path.join(directory, manifestFile), 'utf8'),
  ) as IconManifest;
  const groups = [
    { size: 24, icons: manifest.icons },
    ...manifest.entrypoints
      .filter((entrypoint) => entrypoint.type === 'panel')
      .map((entrypoint) => ({ size: 23, icons: entrypoint.icons })),
  ];
  for (const { size, icons } of groups) {
    assert(Array.isArray(icons) && icons.length > 0, `Missing Photoshop ${size}px icons`);
    for (const icon of icons) {
      assert.equal(icon.width, size);
      assert.equal(icon.height, size);
      assert.deepEqual(icon.scale, [1, 2], 'Photoshop icons must provide 1x and 2x variants');
      assert(Array.isArray(icon.theme) && icon.theme.length > 0);
      assert(icon.path.endsWith('.png') && !/@[\d.]+x\.png$/.test(icon.path));
      for (const scale of icon.scale) {
        const file = path.join(directory, icon.path.replace(/\.png$/, `@${scale}x.png`));
        const bytes = readFileSync(file);
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file}: PNG`);
        assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', `${file}: PNG header`);
        assert.equal(bytes.readUInt32BE(16), size * scale, `${file}: pixel width`);
        assert.equal(bytes.readUInt32BE(20), size * scale, `${file}: pixel height`);
      }
    }
  }
}
