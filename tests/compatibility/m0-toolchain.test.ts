import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { parse } from 'acorn';
describe('M0 bootstrap and ExtendScript syntax gates (no real-host claim)', () => {
  it('selects by real CEP API version rather than annual aliases', () => {
    const context = vm.createContext({});
    vm.runInContext(
      readFileSync('tests/compatibility/spikes/cep/select-profile.js', 'utf8'),
      context,
    );
    expect(
      vm.runInContext("selectM0Profile({major:11},{appId:'ILST',appVersion:'29.0'})", context),
    ).toBe('cep11');
    expect(
      vm.runInContext("selectM0Profile({major:12},{appId:'ILST',appVersion:'30.6'})", context),
    ).toBe('cep12');
    for (const major of ['11', '12']) {
      expect(
        vm.runInContext(
          `selectM0Profile({major:'${major}'},{appId:'ILST',appVersion:'30.6.0'})`,
          context,
        ),
      ).toBe(`cep${major}`);
    }
    for (const major of ['12x', '', '12.1', null, true, 12.5]) {
      expect(() =>
        vm.runInContext(
          `selectM0Profile({major:${JSON.stringify(major)}},{appId:'ILST',appVersion:'30.6'})`,
          context,
        ),
      ).toThrow(/Unmeasured/);
    }
    expect(() =>
      vm.runInContext("selectM0Profile({major:13},{appId:'ILST',appVersion:'30.6'})", context),
    ).toThrow(/Unmeasured|Illustrator/);
    expect(() =>
      vm.runInContext("selectM0Profile({major:12},{appId:'PHXS',appVersion:'27.8'})", context),
    ).toThrow(/Unmeasured|Illustrator/);
  });
  it('initializes bootstrap buttons from native JSON string versions without coercion by the bridge', () => {
    for (const major of ['11', '12', '13']) {
      const dom = new JSDOM(readFileSync('tests/compatibility/spikes/cep/bootstrap.html', 'utf8'));
      const navigation = { location: { href: '' } };
      const context = vm.createContext({
        document: dom.window.document,
        window: {
          ...navigation,
          __adobe_cep__: {
            getCurrentApiVersion: () => JSON.stringify({ major, minor: '0', micro: '0' }),
            getHostEnvironment: () =>
              JSON.stringify({ appId: 'ILST', appVersion: '30.6.0', appSkinInfo: {} }),
          },
        },
      });
      // SDK JSON parsing must preserve the native types; no hand-written numeric-only mock.
      vm.runInContext(
        'function CSInterface() {};' +
          'CSInterface.prototype.getCurrentApiVersion = function() { return JSON.parse(window.__adobe_cep__.getCurrentApiVersion()); };' +
          'CSInterface.prototype.getHostEnvironment = function() { return JSON.parse(window.__adobe_cep__.getHostEnvironment()); };',
        context,
      );
      vm.runInContext(
        readFileSync('tests/compatibility/spikes/cep/select-profile.js', 'utf8'),
        context,
      );
      const inline = dom.window.document.querySelector('script:not([src])')!.textContent!;
      vm.runInContext(inline, context);
      for (const mode of ['on', 'off']) {
        const button = dom.window.document.getElementById(mode) as HTMLButtonElement;
        expect(button.disabled).toBe(major === '13');
        button.click();
        expect(navigation.location.href).toBe(
          major === '13' ? '' : `../web/cep${major}/${mode}/index.html`,
        );
      }
      expect(dom.window.document.getElementById('runtime')!.textContent).toContain(
        `"major":"${major}"`,
      );
      expect(
        dom.window.document.querySelector('link[rel="stylesheet"]')!.getAttribute('href'),
      ).toBe('style.css');
      dom.window.close();
    }
  });
  it('parses actual spike and skeleton JSX as ES3; rejects modern syntax', () => {
    for (const file of [
      'apps/illustrator-cep/jsx/astmatrix.jsx',
      'tests/compatibility/spikes/illustrator/host.jsx',
      'tests/compatibility/spikes/cep/select-profile.js',
    ]) {
      expect(() =>
        parse(readFileSync(file, 'utf8'), { ecmaVersion: 3, sourceType: 'script' }),
      ).not.toThrow();
    }
    const bootstrap = new JSDOM(
      readFileSync('tests/compatibility/spikes/cep/bootstrap.html', 'utf8'),
    );
    expect(() =>
      parse(bootstrap.window.document.querySelector('script:not([src])')!.textContent!, {
        // Browser bootstrap uses ES5; only ExtendScript and the selector require ES3.
        ecmaVersion: 5,
        sourceType: 'script',
      }),
    ).not.toThrow();
    bootstrap.window.close();
    expect(() => parse('const f = () => 1;', { ecmaVersion: 3 })).toThrow(/keyword|Unexpected/);
  });
});

it('M0 native manifests declare independent experiment IDs and candidate floors', () => {
  const production = JSON.parse(readFileSync('apps/photoshop-uxp/manifest.json', 'utf8'));
  const experiment = JSON.parse(
    readFileSync('tests/compatibility/spikes/photoshop/manifest.json', 'utf8'),
  );
  expect(experiment.id).not.toBe(production.id);
  expect(experiment.host[0].minVersion).toBe('24.0.0');
  expect(experiment.requiredPermissions).toEqual({});
  const xml = new JSDOM(readFileSync('apps/illustrator-cep/CSXS/manifest.xml', 'utf8'), {
    contentType: 'application/xml',
  });
  expect(xml.window.document.querySelector('RequiredRuntime')!.getAttribute('Version')).toBe(
    '11.0',
  );
  xml.window.close();
});
