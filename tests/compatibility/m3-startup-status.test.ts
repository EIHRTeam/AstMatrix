import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';

const startup = readFileSync('apps/illustrator-cep/panel/public/startup.js', 'utf8');
function start() {
  const dom = new JSDOM('<div id="root"><p id="startup-status">Starting</p></div>');
  let timeout: (() => void) | undefined;
  const context = vm.createContext({
    document: dom.window.document,
    window: {
      addEventListener: dom.window.addEventListener.bind(dom.window),
      setTimeout: (callback: () => void) => {
        timeout = callback;
      },
    },
  });
  vm.runInContext(startup, context);
  return { dom, timeout: () => timeout?.() };
}

it('reports missing local scripts before React can mount', () => {
  const { dom, timeout } = start();
  const script = dom.window.document.createElement('script');
  script.src = 'file:///extension/assets/missing.js';
  dom.window.document.body.append(script);
  script.dispatchEvent(new dom.window.Event('error'));
  const status = dom.window.document.querySelector('[role="alert"]')!;
  expect(status.textContent).toContain(
    'Resource failed to load: file:///extension/assets/missing.js',
  );
  timeout();
  expect(status.textContent).toContain('missing.js');
  dom.window.close();
});

it('reports initialization exceptions and a stalled startup', () => {
  const { dom, timeout } = start();
  timeout();
  expect(dom.window.document.querySelector('[role="alert"]')!.textContent).toContain('timed out');
  dom.window.dispatchEvent(
    new dom.window.ErrorEvent('error', { message: 'CSInterface unavailable' }),
  );
  expect(dom.window.document.querySelector('[role="alert"]')!.textContent).toContain(
    'CSInterface unavailable',
  );
  dom.window.close();
});

it('leaves the rendered panel intact after startup completes', () => {
  const { dom, timeout } = start();
  dom.window.document.getElementById('root')!.innerHTML = '<h1>AstMatrix</h1>';
  timeout();
  dom.window.dispatchEvent(new dom.window.ErrorEvent('error', { message: 'Later error' }));
  expect(dom.window.document.getElementById('root')!.innerHTML).toBe('<h1>AstMatrix</h1>');
  dom.window.close();
});
