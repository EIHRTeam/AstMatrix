import { act } from 'react';
import { expect, it, vi } from 'vitest';

it('switches QR/EAN through visible buttons without depending on the Radix popup (DOM only)', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('M0_WEB_PROFILE', 'cep12');
  vi.stubGlobal('M0_COMPILER_ENABLED', false);
  document.body.innerHTML = '<div id="root"></div>';
  await act(async () => {
    await import('../compatibility/spikes/cep/panel/main');
  });
  const button = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === 'EAN-13',
  )!;
  await act(async () => {
    button.click();
  });
  expect(button.getAttribute('aria-checked')).toBe('true');
  expect((document.querySelector('input') as HTMLInputElement).value).toBe('6901234567892');
  expect(decodeURIComponent((document.querySelector('img') as HTMLImageElement).src)).toContain(
    '37.29mm',
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  const qr = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === 'QR Code',
  )!;
  await act(async () => {
    qr.click();
  });
  expect(qr.getAttribute('aria-checked')).toBe('true');
  expect((document.querySelector('input') as HTMLInputElement).value).toBe(
    'https://example.com/barcode',
  );
  vi.unstubAllGlobals();
});
