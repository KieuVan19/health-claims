# Health Claims Portal

Full-stack health insurance claims system. Monorepo: `backend/` (Express + Prisma + SQLite)
and `frontend/` (React + Vite + Zustand). pnpm workspaces.

---

## Hard Rules

- NEVER skip writing a test after a bug fix
- NEVER change `prisma/schema.prisma` provider — it is permanently `sqlite` for local dev; Render swaps it to `postgresql` at build time
- NEVER edit both `backend/` and `frontend/` package.json in one step without confirming scope
- NEVER push directly to `main` — always follow the Change Workflow below
- ALWAYS run `pnpm db:push` from `backend/` after any schema change (local dev uses db push, not migrate)
- ALWAYS trace the full data flow before touching code (frontend → route → service → DB)
- TypeScript strict mode is on in both packages — run `tsc --noEmit` to verify before calling done

---

## Change Workflow

Every code change — no matter how small — must follow these steps in order:

1. **Branch** — `git checkout -b <type>/<short-description>` from `main`
2. **Change** — make the edit; run `pnpm db:push` from `backend/` if schema changed; run `tsc --noEmit` in affected package(s)
3. **Unit test** — write and run unit tests; report results to user
4. **Pause** — tell the user the change is ready; wait for them to verify on their local dev env (ports 3001 / 5173)
5. **Confirm push** — after user approves, explicitly ask: "Push to GitHub / production?"
6. **Push** — only after explicit user confirmation: push the branch and open a pull request

---

## Commands

```bash
# Root — runs both concurrently
pnpm dev

# Individually
cd backend && pnpm dev    # port 3001
cd frontend && pnpm dev   # port 5173

# Build
pnpm build

# Type-check
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

### Database (from `backend/`)

```bash
pnpm db:push      # sync schema to local SQLite (dev only — do NOT use migrate)
pnpm db:seed      # load demo data
pnpm db:studio    # Prisma GUI
```

---

## Test Setup

No test framework is installed. Add it before writing any test:

```bash
# Backend
cd backend && pnpm add -D vitest
# Frontend
cd frontend && pnpm add -D vitest @testing-library/react @testing-library/jest-dom
```

Add `"test": "vitest"` to the relevant `package.json`. Test files live alongside the file
they test: `claims.test.ts` next to `claims.ts`.

---

## Workflows

### Bug Fix

1. **Diagnose** — read the relevant files, trace the full data flow end-to-end, identify root
   cause before touching code
2. **Fix** — edit minimum code; if schema changed, run `pnpm db:push` from `backend/`
3. **Test** — add a unit test that would have caught this bug (install Vitest first if missing)
4. **Verify live** — confirm ports 3001 and 5173 are running; start `pnpm dev` from root if not

### New Feature

1. **Map impact** — identify which route, service, and frontend page are involved
2. **Backend first** — add/modify route → service → Prisma schema (run `pnpm db:push` if schema changed)
3. **Frontend second** — update the API module in `frontend/src/api/`, then the page/component
4. **Role-check** — verify the feature respects RBAC: does the route use `roles.ts` middleware?
5. **Test** — add a unit test covering the new logic
6. **Verify live** — same as bug fix step 4

---

## Architecture

### Data Flow

Request → `index.ts` middleware (Helmet, CORS, rate limit) → `auth.ts` (JWT) → `roles.ts`
(RBAC) → route handler → service → Prisma → SQLite.

Frontend: user action → `api/` module (Axios + JWT interceptor) → backend → Zustand store
update → re-render.

### Backend (`backend/src/`)

- `index.ts` — Express entry, middleware stack, route mounting
- `config.ts` — all env vars with defaults
- `middleware/` — `auth.ts` (JWT verify), `roles.ts` (RBAC), `validate.ts` (Zod),
  `upload.ts` (Multer), `error.ts` (global handler)
- `routes/` — `/api`: auth, users, policies, claims, documents, notifications, admin, payouts
- `services/claims.ts` — `calculateEligible()` applies deductible + copay
- `services/email.ts` — Nodemailer, degrades to console if SMTP not configured
- `utils/` — `jwt.ts`, `audit.ts`, `notification.ts`, `claimNumber.ts`
- `lib/prisma.ts` — singleton Prisma client

API docs: `http://localhost:3001/api/docs`

### Frontend (`frontend/src/`)

- `App.tsx` — React Router v6, `ProtectedRoute` enforces role-based guards
- `store/authStore.ts` — Zustand, persisted to localStorage
- `store/notificationStore.ts` — polling-based
- `api/` — one module per resource; Axios interceptor attaches Bearer token, auto-logout on 401
- `pages/` — organized by role: `auth/`, `patient/`, `adjuster/`, `finance/`, `admin/`
- `components/` — `Layout`, `StatusBadge`, `ClaimCard`, `Timeline`, `NotificationBell`,
  `FileUpload`
- `types/index.ts` — all shared TypeScript interfaces

### Database (Prisma)

**Dev:** SQLite (`file:./dev.db`) — schema synced via `prisma db push`, no migration files used locally.
**Production:** PostgreSQL (Neon) — Render build command swaps provider to `postgresql` before `prisma generate`; `prisma migrate deploy` runs the `backend/prisma/migrations/` files against Neon.
Do not run `prisma migrate dev` locally — it will fail intentionally (migration_lock.toml is locked to `postgresql`).

### Claim Lifecycle (Prisma)

Claim lifecycle: `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / INFO_REQUESTED / REJECTED → PAID`

Every state transition creates an immutable `ClaimEvent` — do not bypass this.

Entities: User (PATIENT, ADJUSTER, FINANCE_OFFICER, ADMIN) ↔ UserPolicy ↔ Policy (BASIC,
STANDARD, PREMIUM), Claim, ClaimEvent, Document, InfoRequest, Payout, Notification, AuditLog.

---

## Business Logic

**Eligibility** (`backend/src/services/claims.ts`):
```
reimbursable = (claimAmount - deductible) * (1 - copayPercent)
```
| Tier | Deductible | Copay |
|------|-----------|-------|
| Basic | $500 | 30% |
| Standard | $250 | 20% |
| Premium | $100 | 10% |

---

## Environment

Copy `.env.example` → `.env` in root.

- `DATABASE_URL` — local: `file:./dev.db` (SQLite) | Render sets this to the Neon PostgreSQL URL
- `JWT_SECRET` — required
- `PORT` — default 3001
- `SMTP_*` — optional; falls back to console

---

## Demo Credentials (after `pnpm db:seed`)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@healthclaims.com | Admin123! |
| Adjuster | adjuster1@healthclaims.com | Adjuster123! |
| Finance | finance@healthclaims.com | Finance123! |
| Patient | patient1@healthclaims.com | Patient123! |

---

## Known Gotchas

- Use `pnpm db:push` (not `pnpm db:migrate`) from `backend/` for local schema changes — migrate is locked to postgresql and will error locally
- Vitest is not installed; do not write tests and assume they run
- `tsx watch` auto-restarts on code changes but NOT on `.env` changes — restart manually
- `authStore` persists to localStorage — stale tokens after logout can cause 401 loops in dev;
  clear localStorage if auth behaves unexpectedly
