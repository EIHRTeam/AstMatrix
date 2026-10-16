import { validateScene } from '@astmatrix/vector-ir';
import type { Color, PathCommand, VectorScene } from '@astmatrix/vector-ir';
const number = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('Non-finite SVG coordinate');
  return String(Number(value.toFixed(8)));
};
const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
function path(c: PathCommand): string {
  if (c.op === 'Z') return 'Z';
  if (c.op === 'C') return `C${[c.x1, c.y1, c.x2, c.y2, c.x, c.y].map(number).join(' ')}`;
  return `${c.op}${number(c.x)} ${number(c.y)}`;
}
/** SVG is RGB. CMYK receives an explicit deterministic device approximation. */
export function svgColor(color: Color): string {
  if (color.space === 'RGB') return `#${color.hex}`;
  return `rgb(${[color.c, color.m, color.y].map((v) => Math.round(255 * (1 - v / 100) * (1 - color.k / 100))).join(',')})`;
}
export function renderSvg(
  scene: VectorScene,
  options: { availableFonts?: readonly string[] } = {},
): string {
  validateScene(scene);
  const nodes = scene.nodes
    .filter((node) => node.role !== 'quiet-zone')
    .map(({ geometry: g, fill }) => {
      const attr = fill ? ` fill="${svgColor(fill)}"` : '';
      if (g.kind === 'rect')
        return `<rect${attr} x="${number(g.x)}" y="${number(g.y)}" width="${number(g.w)}" height="${number(g.h)}"/>`;
      if (g.kind === 'path')
        return `<path${attr} fill-rule="${g.fillRule}" d="${g.commands.map(path).join('')}"/>`;
      if (g.kind === 'ellipse')
        return `<ellipse${attr} cx="${number(g.cx)}" cy="${number(g.cy)}" rx="${number(g.rx)}" ry="${number(g.ry)}"/>`;
      if (g.kind === 'polygon')
        return `<polygon${attr} fill-rule="${g.fillRule}" points="${g.points.map((p) => `${number(p.x)},${number(p.y)}`).join(' ')}"/>`;
      if (!options.availableFonts?.includes(g.fontFamily))
        throw new Error(`Missing SVG font: ${g.fontFamily}; use outlined HRI`);
      return `<text${attr} x="${number(g.x)}" y="${number(g.y)}" font-family="${escape(g.fontFamily)}" font-size="${number(g.fontSizeMm)}">${escape(g.text)}</text>`;
    })
    .join('');
  const background = scene.background
    ? `<rect width="${number(scene.widthMm)}" height="${number(scene.heightMm)}" fill="${svgColor(scene.background)}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(scene.widthMm)}mm" height="${number(scene.heightMm)}mm" viewBox="0 0 ${number(scene.widthMm)} ${number(scene.heightMm)}">${background}<g fill="${svgColor(scene.foreground)}">${nodes}</g></svg>`;
}
