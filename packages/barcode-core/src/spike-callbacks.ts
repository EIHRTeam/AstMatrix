/** Callback dispatch probe only; this does not implement MaxiCode/DotCode/HRI rendering. */
import { render, drawingSVG, symbolList } from 'bwip-js/generic';
import type { DrawingContext, RenderOptions } from 'bwip-js/generic';
export function traceCallbacks(options: RenderOptions) {
  const calls: Record<string, number> = {};
  const scales: number[][] = [];
  const texts: { value: string; font: string; baseline: number }[] = [];
  let width = 0,
    height = 0;
  const hit = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const metrics = drawingSVG();
  const drawing: DrawingContext<unknown> = {
    scale(x, y) {
      hit('scale');
      scales.push([x, y]);
      return null;
    },
    measure(...args) {
      hit('measure');
      return metrics.measure(...args);
    },
    init(w, h) {
      hit('init');
      width = w;
      height = h;
    },
    line() {
      hit('line');
    },
    polygon() {
      hit('polygon');
    },
    hexagon() {
      hit('hexagon');
    },
    ellipse() {
      hit('ellipse');
    },
    fill() {
      hit('fill');
    },
    text(_x, y, value, _rgb, font) {
      hit('text');
      texts.push({ value, font: font.name, baseline: y });
    },
    end() {
      hit('end');
      return { calls, scales, width, height, texts };
    },
  };
  render({ ...options }, drawing);
  return {
    bcid: options.bcid,
    scope: 'dispatch and reference font measurement only',
    calls,
    scales,
    width,
    height,
    texts,
  };
}
export function callbackSamples() {
  const maxi = symbolList.find((s) => s.bcid === 'maxicode')!;
  const maxOptions: RenderOptions & { mode: number } = {
    bcid: 'maxicode',
    text: maxi.text,
    mode: 2,
    parse: true,
    scale: 2,
  };
  return [
    traceCallbacks({ bcid: 'ean13', text: '6901234567892', includetext: true, scale: 2 }),
    traceCallbacks({ bcid: 'qrcode', text: 'https://example.com/barcode', scale: 2 }),
    traceCallbacks({ bcid: 'dotcode', text: 'This is DotCode', inkspread: 0.16, scale: 2 }),
    traceCallbacks(maxOptions),
  ];
}
