import { describe, expect, it } from 'vitest';
import { outcomeOf, scorePrediction } from './scoring.js';

describe('outcomeOf', () => {
  it('classifies outcomes', () => {
    expect(outcomeOf({ home: 2, away: 1 })).toBe('home');
    expect(outcomeOf({ home: 0, away: 1 })).toBe('away');
    expect(outcomeOf({ home: 0, away: 0 })).toBe('draw');
    expect(outcomeOf({ home: 3, away: 3 })).toBe('draw');
  });
});

describe('scorePrediction', () => {
  const cases: Array<{
    name: string;
    pred: [number, number];
    result: [number, number];
    points: 0 | 1 | 3;
    isExact: boolean;
    isOutcome: boolean;
  }> = [
    { name: 'exact home win = 3 (no stacking)', pred: [2, 1], result: [2, 1], points: 3, isExact: true, isOutcome: true },
    { name: 'exact away win = 3', pred: [0, 3], result: [0, 3], points: 3, isExact: true, isOutcome: true },
    { name: 'exact draw = 3 (1:1 → 1:1)', pred: [1, 1], result: [1, 1], points: 3, isExact: true, isOutcome: true },
    { name: 'exact 0:0 = 3', pred: [0, 0], result: [0, 0], points: 3, isExact: true, isOutcome: true },
    { name: 'right home outcome, wrong score (2:1 → 3:1)', pred: [2, 1], result: [3, 1], points: 1, isExact: false, isOutcome: true },
    { name: 'right home outcome, wrong score (2:1 → 1:0)', pred: [2, 1], result: [1, 0], points: 1, isExact: false, isOutcome: true },
    { name: 'any draw matches any draw (1:1 → 2:2)', pred: [1, 1], result: [2, 2], points: 1, isExact: false, isOutcome: true },
    { name: 'any draw matches 0:0 (2:2 → 0:0)', pred: [2, 2], result: [0, 0], points: 1, isExact: false, isOutcome: true },
    { name: 'right away outcome, wrong score (0:1 → 1:3)', pred: [0, 1], result: [1, 3], points: 1, isExact: false, isOutcome: true },
    { name: 'home pred, draw result (2:1 → 1:1)', pred: [2, 1], result: [1, 1], points: 0, isExact: false, isOutcome: false },
    { name: 'home pred, away result (2:1 → 0:1)', pred: [2, 1], result: [0, 1], points: 0, isExact: false, isOutcome: false },
    { name: 'draw pred, home result (1:1 → 1:0)', pred: [1, 1], result: [1, 0], points: 0, isExact: false, isOutcome: false },
    { name: 'draw pred, away result (0:0 → 0:2)', pred: [0, 0], result: [0, 2], points: 0, isExact: false, isOutcome: false },
    { name: 'away pred, home result (0:2 → 4:0)', pred: [0, 2], result: [4, 0], points: 0, isExact: false, isOutcome: false },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const scored = scorePrediction(
        { home: c.pred[0], away: c.pred[1] },
        { home: c.result[0], away: c.result[1] },
      );
      expect(scored).toEqual({ points: c.points, isExact: c.isExact, isOutcome: c.isOutcome });
    });
  }

  it('is symmetric in the draw family for all small scores', () => {
    for (let a = 0; a <= 4; a++) {
      for (let b = 0; b <= 4; b++) {
        const scored = scorePrediction({ home: a, away: a }, { home: b, away: b });
        expect(scored.points).toBe(a === b ? 3 : 1);
      }
    }
  });
});
