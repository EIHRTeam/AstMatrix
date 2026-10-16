import { expect, it } from 'vitest';
import { generateScene } from '@astmatrix/barcode-core';
import { getProfile } from '@astmatrix/profiles';
import { renderSvg } from '@astmatrix/renderers-svg';

it('freezes the default Code 49 SVG geometry', async () => {
  const profile = getProfile('code49-default');
  const scene = generateScene({
    symbologyId: profile.symbologyId,
    profileId: profile.id,
    fields: profile.defaults,
  });
  await expect(renderSvg(scene)).toMatchFileSnapshot('./fixtures/code49.svg');
});
