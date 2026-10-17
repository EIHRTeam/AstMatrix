import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';

it('keeps native and WebView Photoshop manifests on their own compatibility floors', () => {
  const native = JSON.parse(readFileSync('apps/photoshop-uxp/manifest.json', 'utf8')) as {
    id: string;
    host: { app: string; minVersion: string; data: { apiVersion: number } }[];
    requiredPermissions: Record<string, unknown>;
  };
  const enhanced = JSON.parse(readFileSync('apps/photoshop-uxp/manifest-webview.json', 'utf8')) as {
    id: string;
    host: { app: string; minVersion: string; data: { apiVersion: number } }[];
    requiredPermissions: Record<string, unknown>;
  };
  expect(native.id).not.toBe(enhanced.id);
  expect(native.host).toEqual([{ app: 'PS', minVersion: '24.0.0', data: { apiVersion: 2 } }]);
  expect(enhanced.host).toEqual([{ app: 'PS', minVersion: '26.0.0', data: { apiVersion: 2 } }]);
  expect(native.requiredPermissions).toEqual({ localFileSystem: 'request' });
  expect(enhanced.requiredPermissions.webview).toMatchObject({
    allow: 'yes',
    allowLocalRendering: 'yes',
    enableMessageBridge: 'localOnly',
  });
});

it('keeps the Illustrator CEP runtime floor independent of annual aliases', () => {
  const xml = new JSDOM(readFileSync('apps/illustrator-cep/CSXS/manifest.xml', 'utf8'), {
    contentType: 'application/xml',
  });
  expect(xml.window.document.querySelector('RequiredRuntime')!.getAttribute('Version')).toBe(
    '11.0',
  );
  const host = xml.window.document.querySelector('Host')!;
  expect(host.getAttribute('Name')).toBe('ILST');
  expect(host.getAttribute('Version')).toBe('[27.0,30.9]');
  xml.window.close();
});
