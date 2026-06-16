# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

CampusShare is a notes-sharing web app for **Universidad Católica San Pablo (UCSP)** students. Access is restricted to `@ucsp.edu.pe` Google accounts. The codebase, comments, and commit messages are written in **Spanish** — match that convention when editing.

Two companion docs hold the operational detail; **read them before touching auth, env vars, deploy, or the student-code whitelist** instead of re-deriving it:
- `README.md` — full stack overview, local-dev setup, the complete env-var table, and the Google login flow.
- `HANDOVER.md` — accounts/ownership, production secrets, costs, the student-code padrón loading procedure, and end-of-term transfer checklists.

## Commands

```bash
# Backend (Node 22, Express, CommonJS) — run from backend/
npm install
node server.js               # starts on :8080; runs initDb() (schema + seed) first
npm test                     # vitest run — REQUIRES a live Postgres (see below)
npm run test:watch

# Frontend (Vite + React 19) — run from frontend/
npm install
npm run dev                  # Vite dev server; proxies /api and /uploads -> :8080
npm run build                # outputs to dist/
npm run lint                 # eslint
```

### Running tests

Backend tests are **integration tests that hit a real disposable Postgres** (supertest against the imported Express app — not mocks). They need `DATABASE_URL`, `JWT_SECRET`, and `DB_SSL=false`:

```bash
# from backend/ — full suite (mirrors CI)
DATABASE_URL=postgres://campus:campus@localhost:5432/campus_share JWT_SECRET=dev DB_SSL=false npm test

# single test by name substring
DATABASE_URL=... JWT_SECRET=dev DB_SSL=false npx vitest run -t "da like"
```

CI (`.github/workflows/ci.yml`) runs the backend suite against a `postgres:16` service container, and builds + lints the frontend (lint is `continue-on-error`).

## Architecture

### Backend — single-file Express monolith
All backend logic lives in **`backend/server.js`** (~760 lines): config, middleware, every route, and the storage/auth helpers. `backend/routes/` is empty/vestigial — do **not** assume routes are split out. Keep new endpoints in `server.js` unless deliberately refactoring.

`server.js` exports `{ app, pool, initDb, googleClient }` and only calls `app.listen()` when run directly (`require.main === module`). Tests import these, call `initDb()` in `beforeAll`, close `pool` in `afterAll`, and `vi.spyOn(googleClient, 'verifyIdToken')` to fake a UCSP payload without a real Google token. Preserve this export shape and the `require.main` guard.

### Database = SQL files applied at startup (this is the "migration" system)
There is **no migration tool**. On every boot, `initDb()` executes `backend/db/schema.sql` then `backend/db/seed.sql`. **All schema changes go in these files and MUST be idempotent** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ALTER COLUMN ... DROP NOT NULL` which no-ops when already nullable). They re-run unguarded on the production Neon DB at every deploy — a non-idempotent statement breaks startup.

Tables: `careers` → `courses` → `materials` (FK to course + user), `users`, `likes` (PK `(user_id, material_id)` = one heart per user/material), and `student_codes` (the enrollment whitelist; `code` has a `CHECK (code = upper(btrim(code)))`).

**`materials.upvotes` is a dead legacy column** — never read it. The vote count is computed live from `likes` via a subquery aliased `upvotes`. Queries select explicit columns (never `m.*`) specifically to avoid exposing the stale column. Reuse the `selectMaterialRow` helper to return a row with the same shape as the feed (`course_name`, `user_email`, `upvotes`, `liked_by_me`).

### Auth
Google Identity Services issues an ID token → frontend posts it to `/api/auth/google` → backend verifies it with `verifyUcspGoogleToken` (shared helper: checks Google signature, audience = `GOOGLE_CLIENT_ID`, `email_verified`, `hd === 'ucsp.edu.pe'`, and email suffix). On success the backend mints **its own 24h JWT** (`issueAuthToken`). Two middlewares: `authenticateToken` (401/403 if missing/invalid) and `optionalAuth` (sets `req.user` only when a valid token is present, never rejects — used by the materials feed for `liked_by_me`/`?mine=true`).

`GOOGLE_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend) **must be the same value** or login fails on audience mismatch. Without `GOOGLE_CLIENT_ID` the login route returns `503`, not a crash.

### Student-code whitelist (2-step registration)
Gated by `ENFORCE_STUDENT_CODES`. The flag is read **per-request** (`isEnforcingStudentCodes()`), not cached at boot, so tests can toggle it. When on: a *new* email gets `200 { needsCode: true }` from `/api/auth/google` (no user created); the frontend then calls `/api/auth/google/register` with the code, which re-verifies the token and claims a code **atomically** via `SELECT ... FOR UPDATE` inside a transaction (race-safe — concurrent registrations can't claim the same code). Existing users always log in directly. The padrón is loaded out-of-band into the DB (see HANDOVER); the seed files never contain codes.

### File storage abstraction
If `SPACES_ACCESS_KEY`/`SPACES_SECRET_KEY` are set, uploads go to an S3-compatible bucket (DO Spaces or Cloudflare R2); otherwise they fall to `backend/uploads/` on the container's **ephemeral disk** (lost on redeploy). The upload code branches on `s3Client`. ACL is conditional (R2 manages access at the bucket level and rejects per-object ACLs; DO Spaces needs `public-read`). `STORAGE_PUBLIC_URL` overrides the public download base. Deletes are best-effort and never block the DB delete.

### Frontend
Vite + React 19 + react-router-dom v7. Entry `src/main.jsx` wraps `<App>` in `GoogleOAuthProvider` and optionally inits Sentry. `App.jsx` holds auth in `localStorage` and gates two routes (`/login`, `/`). Components: `MaterialCard`, `UploadModal`, `EditModal`, `pages/Login`.

**Tailwind CSS v4, config-less** — there is no `tailwind.config.js`/`postcss.config.js`. The design system lives in `src/index.css` via `@theme` (the `@tailwindcss/vite` plugin). Use the defined tokens, do not hardcode: colors `paper`/`surface`/`ink`/`muted`/`accent`(maroon `#7c2d2d`)/`line`, fonts `font-sans` (Inter) + `font-display` (Fraunces). The visual direction is **"Editorial académico"** (warm paper, serif headings, maroon accent) — no dark mode, no glass/gradient aesthetics.

## Deploy & conventions

- **Push to `main` auto-deploys** both components on DigitalOcean App Platform. `.do/app.yaml` is **reference documentation only** — App Platform does not read it per-deploy; the live config and all secrets live in the DO dashboard. Never put secrets in the repo or in `app.yaml`.
- In production, DO routes `/api` and `/uploads` with `preserve_path_prefix: true` so Express receives the paths exactly as registered. Locally, the Vite dev proxy achieves the same.
- All SQL uses **parameterized queries**; sort/filter inputs are whitelisted (never interpolated). Ownership for edit/delete is enforced server-side from the JWT `user.id` — never trust the client.
- **Sensitive padrón files are gitignored** and must stay out of the repo: `CCOMP.xlsx`, `student_codes_seed.sql`, and all `*.xlsx`/`*.csv` (they contain PII and valid enrollment codes).
