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

## הרצה ב-Vercel / Running on Vercel

אפשר לייבא את הריפו ל-Vercel והוא יעלה בלי שום הגדרה נוספת
(`vercel.json` + `api/index.ts` דואגים לזה). הליגה נפתחת **ריקה**: אין משתמשי
דמו, אין משחקים ואין ניחושים — כולם נרשמים בעצמם ובוחרים סיסמה.

- קוד ההזמנה להרשמה: `DEMO` (או הערך של `INVITE_CODE` אם הוגדר).
- **הנרשם הראשון הופך אוטומטית לאדמין** ומזין קבוצות, משחקים ותוצאות
  מפאנל הניהול (🛠️ בפרופיל).
- רשימת הקבוצות מגיעה מהרכב 2025/26 — האדמין עורך אותה לפי המציאות.

⚠️ **מגבלה חשובה ב-Vercel:** מסד הנתונים יושב ב-`/tmp`, ולכן **כל ההרשמות
והניחושים נמחקים** בכל deploy ומדי פעם (cold start), וגם תזכורות ה-Push לא
נשלחות. לליגה אמיתית שנשמרת לאורך זמן — פרסו לפי `docs/DEPLOY.md`
(שרת עם דיסק קבוע; אותו קוד בדיוק, בלי שינויים).

On Vercel the league starts empty — everyone registers with the invite code
and picks their own password, and the first registrant becomes the admin.
Data lives in ephemeral `/tmp`, so it is wiped on cold starts and deploys;
for a league that persists, deploy per `docs/DEPLOY.md`.
