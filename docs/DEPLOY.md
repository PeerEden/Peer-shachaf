# פריסה לאינטרנט / Deployment Guide

המערכת היא תהליך Node יחיד מול מסד נתונים Postgres (למשל Supabase).
כדי שהחברים יתחברו מהאייפון צריך שרת עם **דיסק קבוע** ו‑**HTTPS**.

The app is one long-lived Node process backed by Postgres. It needs **HTTPS**
(required for PWA installation and Web Push) and a **persistent disk** for
uploaded avatars and the VAPID key pair. Serverless platforms (Vercel,
Netlify) can serve the app against the same database, but the reminder
scheduler needs a process that stays alive — see the note at the end.

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
| `DATABASE_URL` | **Yes** | Postgres connection string (Supabase: use the pooler URL, port 6543) |
| `DATA_DIR` | No (`./data`) | Avatars + VAPID keys; point at the persistent volume on PaaS hosts |
| `INVITE_CODE` | First seed only | Otherwise a code is generated and printed |
| `DEV_TOOLS` | **Never in production** | Enables time-travel endpoints |

## First admin

1. Register yourself in the app with the invite code.
2. On the server: `npm run promote-admin -- <your-username>`
3. The 🛠️ admin panel appears in your Profile tab.

## Backups

League data lives in Postgres; `DATA_DIR` only holds `uploads/` and `vapid.json`.

- From the admin panel: כללי → גיבוי → הורדה (downloads a consistent DB snapshot).
- From the server: copy the whole `data/` folder (stop the process first, or use the admin download).
- Restore = put the files back and start the process.

## iPhone checklist (after deploying)

1. Open the HTTPS URL in **Safari** on the iPhone.
2. Share button → **Add to Home Screen** (the app guides users through this at `/install`).
3. Open from the home-screen icon → Profile → enable 🔔 notifications (iOS 16.4+).
4. Send yourself a test: postpone/restore a fixture or wait for the next reminder window.

## Database

Schema lives in `server/src/db/schema.ts` (drizzle, `pg-core`); the driver is
`server/src/db/index.ts`. Migrations under `server/drizzle/` are applied
automatically on boot, so a host with no shell (Vercel) still gets its tables.
Change the schema with `npm run db:generate -w server`.
