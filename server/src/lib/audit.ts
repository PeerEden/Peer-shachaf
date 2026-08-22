import type { Db } from '../db/index.js';
import { auditLog } from '../db/schema.js';

export interface Actor {
  id: number | null;
  name: string;
}

export const SYSTEM_ACTOR: Actor = { id: null, name: 'system' };

export function audit(
  db: Db,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | number | null,
  before: unknown,
  after: unknown,
): void {
  db.insert(auditLog)
    .values({
      actorUserId: actor.id,
      actorName: actor.name,
      action,
      entityType,
      entityId: entityId === null ? null : String(entityId),
      beforeJson: before === undefined || before === null ? null : JSON.stringify(before),
      afterJson: after === undefined || after === null ? null : JSON.stringify(after),
    })
    .run();
}
