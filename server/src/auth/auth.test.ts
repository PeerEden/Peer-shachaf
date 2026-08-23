import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { users } from '../db/schema.js';
import { createTestApp, registerAgent, TEST_INVITE, type TestContext } from '../test/helpers.js';

describe('auth', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('registers with a valid invite code and starts a session', async () => {
    const { agent, res } = await registerAgent(ctx, 'dror');
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('dror');

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.username).toBe('dror');
  });

  it('makes the founder an admin and everyone after them a plain user', async () => {
    const founder = await registerAgent(ctx, 'dror');
    expect(founder.res.body.user.role).toBe('ADMIN');

    const joiner = await registerAgent(ctx, 'avi', { phone: '0522222222' });
    expect(joiner.res.body.user.role).toBe('USER');
  });

  it('rejects a wrong invite code', async () => {
    const { res } = await registerAgent(ctx, 'dror', { inviteCode: 'WRONG' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BAD_INVITE_CODE');
  });

  it('accepts the invite code case-insensitively', async () => {
    const { res } = await registerAgent(ctx, 'dror', { inviteCode: TEST_INVITE.toLowerCase() });
    expect(res.status).toBe(201);
  });

  it('rejects duplicate usernames and phones', async () => {
    await registerAgent(ctx, 'dror', { phone: '0521111111' });

    const dupUsername = await registerAgent(ctx, 'dror', { phone: '0522222222' });
    expect(dupUsername.res.status).toBe(409);
    expect(dupUsername.res.body.error).toBe('USERNAME_TAKEN');

    const dupPhone = await registerAgent(ctx, 'avi', { phone: '0521111111' });
    expect(dupPhone.res.status).toBe(409);
    expect(dupPhone.res.body.error).toBe('PHONE_TAKEN');
  });

  it('normalizes phone formats when checking uniqueness', async () => {
    await registerAgent(ctx, 'dror', { phone: '052-111-1111' });
    const dup = await registerAgent(ctx, 'avi', { phone: '+972521111111' });
    expect(dup.res.status).toBe(409);
    expect(dup.res.body.error).toBe('PHONE_TAKEN');
  });

  it('logs in and out', async () => {
    await registerAgent(ctx, 'dror', { password: 'secret123' });

    const agent = request.agent(ctx.app);
    const bad = await agent.post('/api/auth/login').send({ username: 'dror', password: 'nope99' });
    expect(bad.status).toBe(401);

    const ok = await agent.post('/api/auth/login').send({ username: 'DROR', password: 'secret123' });
    expect(ok.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.username).toBe('dror');

    await agent.post('/api/auth/logout');
    const meAfter = await agent.get('/api/auth/me');
    expect(meAfter.body.user).toBeNull();
  });

  it('keeps the session alive across a year via sliding renewal', async () => {
    const { agent } = await registerAgent(ctx, 'dror');

    for (let i = 0; i < 6; i++) {
      ctx.clock.advance(80 * 24 * 60 * 60 * 1000);
      const me = await agent.get('/api/auth/me');
      expect(me.body.user?.username).toBe('dror');
    }
  });

  it('expires an unused session after a year', async () => {
    const { agent } = await registerAgent(ctx, 'dror');
    ctx.clock.advance(366 * 24 * 60 * 60 * 1000);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user).toBeNull();
  });

  it('changes password and invalidates other sessions', async () => {
    const { agent } = await registerAgent(ctx, 'dror', { password: 'secret123' });

    const other = request.agent(ctx.app);
    await other.post('/api/auth/login').send({ username: 'dror', password: 'secret123' });
    expect((await other.get('/api/auth/me')).body.user).not.toBeNull();

    const change = await agent
      .post('/api/profile/password')
      .send({ currentPassword: 'secret123', newPassword: 'newpass1' });
    expect(change.status).toBe(200);

    expect((await other.get('/api/auth/me')).body.user).toBeNull();
    expect((await agent.get('/api/auth/me')).body.user).not.toBeNull();

    const relog = request.agent(ctx.app);
    const res = await relog.post('/api/auth/login').send({ username: 'dror', password: 'newpass1' });
    expect(res.status).toBe(200);
  });

  it('updates profile fields and enforces phone uniqueness', async () => {
    await registerAgent(ctx, 'avi', { phone: '0523333333' });
    const { agent } = await registerAgent(ctx, 'dror');

    const rename = await agent.patch('/api/profile').send({ displayName: 'דרור המלך' });
    expect(rename.body.user.displayName).toBe('דרור המלך');

    const clash = await agent.patch('/api/profile').send({ phone: '0523333333' });
    expect(clash.status).toBe(409);
  });

  it('validates registration input', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({
      username: 'a',
      password: '123',
      displayName: 'א',
      phone: '12345',
      inviteCode: TEST_INVITE,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('keeps user rows with hashed passwords only', async () => {
    await registerAgent(ctx, 'dror', { password: 'secret123' });
    const row = ctx.db.select().from(users).where(eq(users.username, 'dror')).get()!;
    expect(row.passwordHash).not.toContain('secret123');
    expect(row.passwordHash.startsWith('$2')).toBe(true);
  });
});
