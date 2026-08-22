/**
 * Injectable clock. All server logic that depends on "now" (locking, privacy,
 * scheduler) must consume time through this interface, never Date.now(),
 * so tests and the DEV_TOOLS time-travel endpoint can move time.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** System time plus a mutable offset — used by tests and /api/dev/clock. */
export class OffsetClock implements Clock {
  offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

/** Fully manual clock for unit/integration tests. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(next: Date): void {
    this.current = next;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
