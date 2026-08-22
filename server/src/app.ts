import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { attachUser } from './auth/middleware.js';
import type { Db } from './db/index.js';
import type { Clock } from './lib/clock.js';
import { HttpError } from './lib/http-error.js';
import type { EngineEvents } from './engine/types.js';
import type { PushService } from './push/sender.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { historyRoutes } from './routes/history.js';
import { liveRoutes } from './routes/live.js';
import { profileRoutes } from './routes/profile.js';
import { pushRoutes } from './routes/push.js';
import { roundsRoutes } from './routes/rounds.js';
import { standingsRoutes } from './routes/standings.js';
import { statsRoutes } from './routes/stats.js';
import { mountStatic } from './static.js';

export interface AppDeps {
  db: Db;
  clock: Clock;
  events?: EngineEvents;
  push?: PushService;
}

/**
 * Express app factory. Everything time- or state-dependent is injected so
 * integration tests can run against an in-memory DB and a fake clock.
 */
export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(attachUser(deps.db, deps.clock));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, now: deps.clock.now().getTime() });
  });

  app.use('/api/auth', authRoutes(deps));
  app.use('/api/profile', profileRoutes(deps));
  app.use('/api', roundsRoutes(deps));
  app.use('/api', standingsRoutes(deps));
  app.use('/api', liveRoutes(deps));
  app.use('/api', historyRoutes(deps));
  app.use('/api', statsRoutes(deps));
  app.use('/api', pushRoutes(deps));
  app.use('/api/admin', adminRoutes(deps));

  mountStatic(app);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'VALIDATION',
        message: err.issues[0]?.message ?? 'קלט לא תקין',
        issues: err.issues,
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'INTERNAL', message: 'שגיאת שרת, נסו שוב' });
  });

  return app;
}
