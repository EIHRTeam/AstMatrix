import process from 'node:process';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolveWebBuild } from '@astmatrix/tooling/web-profiles';
import { webBuildAssets } from '@astmatrix/tooling/web-assets';

const web = resolveWebBuild('figma-ui');
const compiler = process.env.ASTMATRIX_COMPILER !== 'off';
export default defineConfig({
  define: { 'import.meta.url': 'document.baseURI' },
  root: 'ui',
  base: web.base,
  plugins: [
    webBuildAssets('figma-ui', compiler),
    react(),
    ...(compiler ? [babel({ presets: [reactCompilerPreset()] })] : []),
  ],
  build: {
    ...web.build,
    outDir: `../dist/ui${compiler ? '' : '-compiler-off'}`,
    emptyOutDir: true,
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    modulePreload: false,
    license: true,
    rolldownOptions: { output: { format: 'iife', codeSplitting: false } },
  },
});
