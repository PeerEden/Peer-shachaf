# ⚽ 0 מושג בכדורגל

מערכת ליגת ניחושי תוצאות פרטית לליגת העל הישראלית — PWA בעברית, מותאמת לאייפון,
עם ניקוד 3/1/0, נעילת מחזורים, טבלה חיה, פודיום, תארים, היסטוריה, פאנל ניהול
והתראות Push. שרת Node יחיד מול מסד נתונים Postgres (Supabase).

A private football score-prediction league for the Israeli Premier League —
Hebrew RTL iPhone-first PWA backed by a single Node server (Express) and a
Postgres database.

## הרצה מקומית / Quick start

```bash
npm install
npm run seed          # creates data/league.db, prints the league invite code
npm run dev           # server on :3000, client on :5173
```

Production:

```bash
npm install
npm run build         # builds the client into client/dist
npm run seed          # first time only
npm start             # serves API + client on :3000
```

## פקודות ניהול / Admin commands

```bash
npm run promote-admin -- <username>    # make a registered user an ADMIN
npm run reset-password -- <username> <new-password>
npm run seed:demo                      # demo users/fixtures for local testing
```

## Environment

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | — | **Required.** Postgres/Supabase connection string |
| `DATA_DIR` | `./data` | Uploaded avatars + VAPID keys |
| `INVITE_CODE` | generated | League invite code used at first seed |
| `COOKIE_SECURE` | off | Set `1` in production (HTTPS) |
| `DEV_TOOLS` | off | Set `1` to enable time-travel endpoints for testing. Never in production |

## בדיקות / Tests

```bash
npm test              # scoring + server integration suites (vitest)
npm run typecheck
npm run build && (cd client && npx playwright test)   # E2E walkthrough
```

## פריסה / Deployment

The app is one long-lived Node process talking to Postgres — it needs a host with
a **persistent disk** (avatars, VAPID keys) and **HTTPS** (required for PWA install + push):
a small VPS, Railway/Fly.io with a volume, etc. Full guide: see `docs/DEPLOY.md`.

Backup = download the JSON export from the admin panel (כללי → גיבוי).

## הרצה ב-Vercel + Supabase / Running on Vercel

הריפו מוכן לפריסה ב-Vercel מול מסד נתונים Postgres של Supabase. **צריך להגדיר
דבר אחד בלבד** — ואז הכול עובד ונשמר:

1. ב-Supabase: Project Settings → Database → Connection string → **URI**,
   ולוודא שזו הכתובת של ה-**pooler** (פורט `6543`).
2. ב-Vercel: Settings → Environment Variables → להוסיף
   `DATABASE_URL` עם הכתובת הזאת (להחליף `[YOUR-PASSWORD]` בסיסמת המסד).
3. Deployments → Redeploy.

הטבלאות נוצרות לבד בהפעלה הראשונה — אין מה להריץ ידנית. הנרשם הראשון הופך
אוטומטית לאדמין, וקוד ההזמנה להרשמה הוא `DEMO` (או הערך של `INVITE_CODE`).

בלי `DATABASE_URL` האפליקציה תעלה אבל תציג הודעה שאין מסד נתונים — בכוונה,
כדי שאף אחד לא יפתח ליגה על משהו שלא שומר אותה.

⚠️ מה ש-Vercel עדיין לא נותן, גם עם מסד נתונים: **תזכורות Push** (הן צריכות
תהליך שרץ ברציפות) ו**תמונות פרופיל** (נשמרות לדיסק זמני). לליגה עם כל
היכולות — ראו `docs/DEPLOY.md`.

Deploying on Vercel needs exactly one setting: `DATABASE_URL` pointing at the
Supabase **pooler** connection string (port 6543). Tables are created on first
boot. Push reminders and avatar uploads still require the long-running
deployment described in `docs/DEPLOY.md`.
