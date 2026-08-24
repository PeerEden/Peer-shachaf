import { pushSubscriptionSchema } from '../../../shared/src/index.js';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireAuth } from '../auth/middleware.js';
import { pushSubscriptions } from '../db/schema.js';

export function pushRoutes(deps: AppDeps): Router {
  const router = Router();
  const { db } = deps;

  router.use(requireAuth);

  router.get('/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: deps.push?.publicKey ?? null });
  });

  router.post('/push/subscribe', async (req, res) => {
    const input = pushSubscriptionSchema.parse(req.body);
    const user = req.user!;
    await db.insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: req.get('user-agent') ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: user.id,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: req.get('user-agent') ?? null,
          failCount: 0,
        },
      });
    res.status(201).json({ ok: true });
  });

  router.delete('/push/subscribe', async (req, res) => {
    const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
    await db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, req.user!.id)));
    res.json({ ok: true });
  });

  return router;
}
