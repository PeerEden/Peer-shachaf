# ⚽ 0 מושג בכדורגל

מערכת ליגת ניחושי תוצאות פרטית לליגת העל הישראלית — PWA בעברית, מותאמת לאייפון,
עם ניקוד 3/1/0, נעילת מחזורים, טבלה חיה, פודיום, תארים, היסטוריה, פאנל ניהול
והתראות Push. ללא שירותים חיצוניים: שרת Node יחיד עם SQLite.

A private football score-prediction league for the Israeli Premier League —
Hebrew RTL iPhone-first PWA backed by a single self-contained Node server
(Express + SQLite). No external services, free to run anywhere.

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
| `DATA_DIR` | `./data` | SQLite DB, uploads, VAPID keys — **back up this folder** |
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

The app is one long-lived Node process with a SQLite file — it needs a host with
a **persistent disk** and **HTTPS** (required for PWA install + push):
a small VPS, Railway/Fly.io with a volume, etc. Full guide: see `docs/DEPLOY.md`.

Backup = copy the `data/` folder (or download from the admin panel).

## דמו ב-Vercel / Vercel demo mode

אפשר לייבא את הריפו ל-Vercel והוא יעלה **כדמו** בלי שום הגדרה נוספת
(`vercel.json` + `api/index.ts` דואגים לזה). חשוב לדעת:

- מסד הנתונים זמני (`/tmp`) — **הנתונים מתאפסים** בכל deploy ומדי פעם (cold start).
- תזכורות Push לא נשלחות (אין תהליך קבוע ב-serverless).
- נתוני דמו נטענים אוטומטית: `dror` / `demo123` (אדמין), `avi` / `demo123`,
  `yossi` / `demo123`. קוד הזמנה להרשמה: `DEMO` (או `INVITE_CODE` אם הוגדר).

Importing the repo into Vercel deploys a self-contained **demo**: ephemeral
SQLite in `/tmp` (data resets on cold starts/deploys), no push reminders.
For a real league with persistent data, deploy per `docs/DEPLOY.md`.
