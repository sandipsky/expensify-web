import { niceTicks } from './chart';

describe('niceTicks', () => {
  it('steps by 1, 2, 2.5 or 5 × 10^n up to the first round value at or above max', () => {
    expect(niceTicks(3000)).toEqual([0, 1000, 2000, 3000]);
    expect(niceTicks(1250)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(400_000)).toEqual([0, 100_000, 200_000, 300_000, 400_000]);
  });

  it('always reaches max, adding a step when max is just past a round value', () => {
    expect(niceTicks(3001)).toEqual([0, 1000, 2000, 3000, 4000]);
    const ticks = niceTicks(123_456_789);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(123_456_789);
  });

  it('keeps float steps clean', () => {
    expect(niceTicks(1)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(0.3)).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it('honours the requested tick count approximately', () => {
    expect(niceTicks(1000, 3)).toEqual([0, 500, 1000]);
    expect(niceTicks(1000, 11)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    expect(niceTicks(1000, 1)).toEqual([0, 1000]);
  });

  it('gives [0, 1] when there is nothing positive to scale', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(-50)).toEqual([0, 1]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1]);
    expect(niceTicks(Number.POSITIVE_INFINITY)).toEqual([0, 1]);
  });

  it('returns evenly spaced ascending ticks starting at 0', () => {
    for (const max of [1, 9, 42, 999, 12_345, 5_000_000]) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      const step = ticks[1];
      ticks.forEach((t, i) => expect(t).toBeCloseTo(i * step, 9));
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
  });
});
