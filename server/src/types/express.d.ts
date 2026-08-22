import type { users } from '../db/schema.js';

declare global {
  namespace Express {
    interface Request {
      user?: typeof users.$inferSelect;
      sessionRowId?: number;
    }
  }
}

export {};
