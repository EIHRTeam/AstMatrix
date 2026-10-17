import process from 'node:process';

import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { webBuildAssets } from '@astmatrix/tooling/web-assets';

import { WEB_PROFILE_IDS, isWebProfileId, resolveWebBuild } from '@astmatrix/tooling/web-profiles';

/**
 * Illustrator CEP panel build.
 *
 * One ZXP may ship several Web UI bundles (`web/cep11`, `web/cep12`) built from the same
 * source; this config builds exactly one profile per invocation so that the build cache can
 * key on it.
 *
 *   ASTMATRIX_WEB_PROFILE=cep11 pnpm --filter @astmatrix/illustrator-cep build:panels
 *
 * The same panel source is compiled for both profiles. Copying sources per annual version is
 * explicitly forbidden.
 */

const requestedProfile = process.env.ASTMATRIX_WEB_PROFILE ?? 'cep11';

if (!isWebProfileId(requestedProfile)) {
  throw new Error(
    `Unknown ASTMATRIX_WEB_PROFILE "${requestedProfile}". Known profiles: ${WEB_PROFILE_IDS.join(', ')}`,
  );
}

const web = resolveWebBuild(requestedProfile);
const compiler = process.env.ASTMATRIX_COMPILER !== 'off';

export default defineConfig(({ command }) => ({
  base: web.base,
  root: 'panel',
  plugins: [
    webBuildAssets(requestedProfile, compiler),
    {
      name: 'astmatrix-cep-local-scripts',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: (html) =>
          html
            .replace(/<script type="module" crossorigin /g, '<script defer ')
            .replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" '),
      },
    },
    react(),
    ...(compiler ? [babel({ presets: [reactCompilerPreset()] })] : []),
  ],
  build: {
    ...web.build,
    license: true,
    // CEP opens file:// pages. Classic scripts avoid module/CORS fetches without CEF flags.
    modulePreload: false,
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        format: 'iife',
        codeSplitting: false,
        intro: 'var __astmatrixScriptUrl = document.currentScript.src;',
      },
    },
    outDir: `../dist/web/${requestedProfile}${compiler ? '' : '-compiler-off'}`,
    emptyOutDir: true,
  },
  define: command === 'build' ? { 'import.meta.url': '__astmatrixScriptUrl' } : {},
}));
