import { expect, it } from 'vitest';
import { stableStringify, deepFreeze, mmToPt, ptToMm } from './index';
it('canonical JSON keys ignore order and reject lossy/nonfinite values', () => {
  expect(stableStringify({ b: 2, a: [1, { x: '<>&' }] })).toBe(
    stableStringify({ a: [1, { x: '<>&' }], b: 2 }),
  );
  for (const input of [NaN, Infinity, undefined, { lost: undefined }, () => {}, new Date()])
    expect(() => stableStringify(input)).toThrow(Error);
});
it('converts physical units reversibly and freezes nested geometry-like data', () => {
  expect(mmToPt(25.4)).toBe(72);
  expect(ptToMm(72)).toBe(25.4);
  const value = deepFreeze({ nodes: [{ x: 1 }] });
  expect(Object.isFrozen(value.nodes[0])).toBe(true);
  expect(() => mmToPt(Infinity)).toThrow('Non-finite');
});
