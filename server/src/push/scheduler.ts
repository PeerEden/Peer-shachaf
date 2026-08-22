import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { fixtures, predictions, rounds, users } from '../db/schema.js';
import { fmtHebrewTime } from './texts.js';
import type { PushService } from './sender.js';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/**
 * Stateless reminder engine. tick(now) derives every due notification purely
 * from DB state and relies on the sender's unique event keys for idempotency,
 * so restarts, missed minutes and overlapping ticks are all safe. Reminders
 * whose moment passed entirely (e.g. server was down through the lock) are
 * dropped, never late-sent.
 */
export class PushScheduler {
  constructor(
    private db: Db,
    private push: PushService,
  ) {}

  async tick(now: Date): Promise<void> {
    await this.roundLockReminders(now);
    await this.completionGameReminders(now);
  }

  private allUserIds(): number[] {
    return this.db.select({ id: users.id }).from(users).all().map((u) => u.id);
  }

  /** Users still missing at least one prediction among the given fixtures. */
  private usersWithMissing(fixtureIds: number[]): number[] {
    const all = this.allUserIds();
    if (fixtureIds.length === 0) return [];
    const rows = this.db
      .select({ userId: predictions.userId, fixtureId: predictions.fixtureId })
      .from(predictions)
      .where(inArray(predictions.fixtureId, fixtureIds))
      .all();
    const countByUser = new Map<number, number>();
    for (const row of rows) countByUser.set(row.userId, (countByUser.get(row.userId) ?? 0) + 1);
    return all.filter((id) => (countByUser.get(id) ?? 0) < fixtureIds.length);
  }

  private async roundLockReminders(now: Date): Promise<void> {
    const openRounds = this.db.select().from(rounds).where(eq(rounds.status, 'open')).all();
    for (const round of openRounds) {
      if (!round.lockAt) continue;
      const lockMs = round.lockAt.getTime();
      if (now.getTime() >= lockMs) continue; // stale — never send after lock

      const roundFixtures = this.db
        .select()
        .from(fixtures)
        .where(eq(fixtures.roundId, round.id))
        .all()
        .filter((f) => !f.isCompletion && f.status === 'scheduled');
      if (roundFixtures.length === 0) continue;
      const fixtureIds = roundFixtures.map((f) => f.id);
      const lockTime = fmtHebrewTime(lockMs);

      // lockMs is part of every key: if the lock moves (e.g. the earliest
      // game is postponed pre-lock), fresh reminders fire for the new time.
      if (now.getTime() >= lockMs - 24 * HOUR) {
        for (const userId of this.allUserIds()) {
          await this.push.sendEvent({
            eventKey: `round:${round.id}:lock24h:${lockMs}:user:${userId}`,
            userId,
            type: 'lock_24h',
            title: `⏳ ${round.name} ננעל מחר`,
            body: `הניחושים ננעלים ב־${lockTime}. הספקת לנחש הכל?`,
            url: '/predictions',
          });
        }
      }
      if (now.getTime() >= lockMs - 3 * HOUR) {
        for (const userId of this.usersWithMissing(fixtureIds)) {
          await this.push.sendEvent({
            eventKey: `round:${round.id}:lock3h:${lockMs}:user:${userId}`,
            userId,
            type: 'lock_3h',
            title: `⚠️ 3 שעות לנעילת ${round.name}`,
            body: 'חסרים לך ניחושים! עוד רגע זה ננעל.',
            url: '/predictions',
          });
        }
      }
      if (now.getTime() >= lockMs - 30 * MINUTE) {
        for (const userId of this.usersWithMissing(fixtureIds)) {
          await this.push.sendEvent({
            eventKey: `round:${round.id}:lock30m:${lockMs}:user:${userId}`,
            userId,
            type: 'lock_30m',
            title: `🚨 חצי שעה לנעילת ${round.name}!`,
            body: 'זה עכשיו או 0 נקודות. רוץ לנחש!',
            url: '/predictions',
          });
        }
      }
    }
  }

  private async completionGameReminders(now: Date): Promise<void> {
    const completions = this.db
      .select()
      .from(fixtures)
      .where(and(eq(fixtures.isCompletion, true), eq(fixtures.status, 'scheduled')))
      .all();
    for (const fixture of completions) {
      const kickoffMs = fixture.kickoffAt.getTime();
      if (now.getTime() >= kickoffMs) continue;
      if (!fixture.predictionOpenAt || now.getTime() < fixture.predictionOpenAt.getTime()) continue;

      // kickoffMs in the key: a second reschedule gets fresh reminders.
      for (const userId of this.allUserIds()) {
        await this.push.sendEvent({
          eventKey: `fixture:${fixture.id}:completion_open:${kickoffMs}:user:${userId}`,
          userId,
          type: 'completion_open',
          title: '🗓️ משחק השלמה פתוח לניחוש',
          body: `המשחק שנדחה ישוחק ב־${fmtHebrewTime(kickoffMs)} — אפשר לנחש מחדש.`,
          url: '/predictions',
        });
      }

      const missing = this.usersWithMissing([fixture.id]);
      if (now.getTime() >= kickoffMs - 3 * HOUR) {
        for (const userId of missing) {
          await this.push.sendEvent({
            eventKey: `fixture:${fixture.id}:c3h:${kickoffMs}:user:${userId}`,
            userId,
            type: 'completion_lock_3h',
            title: '⚠️ 3 שעות למשחק ההשלמה',
            body: 'עוד לא ניחשת את משחק ההשלמה!',
            url: '/predictions',
          });
        }
      }
      if (now.getTime() >= kickoffMs - 30 * MINUTE) {
        for (const userId of missing) {
          await this.push.sendEvent({
            eventKey: `fixture:${fixture.id}:c30m:${kickoffMs}:user:${userId}`,
            userId,
            type: 'completion_lock_30m',
            title: '🚨 חצי שעה למשחק ההשלמה!',
            body: 'הניחוש ננעל בשריקת הפתיחה.',
            url: '/predictions',
          });
        }
      }
    }
  }
}
