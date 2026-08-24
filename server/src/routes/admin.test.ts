import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { rounds, teams, users } from '../db/schema.js';
import { createTestApp, registerAgent, T0, type TestContext } from '../test/helpers.js';

const DAY = 24 * 60 * 60 * 1000;

describe('admin routes', () => {
  let ctx: TestContext;
  let admin: request.Agent;
  let user: request.Agent;
  let aviId: number;
  let teamIds: number[];
  let round1Id: number;

  beforeEach(async () => {
    ctx = await createTestApp();
    admin = (await registerAgent(ctx, 'dror')).agent;
    const aviReg = await registerAgent(ctx, 'avi');
    user = aviReg.agent;
    aviId = aviReg.res.body.user.id;
    await ctx.db.update(users).set({ role: 'ADMIN' }).where(eq(users.username, 'dror'));
    teamIds = (await ctx.db.select().from(teams).orderBy(asc(teams.id))).map((t) => t.id);
    round1Id = (await ctx.db.select().from(rounds)).find((r) => r.number === 1)!.id;
  });

  it('rejects non-admins on every admin endpoint', async () => {
    for (const [method, path] of [
      ['get', '/api/admin/users'],
      ['get', '/api/admin/audit'],
      ['post', '/api/admin/teams'],
      ['post', '/api/admin/fixtures'],
      ['patch', '/api/admin/settings'],
    ] as const) {
      const res = await user[method](path).send({});
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('manages users: promote, reset password, delete', async () => {
    const list = await admin.get('/api/admin/users');
    expect(list.status).toBe(200);
    expect(list.body.users).toHaveLength(2);

    // Reset avi's password → old sessions die, new password works
    const reset = await admin
      .post(`/api/admin/users/${aviId}/reset-password`)
      .send({ newPassword: 'freshpass1' });
    expect(reset.status).toBe(200);
    expect((await user.get('/api/auth/me')).body.user).toBeNull();
    const relogin = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'avi', password: 'freshpass1' });
    expect(relogin.status).toBe(200);

    const promote = await admin.post(`/api/admin/users/${aviId}/promote`);
    expect(promote.status).toBe(200);
    expect((await ctx.db.select().from(users)).find((u) => u.id === aviId)?.role).toBe('ADMIN');

    const del = await admin.delete(`/api/admin/users/${aviId}`);
    expect(del.status).toBe(200);
    expect(await ctx.db.select().from(users)).toHaveLength(1);
  });

  it('manages teams and protects teams in use', async () => {
    const created = await admin
      .post('/api/admin/teams')
      .send({ name: 'הפועל חולון', shortName: 'חולון', color: '#123456' });
    expect(created.status).toBe(201);

    const renamed = await admin
      .patch(`/api/admin/teams/${created.body.team.id}`)
      .send({ shortName: 'חול׳' });
    expect(renamed.body.team.shortName).toBe('חול׳');

    const deleted = await admin.delete(`/api/admin/teams/${created.body.team.id}`);
    expect(deleted.status).toBe(200);

    // A team with a fixture cannot be deleted
    await admin.post('/api/admin/fixtures').send({
      roundId: round1Id,
      homeTeamId: teamIds[0],
      awayTeamId: teamIds[1],
      kickoffAt: T0.getTime() + DAY,
    });
    const blocked = await admin.delete(`/api/admin/teams/${teamIds[0]}`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toBe('TEAM_IN_USE');
  });

  it('runs a full fixture lifecycle over HTTP', async () => {
    const created = await admin.post('/api/admin/fixtures').send({
      roundId: round1Id,
      homeTeamId: teamIds[0],
      awayTeamId: teamIds[1],
      kickoffAt: T0.getTime() + DAY,
    });
    expect(created.status).toBe(201);
    const fixtureId = created.body.fixture.id;

    await user.put(`/api/predictions/${fixtureId}`).send({ homePred: 1, awayPred: 0 });

    ctx.clock.set(new Date(T0.getTime() + DAY + 30 * 60 * 1000));
    const live = await admin
      .patch(`/api/admin/fixtures/${fixtureId}/live`)
      .send({ homeScore: 1, awayScore: 0, liveMinute: "30'" });
    expect(live.status).toBe(200);

    const liveView = await user.get('/api/live');
    expect(liveView.body.hasLive).toBe(true);
    expect(liveView.body.fixtures[0].predictions[0].provisionalPoints).toBe(3);

    const result = await admin
      .post(`/api/admin/fixtures/${fixtureId}/result`)
      .send({ homeScore: 2, awayScore: 0 });
    expect(result.status).toBe(200);

    const summary = await user.get(`/api/rounds/${round1Id}/summary`);
    expect(summary.status).toBe(200);
    const aviEntry = summary.body.entries.find(
      (e: { user: { username: string } }) => e.user.username === 'avi',
    );
    expect(aviEntry.points).toBe(1);

    // Audit trail recorded the flow
    const audit = await admin.get('/api/admin/audit');
    const actions = audit.body.entries.map((e: { action: string }) => e.action);
    expect(actions).toContain('fixture.created');
    expect(actions).toContain('fixture.live_updated');
    expect(actions).toContain('fixture.result_entered');
  });

  it('postpones and reschedules over HTTP', async () => {
    const f1 = (
      await admin.post('/api/admin/fixtures').send({
        roundId: round1Id,
        homeTeamId: teamIds[0],
        awayTeamId: teamIds[1],
        kickoffAt: T0.getTime() + DAY,
      })
    ).body.fixture.id;
    await admin.post('/api/admin/fixtures').send({
      roundId: round1Id,
      homeTeamId: teamIds[2],
      awayTeamId: teamIds[3],
      kickoffAt: T0.getTime() + DAY + 2 * 60 * 60 * 1000,
    });

    expect((await admin.post(`/api/admin/fixtures/${f1}/postpone`)).status).toBe(200);
    const reschedule = await admin
      .post(`/api/admin/fixtures/${f1}/reschedule`)
      .send({ kickoffAt: T0.getTime() + 20 * DAY });
    expect(reschedule.status).toBe(200);

    const roundView = await admin.get(`/api/rounds/${round1Id}`);
    const fixture = roundView.body.fixtures.find((f: { id: number }) => f.id === f1);
    expect(fixture.isCompletion).toBe(true);
    expect(fixture.predictionOpenAt).toBe(T0.getTime() + 13 * DAY);
  });

  it('fixes a prediction and updates settings', async () => {
    const f1 = (
      await admin.post('/api/admin/fixtures').send({
        roundId: round1Id,
        homeTeamId: teamIds[0],
        awayTeamId: teamIds[1],
        kickoffAt: T0.getTime() + DAY,
      })
    ).body.fixture.id;

    ctx.clock.set(new Date(T0.getTime() + 2 * DAY)); // locked
    const fix = await admin
      .put('/api/admin/predictions')
      .send({ userId: aviId, fixtureId: f1, homePred: 4, awayPred: 2 });
    expect(fix.status).toBe(200);

    const settings = await admin.patch('/api/admin/settings').send({ inviteCode: 'NEWCODE1' });
    expect(settings.body.settings.inviteCode).toBe('NEWCODE1');
    const badReg = await registerAgent(ctx, 'newguy', { inviteCode: 'TEST1234' });
    expect(badReg.res.status).toBe(400);
    const goodReg = await registerAgent(ctx, 'newguy2', { inviteCode: 'NEWCODE1' });
    expect(goodReg.res.status).toBe(201);
  });

  it('backfills a prediction for a round that was already played', async () => {
    const fixtureId = (
      await admin.post('/api/admin/fixtures').send({
        roundId: round1Id,
        homeTeamId: teamIds[0],
        awayTeamId: teamIds[1],
        kickoffAt: T0.getTime() + DAY,
      })
    ).body.fixture.id;

    // The game is played and finished without anyone having predicted it.
    ctx.clock.set(new Date(T0.getTime() + DAY + 2 * 60 * 60 * 1000));
    await admin.post(`/api/admin/fixtures/${fixtureId}/result`).send({ homeScore: 2, awayScore: 1 });

    const view = await admin.get(`/api/admin/rounds/${round1Id}/predictions`);
    expect(view.status).toBe(200);
    expect(view.body.fixtures).toHaveLength(1);
    expect(view.body.fixtures[0]).toMatchObject({ status: 'finished', homeScore: 2, awayScore: 1 });
    expect(view.body.users).toHaveLength(2);
    expect(view.body.predictions).toEqual([]);

    const saved = await admin
      .put('/api/admin/predictions')
      .send({ userId: aviId, fixtureId, homePred: 2, awayPred: 1 });
    expect(saved.status).toBe(200);

    const after = await admin.get(`/api/admin/rounds/${round1Id}/predictions`);
    expect(after.body.predictions).toEqual([
      { userId: aviId, fixtureId, homePred: 2, awayPred: 1 },
    ]);

    // An exact hit entered after the fact still scores.
    const standings = await admin.get('/api/standings');
    const aviRow = standings.body.standings.find(
      (s: { user: { id: number } }) => s.user.id === aviId,
    );
    expect(aviRow.totalPoints).toBe(3);
  });

  it('rejects non-admins on the round predictions view', async () => {
    const res = await user.get(`/api/admin/rounds/${round1Id}/predictions`);
    expect(res.status).toBe(403);
  });

  it('shows the current round fixtures and their real results on Home', async () => {
    const played = (
      await admin.post('/api/admin/fixtures').send({
        roundId: round1Id,
        homeTeamId: teamIds[0],
        awayTeamId: teamIds[1],
        kickoffAt: T0.getTime() + DAY,
      })
    ).body.fixture.id;
    await admin.post('/api/admin/fixtures').send({
      roundId: round1Id,
      homeTeamId: teamIds[2],
      awayTeamId: teamIds[3],
      kickoffAt: T0.getTime() + 2 * DAY,
    });

    // First game done, second still ahead — the round stays open.
    ctx.clock.set(new Date(T0.getTime() + DAY + 2 * 60 * 60 * 1000));
    await admin.post(`/api/admin/fixtures/${played}/result`).send({ homeScore: 3, awayScore: 0 });

    const home = await user.get('/api/home');
    expect(home.status).toBe(200);
    expect(home.body.activeRound.fixtures).toHaveLength(2);
    expect(home.body.activeRound.fixtures[0]).toMatchObject({
      id: played,
      status: 'finished',
      homeScore: 3,
      awayScore: 0,
    });
    expect(home.body.activeRound.fixtures[1]).toMatchObject({ status: 'scheduled', homeScore: null });
    expect(home.body.activeRound.round.finishedCount).toBe(1);
  });

  it('exports the whole league as a downloadable backup', async () => {
    const res = await admin.get('/api/admin/backup').buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('league-backup.json');

    // The export has to be restorable, so every table travels with it.
    expect(res.body.users.map((u: { username: string }) => u.username).sort()).toEqual([
      'avi',
      'dror',
    ]);
    expect(res.body.teams.length).toBeGreaterThan(0);
    expect(res.body.rounds.length).toBeGreaterThan(0);
    expect(res.body.leagueSettings[0].inviteCode).toBeTruthy();
    expect(res.body.exportedAt).toBeTruthy();
  });
});
