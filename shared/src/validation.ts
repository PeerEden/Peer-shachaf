import { z } from 'zod';

/** Normalizes an Israeli mobile number to the canonical 05XXXXXXXX form. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return digits;
  if (/^9725\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return null;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'מספר טלפון לא תקין (נדרש מספר נייד ישראלי)' });
      return z.NEVER;
    }
    return normalized;
  });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.-]{3,20}$/, 'שם משתמש: 3–20 תווים באנגלית, ספרות, נקודה, מקף או קו תחתון');

export const passwordSchema = z.string().min(6, 'סיסמה: לפחות 6 תווים').max(100);

export const displayNameSchema = z.string().trim().min(2, 'שם תצוגה: לפחות 2 תווים').max(30);

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  phone: phoneSchema,
  inviteCode: z.string().trim().min(1, 'נדרש קוד כניסה לליגה'),
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  phone: phoneSchema.optional(),
});

export const scoreValueSchema = z.number().int().min(0).max(99);

export const predictionSchema = z.object({
  homePred: scoreValueSchema,
  awayPred: scoreValueSchema,
});

export const resultSchema = z.object({
  homeScore: scoreValueSchema,
  awayScore: scoreValueSchema,
});

export const liveUpdateSchema = z.object({
  homeScore: scoreValueSchema,
  awayScore: scoreValueSchema,
  liveMinute: z.string().trim().max(10),
});

export const teamSchema = z.object({
  name: z.string().trim().min(2).max(40),
  shortName: z.string().trim().min(1).max(10),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'צבע בפורמט hex, למשל ‎#00FF00'),
  isActive: z.boolean().optional(),
});

export const fixtureSchema = z.object({
  roundId: z.number().int().positive(),
  homeTeamId: z.number().int().positive(),
  awayTeamId: z.number().int().positive(),
  kickoffAt: z.number().int().positive(),
}).refine((f) => f.homeTeamId !== f.awayTeamId, { message: 'קבוצה לא יכולה לשחק נגד עצמה' });

export const roundCreateSchema = z.object({
  seasonId: z.number().int().positive(),
  number: z.number().int().positive(),
  name: z.string().trim().min(1).max(30),
  phase: z.enum(['regular', 'playoff_top', 'playoff_bottom']),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(100),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PredictionInput = z.infer<typeof predictionSchema>;
export type ResultInput = z.infer<typeof resultSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type FixtureInput = z.infer<typeof fixtureSchema>;
