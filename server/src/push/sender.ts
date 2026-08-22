import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import type { Db } from '../db/index.js';
import { notificationLog, pushSubscriptions } from '../db/schema.js';

export interface PushMessage {
  /** Globally unique per (event, recipient) — the idempotency key. */
  eventKey: string;
  userId: number;
  type: string;
  title: string;
  body: string;
  url?: string;
}

export type PushTransport = (
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
) => Promise<void>;

export const webPushTransport: PushTransport = async (subscription, payload) => {
  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    payload,
  );
};

interface TransportError {
  statusCode?: number;
}

/**
 * Sends notifications exactly once per event key: an INSERT OR IGNORE into
 * notification_log claims the event before anything is sent, so restarts and
 * overlapping ticks can never double-notify. Dead subscriptions (404/410)
 * are pruned on the spot.
 */
export class PushService {
  constructor(
    private db: Db,
    private transport: PushTransport,
    public readonly publicKey: string | null,
  ) {}

  async sendEvent(message: PushMessage): Promise<boolean> {
    const claimed = this.db
      .insert(notificationLog)
      .values({
        eventKey: message.eventKey,
        userId: message.userId,
        type: message.type,
        title: message.title,
        body: message.body,
        status: 'sent',
      })
      .onConflictDoNothing()
      .returning()
      .get();
    if (!claimed) return false; // already handled (idempotency)

    const subscriptions = this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, message.userId))
      .all();

    if (subscriptions.length === 0) {
      this.db
        .update(notificationLog)
        .set({ status: 'skipped_no_sub' })
        .where(eq(notificationLog.id, claimed.id))
        .run();
      return false;
    }

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url ?? '/',
    });

    let anySuccess = false;
    let lastError: string | null = null;
    for (const subscription of subscriptions) {
      try {
        await this.transport(subscription, payload);
        anySuccess = true;
        this.db
          .update(pushSubscriptions)
          .set({ lastSuccessAt: new Date(), failCount: 0 })
          .where(eq(pushSubscriptions.id, subscription.id))
          .run();
      } catch (error) {
        const status = (error as TransportError).statusCode;
        lastError = `endpoint ${subscription.id}: ${status ?? String(error)}`;
        if (status === 404 || status === 410) {
          this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id)).run();
        } else {
          this.db
            .update(pushSubscriptions)
            .set({ failCount: subscription.failCount + 1 })
            .where(eq(pushSubscriptions.id, subscription.id))
            .run();
        }
      }
    }

    if (!anySuccess) {
      this.db
        .update(notificationLog)
        .set({ status: 'failed', error: lastError })
        .where(eq(notificationLog.id, claimed.id))
        .run();
    }
    return anySuccess;
  }
}
