#!/usr/bin/env node
/**
 * Packaging entry.
 *
 * STATUS: skeleton. Prints the planned release artifacts so that the packaging contract is
 * visible, but does not assemble archives yet.
 *
 * Planned artefacts
 *   astmatrix-figma.zip            Figma Design plugin, importable after extraction
 *   astmatrix-illustrator.zxp      CEP, may contain web/cep11 + web/cep12
 *   astmatrix-photoshop.ccx        UXP, manifest v5, host.minVersion >= Photoshop 24.x
 *   astmatrix-affinity/            Affinity script bundle distributed per SDK support
 *   AstMatrix-Illustrator-<version>[-aarch64]-Setup.exe   Windows Inno Setup installers
 *   AstMatrix-Photoshop-<version>[-aarch64]-Setup.exe     Windows Inno Setup installers
 *
 * Actual ZIP/CCX releases use prepare.mjs; Windows installers use inno/build.mjs.
 * This command remains a packaging-plan display, including planned signed ZXP artifacts.
 *
 * Split packages (astmatrix-illustrator-cep11.zxp / cep12.zxp, or a UXP compatibility +
 * enhancement pair) are only produced when the single-package constraints genuinely conflict.
 * Signing is deliberately not part of this script: it is kept separate from shared code
 * compilation.
 */

import process from 'node:process';
import { installerArchitectures, installerName } from './artifacts.mjs';

const PLANNED_ARTIFACTS = [
  {
    name: 'astmatrix-figma.zip',
    target: 'figma-plugin',
    contents: [
      'manifest.json',
      'code.js',
      'ui.html',
      'LICENSE',
      'README.md',
      'PRIVACY.md',
      'licenses/',
      'ui-build-info.json',
      'host-build-info.json',
    ],
  },
  {
    name: 'astmatrix-illustrator.zxp',
    target: 'illustrator-cep',
    contents: [
      'CSXS/manifest.xml',
      'LICENSE',
      'README.md',
      'PRIVACY.md',
      'Installation_Guide_Illustrator.txt',
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
    contents: [
      'manifest.json',
      'icons/',
      'LICENSE',
      'README.md',
      'PRIVACY.md',
      'Installation_Guide_Photoshop.txt',
      'index.html',
      'index.css',
      'index.js',
      'licenses/',
    ],
  },
  {
    name: 'astmatrix-photoshop-webview.ccx',
    target: 'photoshop-uxp-webview',
    contents: [
      'manifest.json',
      'icons/',
      'LICENSE',
      'README.md',
      'PRIVACY.md',
      'Installation_Guide_Photoshop.txt',
      'index.html',
      'index.css',
      'index.js',
      'webview/',
      'licenses/',
    ],
  },
  ...['Illustrator', 'Photoshop'].flatMap((host) =>
    installerArchitectures.map((architecture) => ({
      name: installerName(host, '<version>', architecture),
      target: `windows-inno-${host.toLowerCase()}-${architecture}`,
      contents:
        host === 'Illustrator'
          ? ['Illustrator ZIP payload', 'per-user installer controller']
          : ['Photoshop enhanced CCX', 'UPIA-first controller', 'experimental extraction payload'],
    })),
  ),
  {
    name: 'astmatrix-affinity/',
    target: 'affinity-script',
    contents: ['main.js', 'LICENSE', 'lib/', 'manifest.json'],
  },
];

function main() {
  console.log('AstMatrix packaging plan\n');
  for (const artifact of PLANNED_ARTIFACTS) {
    console.log(`  ${artifact.name}`);
    console.log(`    target    ${artifact.target}`);
    console.log(`    contents  ${artifact.contents.join(', ')}`);
  }
  console.log('\nSigning (ZXP/CCX) runs separately and is not part of this script.');
  console.log('SKELETON: no archive is produced yet.');
  return 0;
}

process.exitCode = main();
