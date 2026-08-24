import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtures, rounds, teams, users } from '../db/schema.js';
import { createFixture } from '../engine/fixture-admin.js';
import { enterFinalResult } from '../engine/scoring-engine.js';
import { SYSTEM_ACTOR } from '../lib/audit.js';
import { createTestApp, registerAgent, T0, type TestContext } from '../test/helpers.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('predictions & privacy', () => {
  let ctx: TestContext;
  let dror: request.Agent;
  let avi: request.Agent;
  let f1Id: number;
  let f2Id: number;
  let round1Id: number;

  beforeEach(async () => {
    ctx = await createTestApp();
    dror = (await registerAgent(ctx, 'dror')).agent;
    avi = (await registerAgent(ctx, 'avi')).agent;

    const teamIds = (await ctx.db.select().from(teams).orderBy(asc(teams.id))).map((t) => t.id);
    const round1 = (await ctx.db.select().from(rounds)).find((r) => r.number === 1)!;
    round1Id = round1.id;
    f1Id = (
      await createFixture(
        ctx,
        { roundId: round1Id, homeTeamId: teamIds[0]!, awayTeamId: teamIds[1]!, kickoffAt: T0.getTime() + DAY },
        SYSTEM_ACTOR,
      )
    ).id;
    f2Id = (
      await createFixture(
        ctx,
        { roundId: round1Id, homeTeamId: teamIds[2]!, awayTeamId: teamIds[3]!, kickoffAt: T0.getTime() + DAY + 2 * HOUR },
        SYSTEM_ACTOR,
      )
    ).id;
  });

  it('requires auth for every league endpoint', async () => {
    const anon = request(ctx.app);
    for (const path of ['/api/rounds', '/api/rounds/current', '/api/standings', '/api/home']) {
      expect((await anon.get(path)).status, path).toBe(401);
    }
    expect((await anon.put(`/api/predictions/${f1Id}`).send({ homePred: 1, awayPred: 0 })).status).toBe(401);
  });

  it('saves and updates predictions before lock', async () => {
    const first = await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 2, awayPred: 1 });
    expect(first.status).toBe(200);
    expect(first.body.prediction).toMatchObject({ homePred: 2, awayPred: 1 });

    const updated = await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 0, awayPred: 0 });
    expect(updated.status).toBe(200);
    expect(updated.body.prediction).toMatchObject({ homePred: 0, awayPred: 0 });
  });

  it('rejects invalid scores', async () => {
    expect((await dror.put(`/api/predictions/${f1Id}`).send({ homePred: -1, awayPred: 0 })).status).toBe(400);
    expect((await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 1.5, awayPred: 0 })).status).toBe(400);
    expect((await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 100, awayPred: 0 })).status).toBe(400);
  });

  it('locks ALL round predictions at the first kickoff', async () => {
    await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 1, awayPred: 0 });

    ctx.clock.set(new Date(T0.getTime() + DAY + 1)); // first game kicked off
    // Even the SECOND game (kickoff in 2h) is locked now
    const late = await dror.put(`/api/predictions/${f2Id}`).send({ homePred: 1, awayPred: 0 });
    expect(late.status).toBe(403);
    expect(late.body.error).toBe('ROUND_LOCKED');
    const change = await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 5, awayPred: 5 });
    expect(change.status).toBe(403);
  });

  it('hides others predictions before lock and reveals them after', async () => {
    await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 2, awayPred: 1 });
    await avi.put(`/api/predictions/${f1Id}`).send({ homePred: 0, awayPred: 3 });

    // Before lock: each sees only their own
    const aviView = await avi.get('/api/rounds/current');
    expect(aviView.status).toBe(200);
    const aviSeen = aviView.body.predictions as Array<{ userId: number; homePred: number }>;
    expect(aviSeen).toHaveLength(1);
    expect(aviSeen[0]).toMatchObject({ homePred: 0, awayPred: 3 });

    // But completion status shows who's done without leaking content
    const status = aviView.body.completionStatus as Array<{
      user: { username: string };
      filled: number;
      done: boolean;
    }>;
    const drorStatus = status.find((s) => s.user.username === 'dror')!;
    expect(drorStatus.filled).toBe(1);
    expect(drorStatus.done).toBe(false);

    // After lock: everyone's predictions for the whole round are visible
    ctx.clock.set(new Date(T0.getTime() + DAY + 1));
    const aviAfter = await avi.get(`/api/rounds/${round1Id}`);
    const seenAfter = aviAfter.body.predictions as Array<{ userId: number }>;
    expect(seenAfter).toHaveLength(2);
  });

  it('reports completion via the done endpoint', async () => {
    await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 1, awayPred: 0 });
    const partial = await dror.post(`/api/rounds/${round1Id}/done`);
    expect(partial.body).toMatchObject({ complete: false, total: 2 });
    expect(partial.body.missing).toEqual([f2Id]);

    await dror.put(`/api/predictions/${f2Id}`).send({ homePred: 1, awayPred: 1 });
    const full = await dror.post(`/api/rounds/${round1Id}/done`);
    expect(full.body).toMatchObject({ complete: true, missing: [] });
  });

  it('enforces the completion-game window and privacy', async () => {
    // Simulate a rescheduled completion game: reopens 7d before its new kickoff
    const newKickoff = T0.getTime() + 20 * DAY;
    await ctx.db
      .update(fixtures)
      .set({
        isCompletion: true,
        predictionOpenAt: new Date(newKickoff - 7 * DAY),
        kickoffAt: new Date(newKickoff),
      })
      .where(eq(fixtures.id, f2Id));

    // Too early — window not open yet
    const early = await dror.put(`/api/predictions/${f2Id}`).send({ homePred: 1, awayPred: 0 });
    expect(early.status).toBe(403);

    // Window open
    ctx.clock.set(new Date(newKickoff - 6 * DAY));
    const ok = await dror.put(`/api/predictions/${f2Id}`).send({ homePred: 1, awayPred: 0 });
    expect(ok.status).toBe(200);

    // Round lock long passed, but the completion prediction stays hidden until ITS kickoff
    const aviView = await avi.get(`/api/rounds/${round1Id}`);
    const seen = aviView.body.predictions as Array<{ fixtureId: number; userId: number }>;
    expect(seen.filter((p) => p.fixtureId === f2Id)).toHaveLength(0);

    // After its kickoff it becomes visible
    ctx.clock.set(new Date(newKickoff + 1));
    const aviLater = await avi.get(`/api/rounds/${round1Id}`);
    const seenLater = aviLater.body.predictions as Array<{ fixtureId: number }>;
    expect(seenLater.filter((p) => p.fixtureId === f2Id)).toHaveLength(1);
  });

  it('serves standings and home aggregates', async () => {
    await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 2, awayPred: 1 });
    await avi.put(`/api/predictions/${f1Id}`).send({ homePred: 0, awayPred: 1 });

    const homeBefore = await dror.get('/api/home');
    expect(homeBefore.body.activeRound).toMatchObject({ myFilled: 1, total: 2 });
    expect(homeBefore.body.leagueName).toBe('0 מושג בכדורגל');

    ctx.clock.set(new Date(T0.getTime() + DAY + 3 * HOUR));
    await enterFinalResult(ctx, f1Id, { homeScore: 2, awayScore: 1 }, SYSTEM_ACTOR);
    await ctx.db.update(fixtures).set({ status: 'cancelled' }).where(eq(fixtures.id, f2Id));
    await enterFinalResult(ctx, f1Id, { homeScore: 2, awayScore: 1 }, SYSTEM_ACTOR); // re-enter triggers close

    const standings = await dror.get('/api/standings');
    const entries = standings.body.standings as Array<{
      user: { username: string };
      totalPoints: number;
      rank: number;
      titles: string[];
    }>;
    const drorEntry = entries.find((e) => e.user.username === 'dror')!;
    expect(drorEntry).toMatchObject({ totalPoints: 3, rank: 1 });
    expect(drorEntry.titles).toContain('leader');

    const summary = await dror.get(`/api/rounds/${round1Id}/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.entries[0].user.username).toBe('dror');
    expect(summary.body.entries[0].isRoundWinner).toBe(true);
  });

  it('never leaks another users prediction in any pre-lock payload', async () => {
    await dror.put(`/api/predictions/${f1Id}`).send({ homePred: 7, awayPred: 7 });

    for (const path of ['/api/rounds/current', `/api/rounds/${round1Id}`, '/api/home']) {
      const res = await avi.get(path);
      expect(JSON.stringify(res.body), path).not.toContain('"homePred":7');
    }
  });
});
