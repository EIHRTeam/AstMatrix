import { expect, it } from 'vitest';
import { normalizeRequest } from '@astmatrix/profiles';
import { ENGINE_VERSION, encodeNormalized } from './index';
import { lazyBwipProvider } from './lazy';

it('loads the same engine and scene as the eager provider', async () => {
  const request = normalizeRequest({
    symbologyId: 'qrcode',
    profileId: 'qr-default',
    fields: { text: 'ASTMATRIX' },
  });
  expect(lazyBwipProvider.engineVersion).toBe(ENGINE_VERSION);
  expect(await lazyBwipProvider.encode(request)).toEqual(encodeNormalized(request));
});
