# 0 מושג בכדורגל — repo guide

Private football score-prediction league (Israeli Premier League) for a
group of friends. Hebrew RTL iPhone-first PWA. Fully self-contained: one
Express server + SQLite, zero external services.

## Commands

- `npm run dev` — server :3000 + Vite client :5173 (proxied)
- `npm run build && npm start` — production (server serves client/dist)
- `npm run seed` / `npm run seed:demo` — base / demo data (idempotent)
- `npm test` — shared + server vitest suites
- `npm run typecheck` — all workspaces
- `cd client && CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test` — E2E (build client first)
- `npm run promote-admin -- <username>`, `npm run reset-password -- <username> <pass>`

## Architecture rules (keep these invariants)

- **League rules live in `shared/src/scoring.ts`** (3 exact / 1 outcome / 0)
  — used by server final scoring AND client live provisional. Never fork it.
- **All time flows through the injected `Clock`** (`server/src/lib/clock.ts`).
  Never call `Date.now()`/`new Date()` in request/engine/scheduler logic —
  tests and DEV_TOOLS time-travel depend on it.
- **Locking & privacy are server-side** (`engine/round-lifecycle.ts`:
  `isFixturePredictable`, `arePredictionsVisible`); every endpoint that
  serializes predictions must filter through them. The client only decorates.
- **No raw SQL outside `server/src/db/`** — the future Postgres/Supabase swap
  is confined to `db/schema.ts` + `db/index.ts`.
- **Push idempotency** = unique `event_key` in `notification_log`; the
  scheduler is stateless (derives everything from DB each tick). New
  notification types must claim an event key before sending.
- **Stored round status** is only pending/open/closed; locked/live/finished
  are derived at read time. `lock_at` = MIN(kickoff) of regular fixtures —
  recompute via `recomputeRoundLock` on ANY fixture mutation.
- Admin mutations always write `audit_log` (`lib/audit.ts`).
- Tailwind: logical properties only (`ms-`/`me-`/`ps-`/`pe-`/`start`/`end`),
  never `ml-`/`mr-` — the UI is RTL.
- Every user-facing string is Hebrew.

## Data flow cheat-sheet

Result entered → `enterFinalResult` scores predictions → `maybeCloseRound`
(all regular fixtures terminal) → frozen `round_user_stats` snapshot + round
titles → next round opens → push events. Corrections re-run the same upserts
and `recomputeClosedRounds` heals snapshots. Postponed games leave the round
(predictions voided), return as completion games (`is_completion`,
7-day window, private until kickoff, points join season totals only).
