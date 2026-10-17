import { startFigmaPlugin } from '@astmatrix/host-adapter-figma-plugin/runtime';

// Figma supplies __html__ from the manifest's fully bundled ui.html.
startFigmaPlugin(figma, __html__);
