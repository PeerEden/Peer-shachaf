import { createHash, randomBytes } from 'node:crypto';

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateInviteCode(): string {
  // Unambiguous uppercase letters + digits, easy to share in a WhatsApp group.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
}
