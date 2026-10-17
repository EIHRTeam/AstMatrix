import type { GenerateRequest } from '@astmatrix/profiles';
export const basicSamples: GenerateRequest[] = [
  { symbologyId: 'ean13', profileId: 'ean13-default', fields: { text: '6901234567892' } },
  { symbologyId: 'ean8', profileId: 'ean8-default', fields: { text: '96385074' } },
  { symbologyId: 'code128', profileId: 'code128-default', fields: { text: 'ABC-12345' } },
  {
    symbologyId: 'qrcode',
    profileId: 'qr-default',
    fields: { text: 'https://example.com/barcode' },
  },
  { symbologyId: 'datamatrix', profileId: 'dm-default', fields: { text: 'ABC123' } },
];
export const sampleSource =
  'Constructed regression inputs; not standards certification or host acceptance';
