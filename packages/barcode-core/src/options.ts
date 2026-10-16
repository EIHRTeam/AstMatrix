import type { RenderOptions } from 'bwip-js/generic';
import { getSymbology } from '@astmatrix/symbology-catalog';
import { ntinPayload, ppnPayload } from '@astmatrix/profiles';
import type { NormalizedRequest } from '@astmatrix/profiles';

const eciIds = new Set(['qrcode', 'datamatrix', 'azteccode', 'pdf417', 'micropdf417', 'dotcode']);
export function usesUtf8Eci(request: NormalizedRequest): boolean {
  return request.profileId !== 'ppn' && eciIds.has(request.symbologyId);
}
export function providerOptions(request: NormalizedRequest): RenderOptions {
  const f = request.fields,
    id = request.symbologyId,
    symbol = getSymbology(id);
  const eci = usesUtf8Eci(request);
  const compactPublication = ['isbn', 'ismn'].includes(id) && !request.text.includes('-');
  let text = eci ? `^ECI000026${request.text.replace(/\^/g, '^^')}` : request.text;
  if (id === 'ean14') text = `(01)${text}`;
  if (symbol.layout === 'composite') text += `|${f.secondary}`;
  if (id === 'isbn' || id === 'issn') {
    if (id === 'issn') text += ` ${f.issue}`;
    if (f.addon) text += ` ${f.addon}`;
  }
  if (id === 'maxicode' && (f.mode === 2 || f.mode === 3))
    text = `${f.postalCode}\x1d${f.countryCode}\x1d${f.serviceClass}\x1d${text}`;
  if (request.profileId === 'ntin') text = ntinPayload(f);
  if (request.profileId === 'ppn') text = ppnPayload(f);
  const options: RenderOptions & { mode?: number; type?: string; checktype?: string } = {
    bcid: compactPublication ? 'ean13' : symbol.bcid,
    text,
    scale: 2,
    includetext: f.hri,
    textfont: f.font,
    parsefnc: eci,
    // BWIPP's second publication label must also use our explicitly bundled font.
    ...(['isbn', 'ismn', 'issn'].includes(id) ? { text2font: f.font } : {}),
    // Explicit 9X supplement gap is covered by full ZXing add-on readback tests.
    ...(f.addon ? { addongap: 9 } : {}),
    // Do not invent registration-group hyphenation when only compact digits were supplied.
    ...(compactPublication ? { text2: `${id.toUpperCase()} ${request.text}` } : {}),
    ...(symbol.layout === 'linear' || symbol.layout === 'composite'
      ? { height: (f.heightMm * (25.4 / 72)) / f.moduleMm }
      : {}),
  };
  if (id === 'qrcode')
    Object.assign(options, { eclevel: f.ecc, ...(f.version ? { version: f.version } : {}) });
  if (id === 'datamatrix')
    Object.assign(options, {
      format: 'square',
      ...(f.size ? { rows: f.size, columns: f.size } : {}),
    });
  if (id === 'microqrcode' || id === 'hanxin')
    Object.assign(options, {
      eclevel: f.ecc,
      ...(f.version ? { version: id === 'microqrcode' ? `M${f.version}` : String(f.version) } : {}),
    });
  if (id === 'code49')
    Object.assign(options, {
      rows: f.rows,
      rowheight: f.rowHeightModules,
      sepheight: f.separatorHeightModules,
    });
  if (id === 'maxicode') options.mode = f.mode;
  if (id === 'mailmark') options.type = f.mailmarkType;
  if (f.checksum && f.checksum !== 'none') {
    options.includecheck = true;
    options.includecheckintext = true;
    if (id === 'msi') options.checktype = f.checksum;
  }
  // Keep Pharmacode's 1:3 bars and 2X gaps explicit in drawing modules.
  if (id === 'pharmacode') Object.assign(options, { nwidth: 1, wwidth: 3, swidth: 2 });
  // Code 93 requires both C/K check characters even when the engine defaults omit them.
  if (id === 'code93') options.includecheck = true;
  // Connected dot diameter is one module. Keep explicit to avoid provider defaults changing it.
  if (id === 'dotcode') options.inkspread = 0;
  return options;
}
