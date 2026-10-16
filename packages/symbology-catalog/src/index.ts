import { deepFreeze } from '@astmatrix/shared';
export type CodeTab = 'barcode' | 'matrix';
export type SupportStatus =
  | 'listed'
  | 'implemented'
  | 'decoded'
  | 'host-tested'
  | 'standard-verified'
  | 'released';
export interface CatalogEntry {
  sourceId: string;
  section: '3.1' | '3.2' | '3.3' | '3.4';
  label: string;
  symbologyIds: readonly string[];
  profileIds: readonly string[];
}
export interface SymbologyDefinition {
  id: string;
  label: string;
  tab: CodeTab;
  providerId: 'bwip-js';
  layout: 'linear' | 'matrix' | 'stacked' | 'composite';
  quietModules: readonly [number, number, number, number];
  bcid: string;
  defaultProfileId: string;
  profileIds: readonly string[];
  status: SupportStatus;
  reason: string;
  evidence: readonly string[];
}
const groups: { section: CatalogEntry['section']; entries: [string, string[], string[]][] }[] = [
  {
    section: '3.1',
    entries: [
      ['EAN-8', ['ean8'], ['ean8-default']],
      ['EAN-13', ['ean13'], ['ean13-default']],
      ['EAN-14 / GS1-128', ['ean14', 'gs1-128'], ['ean14-default', 'gs1-128-default']],
      ['EAN-8 Composite', ['ean8composite'], []],
      ['EAN-13 Composite', ['ean13composite'], []],
      ['UPC-A', ['upca'], []],
      ['UPC-E', ['upce'], []],
      ['UPC-A Composite', ['upcacomposite'], []],
      ['UPC-E Composite', ['upcecomposite'], []],
    ],
  },
  {
    section: '3.2',
    entries: [
      ['Code-128', ['code128'], ['code128-default']],
      ['Code-11', ['code11'], []],
      ['Code-2of5 Interleaved', ['interleaved2of5'], []],
      ['Code-39', ['code39'], []],
      ['Code-39 Full ASCII', ['code39ext'], []],
      ['Code-93', ['code93'], []],
      ['Flattermarken', ['flattermarken'], []],
      ['GS1-128', ['gs1-128'], ['gs1-128-default']],
      ['MSI', ['msi'], []],
      ['Pharmacode One-Track', ['pharmacode'], []],
      ['Pharmacode Two-Track', ['pharmacode2'], []],
      ['Telepen Alpha', ['telepen'], []],
    ],
  },
  {
    section: '3.3',
    entries: [
      ['ISBN 13', ['isbn'], ['isbn13']],
      ['ISBN 13 + 5 Digits', ['isbn'], ['isbn13-addon5']],
      ['ISMN', ['ismn'], ['ismn-default']],
      ['ISSN', ['issn'], ['issn-default']],
      ['ISSN + 2 Digits', ['issn'], ['issn-addon2']],
    ],
  },
  {
    section: '3.4',
    entries: [
      ['QR Code', ['qrcode'], ['qr-default']],
      ['QR Mobile/Smartphone', ['qrcode'], ['qr-mobile']],
      ['Data Matrix', ['datamatrix'], ['dm-default']],
      ['Aztec', ['azteccode'], []],
      ['Codablock-F', ['codablockf'], []],
      ['MaxiCode', ['maxicode'], []],
      ['MicroPDF417', ['micropdf417'], []],
      ['PDF417', ['pdf417'], []],
      ['Micro QR Code', ['microqrcode'], []],
      ['Han Xin', ['hanxin'], []],
      ['DotCode', ['dotcode'], []],
      ['Royal Mail Mailmark 2D', ['mailmark'], ['mailmark-default']],
      ['NTIN Code', ['gs1datamatrix'], ['ntin']],
      ['PPN Code', ['datamatrix'], ['ppn']],
    ],
  },
];
export const originalCatalog: readonly CatalogEntry[] = deepFreeze(
  groups.flatMap(({ section, entries }) =>
    entries.map(([label, symbologyIds, profileIds], i) => ({
      sourceId: `${section}-${i + 1}`,
      section,
      label,
      symbologyIds,
      profileIds: profileIds.length ? profileIds : symbologyIds.map((id) => `${id}-default`),
    })),
  ),
);
/** User-requested additions remain separate from the immutable original 40 requirement rows. */
export const additionalCatalog: readonly CatalogEntry[] = deepFreeze([
  {
    sourceId: 'extension-code49',
    section: '3.4',
    label: 'Code 49',
    symbologyIds: ['code49'],
    profileIds: ['code49-default'],
  },
]);
export const catalog: readonly CatalogEntry[] = deepFreeze([
  ...originalCatalog,
  ...additionalCatalog,
]);
const baseProfiles: Record<string, string[]> = {
  ean13: ['ean13-default'],
  ean8: ['ean8-default'],
  code128: ['code128-default'],
  qrcode: ['qr-default', 'qr-mobile'],
  datamatrix: ['dm-default'],
};
/** Minimum module margins, ordered left/right/top/bottom; industry print approval is separate. */
function quietModules(id: string): [number, number, number, number] {
  if (id === 'code49') return [10, 10, 2, 2];
  if (id === 'mailmark') return [4, 4, 4, 4];
  if (id === 'qrcode') return [4, 4, 4, 4];
  if (id.endsWith('composite')) {
    const [l, r] = quietModules(id.replace(/composite$/, ''));
    return [l, r, 2, 2];
  }
  if (id === 'microqrcode' || id === 'dotcode') return [2, 2, 2, 2];
  if (['pdf417', 'micropdf417'].includes(id)) return [2, 2, 2, 2];
  if (['datamatrix', 'gs1datamatrix', 'azteccode', 'maxicode', 'mailmark'].includes(id))
    return [1, 1, 1, 1];
  if (id === 'hanxin') return [3, 3, 3, 3];
  if (['ean13', 'isbn', 'ismn', 'issn'].includes(id)) return [11, 7, 0, 0];
  if (id === 'ean8') return [7, 7, 0, 0];
  if (id === 'upca') return [9, 9, 0, 0];
  if (id === 'upce') return [9, 7, 0, 0];
  return [10, 10, 0, 0];
}
const matrixIds = new Set(
  catalog.filter((entry) => entry.section === '3.4').flatMap((entry) => entry.symbologyIds),
);
export const symbologies: readonly SymbologyDefinition[] = deepFreeze(
  [...new Set(catalog.flatMap((entry) => entry.symbologyIds))].map((id) => {
    const sources = catalog.filter((entry) => entry.symbologyIds.includes(id));
    const profileIds = [
      ...new Set(
        sources.flatMap((entry) =>
          entry.profileIds.length
            ? entry.profileIds.filter(
                (p) => (id !== 'ean14' && id !== 'gs1-128') || p === `${id}-default`,
              )
            : [`${id}-default`],
        ),
      ),
    ];
    return {
      id,
      label: id === 'ean14' ? 'EAN-14' : id === 'gs1-128' ? 'GS1-128' : sources[0]!.label,
      tab: matrixIds.has(id) ? 'matrix' : 'barcode',
      providerId: 'bwip-js',
      bcid: id,
      layout: id.endsWith('composite')
        ? 'composite'
        : ['pdf417', 'micropdf417', 'codablockf', 'code49'].includes(id)
          ? 'stacked'
          : matrixIds.has(id)
            ? 'matrix'
            : 'linear',
      quietModules: quietModules(id),
      defaultProfileId: baseProfiles[id]?.[0] ?? profileIds[0]!,
      profileIds,
      status: 'implemented',
      reason: baseProfiles[id]
        ? '共享 IR/SVG 已实现；行业与真实宿主符合性仍由 M7 验收。'
        : '共享编码/Profile/IR 已实现；独立解码、行业规范与真实宿主验收范围见 M7 证据。',
      evidence: baseProfiles[id]
        ? ['tests/barcode-conformance/m1.test.ts', 'tests/vector-golden/m1.test.ts']
        : id === 'code49'
          ? ['tests/barcode-conformance/code49.test.ts', 'docs/plan/evidence/M7-CODE49/README.md']
          : ['tests/barcode-conformance/m7.test.ts', 'docs/plan/evidence/M7-ENCODERS/README.md'],
    } satisfies SymbologyDefinition;
  }),
);
export function getSymbology(id: string): SymbologyDefinition {
  const value = symbologies.find((s) => s.id === id);
  if (!value) throw new Error(`Unknown symbology: ${id}`);
  return value;
}
export function isCompatible(symbologyId: string, profileId: string): boolean {
  return symbologies.find((s) => s.id === symbologyId)?.profileIds.includes(profileId) ?? false;
}
