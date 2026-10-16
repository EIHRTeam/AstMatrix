#!/usr/bin/env node
/**
 * Packaging entry (docs/plan/INIT.md §12.4, §12.5).
 *
 * STATUS: skeleton. Prints the planned release artifacts so that the packaging contract is
 * visible, but does not assemble archives yet.
 *
 * Planned artefacts
 *   astmatrix-illustrator.zxp      CEP, may contain web/cep11 + web/cep12 (§4.7)
 *   astmatrix-photoshop.ccx        UXP, manifest v5, host.minVersion >= Photoshop 24.x
 *   astmatrix-affinity/            Affinity script bundle distributed per SDK support
 *
 * Split packages (astmatrix-illustrator-cep11.zxp / cep12.zxp, or a UXP compatibility +
 * enhancement pair) are only produced when the single-package constraints in §4.7 and §4.6
 * genuinely conflict. Signing is deliberately not part of this script: it is kept separate
 * from shared code compilation (§6.3).
 */

import process from 'node:process';

const PLANNED_ARTIFACTS = [
  {
    name: 'astmatrix-illustrator.zxp',
    target: 'illustrator-cep',
    contents: [
      'CSXS/manifest.xml',
      'bootstrap/',
      'web/cep11/',
      'web/cep12/',
      'jsx/astmatrix.jsx',
      'vendor/',
      'licenses/',
    ],
  },
  {
    name: 'astmatrix-photoshop.ccx',
    target: 'photoshop-uxp',
    contents: ['manifest.json', 'index.html', 'index.css', 'index.js', 'licenses/'],
  },
  {
    name: 'astmatrix-photoshop-webview.ccx',
    target: 'photoshop-uxp-webview',
    contents: ['manifest.json', 'index.html', 'index.css', 'index.js', 'webview/', 'licenses/'],
  },
  {
    name: 'astmatrix-affinity/',
    target: 'affinity-script',
    contents: ['main.js', 'lib/', 'manifest.json'],
  },
];

function main() {
  console.log('AstMatrix packaging plan\n');
  for (const artifact of PLANNED_ARTIFACTS) {
    console.log(`  ${artifact.name}`);
    console.log(`    target    ${artifact.target}`);
    console.log(`    contents  ${artifact.contents.join(', ')}`);
  }
  console.log('\nSigning (ZXP/CCX) runs separately and is not part of this script (§6.3, §12.2).');
  console.log('SKELETON: no archive is produced yet (see §14 M6).');
  return 0;
}

process.exitCode = main();
