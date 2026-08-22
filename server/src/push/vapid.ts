import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Loads (or generates on first boot) the VAPID key pair. Keys live in
 * data/vapid.json — outside the DB, so DB backups never leak them. Losing
 * the file only means everyone re-enables notifications once.
 */
export function ensureVapidKeys(dataDir: string): VapidKeys {
  const file = path.join(dataDir, 'vapid.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as VapidKeys;
  }
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  return keys;
}

export function configureWebPush(keys: VapidKeys): void {
  webpush.setVapidDetails('mailto:admin@efes-musag.invalid', keys.publicKey, keys.privateKey);
}
