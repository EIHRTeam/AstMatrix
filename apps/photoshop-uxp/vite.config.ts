import process from 'node:process';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { webBuildAssets } from '@astmatrix/tooling/web-assets';
import { browserCodeSplitting, initialJsBudget } from '@astmatrix/tooling/web-chunks';
import { resolveWebBuild } from '@astmatrix/tooling/web-profiles';
const web = resolveWebBuild('uxp-webview');
const compiler = process.env.ASTMATRIX_COMPILER !== 'off';
export default defineConfig({
  root: 'webview',
  base: web.base,
  plugins: [
    webBuildAssets('uxp-webview', compiler),
    initialJsBudget(),
    react(),
    ...(compiler ? [babel({ presets: [reactCompilerPreset()] })] : []),
  ],
  build: {
    ...web.build,
    license: true,
    // BWIPP is one upstream module (~936 kB minified) and loads on first preview.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: { output: { codeSplitting: browserCodeSplitting } },
    outDir: `../dist/webview${compiler ? '' : '-compiler-off'}`,
    emptyOutDir: true,
  },
});
