import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { fixtures, rounds, roundUserStats, teams, users } from '../db/schema.js';
import type { EngineEvents } from '../engine/types.js';
import { fmtHebrewTime } from './texts.js';
import type { PushService } from './sender.js';

/**
 * Turns engine lifecycle events into notifications for everyone. The
 * scheduler's per-minute tick is the delivery backstop; these fire the
 * moment something happens. Errors are logged, never thrown into the engine.
 */
export function buildPushEvents(db: Db, push: PushService): EngineEvents {
  const allUserIds = async () => (await db.select({ id: users.id }).from(users)).map((u) => u.id);
  const fire = (promise: Promise<unknown>) => {
    promise.catch((error) => console.error('push event failed:', error));
  };

  const fixtureLabel = async (fixtureId: number): Promise<string> => {
    const [fixture] = await db.select().from(fixtures).where(eq(fixtures.id, fixtureId));
    if (!fixture) return 'משחק';
    const [home] = await db.select().from(teams).where(eq(teams.id, fixture.homeTeamId));
    const [away] = await db.select().from(teams).where(eq(teams.id, fixture.awayTeamId));
    return `${home?.name ?? '?'} נגד ${away?.name ?? '?'}`;
  };

  const handlers = {
    async onRoundClosed(roundId: number) {
      const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
      if (!round) return;
      const winners = await db
        .select({ stat: roundUserStats, user: users })
        .from(roundUserStats)
        .innerJoin(users, eq(roundUserStats.userId, users.id))
        .where(and(eq(roundUserStats.roundId, roundId), eq(roundUserStats.isRoundWinner, true)));
      const body =
        winners.length > 0
          ? `👑 ${winners.map((w) => w.user.displayName).join(' + ')} עם ${winners[0]!.stat.points} נקודות!`
          : 'בלי מנצח הפעם… מחזור קשה לכולם 💀';
      for (const userId of await allUserIds()) {
        fire(
          push.sendEvent({
            eventKey: `round:${roundId}:summary:user:${userId}`,
            userId,
            type: 'round_summary',
            title: `🏁 ${round.name} הסתיים`,
            body,
            url: `/rounds/${roundId}/summary`,
          }),
        );
      }
    },

    async onRoundOpened(roundId: number) {
      const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
      if (!round) return;
      for (const userId of await allUserIds()) {
        fire(
          push.sendEvent({
            eventKey: `round:${roundId}:open:user:${userId}`,
            userId,
            type: 'new_round_open',
            title: `🆕 ${round.name} נפתח לניחושים`,
            body: 'חלון הניחושים נפתח — תפוס מקום על הפודיום!',
            url: '/predictions',
          }),
        );
      }
    },

    async onFixturePostponed(fixtureId: number) {
      const label = await fixtureLabel(fixtureId);
      const [fixture] = await db.select().from(fixtures).where(eq(fixtures.id, fixtureId));
      // The kickoff in the key distinguishes a second postponement (after a
      // reschedule) from the first — each deserves its own notification.
      const nonce = fixture?.kickoffAt.getTime() ?? 0;
      for (const userId of await allUserIds()) {
        fire(
          push.sendEvent({
            eventKey: `fixture:${fixtureId}:postponed:${nonce}:user:${userId}`,
            userId,
            type: 'game_postponed',
            title: '⏸️ משחק נדחה',
            body: `${label} נדחה. הניחושים עליו בוטלו — נודיע כשייקבע מועד חדש.`,
            url: '/',
          }),
        );
      }
    },

    async onCompletionScheduled(fixtureId: number) {
      const [fixture] = await db.select().from(fixtures).where(eq(fixtures.id, fixtureId));
      if (!fixture) return;
      const label = await fixtureLabel(fixtureId);
      const windowAlreadyOpen =
        fixture.predictionOpenAt !== null && fixture.predictionOpenAt.getTime() <= Date.now();
      for (const userId of await allUserIds()) {
        fire(
          push.sendEvent({
            eventKey: `fixture:${fixtureId}:rescheduled:${fixture.kickoffAt.getTime()}:user:${userId}`,
            userId,
            type: 'completion_open',
            title: '🗓️ נקבע מועד חדש למשחק שנדחה',
            body: `${label} ישוחק ב־${fmtHebrewTime(fixture.kickoffAt.getTime())}. ${
              windowAlreadyOpen ? 'אפשר לנחש כבר עכשיו!' : 'הניחוש ייפתח שבוע לפני.'
            }`,
            url: '/predictions',
          }),
        );
      }
    },
  };

  // The engine fires these without awaiting, so none of them may reject:
  // a notification that fails must never take down the action that caused it.
  return {
    onRoundClosed: (roundId) => fire(handlers.onRoundClosed(roundId)),
    onRoundOpened: (roundId) => fire(handlers.onRoundOpened(roundId)),
    onFixturePostponed: (fixtureId) => fire(handlers.onFixturePostponed(fixtureId)),
    onCompletionScheduled: (fixtureId) => fire(handlers.onCompletionScheduled(fixtureId)),
  };
}
