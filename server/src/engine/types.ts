import type { Db } from '../db/index.js';
import type { Clock } from '../lib/clock.js';

/**
 * Fired by the engine after its transaction commits, so the push module can
 * notify without the engine knowing anything about notifications.
 */
export interface EngineEvents {
  onRoundClosed(roundId: number): void;
  onRoundOpened(roundId: number): void;
  onFixturePostponed(fixtureId: number): void;
  onCompletionScheduled(fixtureId: number): void;
}

export interface EngineCtx {
  db: Db;
  clock: Clock;
  events?: EngineEvents;
}
