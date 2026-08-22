/**
 * Scoring rules of "0 מושג בכדורגל" — the single source of truth,
 * used by the server engine (final points) and the client Live screen
 * (provisional points). Rules:
 *   - Exact score        → 3 points
 *   - Correct outcome    → 1 point (any draw counts as the same outcome as any other draw)
 *   - Wrong outcome      → 0 points
 * No stacking: an exact hit is 3, never 3+1.
 */

export interface Score {
  home: number;
  away: number;
}

export type Points = 0 | 1 | 3;

export interface ScoringResult {
  points: Points;
  isExact: boolean;
  isOutcome: boolean;
}

export type Outcome = 'home' | 'draw' | 'away';

export function outcomeOf(score: Score): Outcome {
  if (score.home > score.away) return 'home';
  if (score.home < score.away) return 'away';
  return 'draw';
}

export function scorePrediction(prediction: Score, result: Score): ScoringResult {
  if (prediction.home === result.home && prediction.away === result.away) {
    return { points: 3, isExact: true, isOutcome: true };
  }
  if (outcomeOf(prediction) === outcomeOf(result)) {
    return { points: 1, isExact: false, isOutcome: true };
  }
  return { points: 0, isExact: false, isOutcome: false };
}
