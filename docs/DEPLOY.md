# פריסה לאינטרנט / Deployment Guide

המערכת היא תהליך Node יחיד עם קובץ SQLite — אין תלות בשירותים חיצוניים.
כדי שהחברים יתחברו מהאייפון צריך שרת עם **דיסק קבוע** ו‑**HTTPS**.

The app is one long-lived Node process with a SQLite file. It needs a host
with a **persistent disk** and **HTTPS** (required for PWA installation and
Web Push). Serverless platforms (Vercel, Netlify, Cloudflare Pages) will
**not** work — the process must stay alive for the reminder scheduler.

## Requirements

- Node.js 20+ (22 recommended)
- ~512MB RAM, minimal CPU (a $4–6/month VPS or a Railway/Fly.io instance with a volume is plenty)
- A domain (or platform subdomain) with HTTPS

## Steps (any Linux host)

```bash
git clone <this-repo> && cd <repo>
npm install
npm run build                 # builds the client into client/dist
INVITE_CODE=YOURCODE npm run seed   # first time only — prints the invite code
COOKIE_SECURE=1 PORT=3000 npm start
```

Put HTTPS in front (pick one):

- **Caddy** (easiest — automatic HTTPS):
  ```
  yourdomain.com {
      reverse_proxy localhost:3000
  }
  ```
- **nginx + certbot**: standard `proxy_pass http://localhost:3000;`
- **Railway / Fly.io / Render**: attach a volume, mount it, and set
  `DATA_DIR=/path/to/volume`. Set `COOKIE_SECURE=1`.

Keep the process alive with `systemd`, `pm2`, or the platform's supervisor:

```ini
# /etc/systemd/system/league.service
[Unit]
Description=0 musag bakaduregel
After=network.target

[Service]
WorkingDirectory=/opt/league
Environment=COOKIE_SECURE=1
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `COOKIE_SECURE=1` | **Yes, in production** | Session cookie sent only over HTTPS |
| `PORT` | No (3000) | |
| `DATA_DIR` | No (`./data`) | Point at the persistent volume on PaaS hosts |
| `INVITE_CODE` | First seed only | Otherwise a code is generated and printed |
| `DEV_TOOLS` | **Never in production** | Enables time-travel endpoints |

## First admin

1. Register yourself in the app with the invite code.
2. On the server: `npm run promote-admin -- <your-username>`
3. The 🛠️ admin panel appears in your Profile tab.

## Backups

Everything lives in `DATA_DIR` (`league.db`, `uploads/`, `vapid.json`).

- From the admin panel: כללי → גיבוי → הורדה (downloads a consistent DB snapshot).
- From the server: copy the whole `data/` folder (stop the process first, or use the admin download).
- Restore = put the files back and start the process.

## iPhone checklist (after deploying)

1. Open the HTTPS URL in **Safari** on the iPhone.
2. Share button → **Add to Home Screen** (the app guides users through this at `/install`).
3. Open from the home-screen icon → Profile → enable 🔔 notifications (iOS 16.4+).
4. Send yourself a test: postpone/restore a fixture or wait for the next reminder window.

## Moving to Postgres/Supabase later

The data layer is isolated for this: swap `server/src/db/schema.ts` imports
from `drizzle-orm/sqlite-core` to `pg-core`, change the driver in
`server/src/db/index.ts`, and re-run `npm run db:generate`. No raw SQL exists
outside `server/src/db/`.
