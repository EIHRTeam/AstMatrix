import {
  ean13,
  ean8,
  code128,
  qrcode,
  datamatrix,
  ean14,
  gs1_128,
  ean8composite,
  ean13composite,
  upca,
  upce,
  upcacomposite,
  upcecomposite,
  code11,
  interleaved2of5,
  code39,
  code39ext,
  code93,
  code49,
  flattermarken,
  msi,
  pharmacode,
  pharmacode2,
  telepen,
  isbn,
  ismn,
  issn,
  azteccode,
  codablockf,
  maxicode,
  micropdf417,
  pdf417,
  microqrcode,
  hanxin,
  dotcode,
  mailmark,
  gs1datamatrix,
} from 'bwip-js/generic';
import type { DrawingContext, RenderOptions } from 'bwip-js/generic';
import type { VectorScene } from '@astmatrix/vector-ir';

/** Explicit imports keep the provider registry auditable and bundler tree shaking available. */
export const encoders: Record<
  string,
  (options: RenderOptions, drawing: DrawingContext<VectorScene>) => VectorScene
> = {
  ean13,
  ean8,
  code128,
  qrcode,
  datamatrix,
  ean14,
  'gs1-128': gs1_128,
  ean8composite,
  ean13composite,
  upca,
  upce,
  upcacomposite,
  upcecomposite,
  code11,
  interleaved2of5,
  code39,
  code39ext,
  code93,
  code49,
  flattermarken,
  msi,
  pharmacode,
  pharmacode2,
  telepen,
  isbn,
  ismn,
  issn,
  azteccode,
  codablockf,
  maxicode,
  micropdf417,
  pdf417,
  microqrcode,
  hanxin,
  dotcode,
  mailmark,
  gs1datamatrix,
};

/** Calibration of the locked engine's callback coordinates to an actual module/track bar width. */
export function drawingUnitsPerModule(id: string, scale: number): number {
  // showmaxicode uses a seven-unit horizontal lattice at the fixed provider scale of two.
  if (id === 'maxicode') {
    if (scale !== 2) throw new Error('Unsupported MaxiCode drawing scale');
    return 7;
  }
  // Two-track Pharmacode defines its bar width in millimetres instead of PostScript points.
  if (id === 'pharmacode2') return Math.round((scale * 72) / 25.4);
  return scale;
}
