# Health Claims Portal

A multi-role web application for managing health insurance claims — from patient submission through adjuster review to finance payout.

## Roles

| Role | Credentials (seeded) | Access |
|------|---------------------|--------|
| Admin | admin@healthclaims.com / Admin123! | Full system access, user & policy management |
| Adjuster | adjuster1@healthclaims.com / Adjuster123! | Claims review queue, approve/reject/request info |
| Finance Officer | finance@healthclaims.com / Finance123! | Payout processing, CSV export |
| Patient | patient1@healthclaims.com / Patient123! | Submit claims, upload docs, track status |

## Tech Stack

**Frontend:** React 18 + Vite + TypeScript + Tailwind CSS + Zustand + React Hook Form + Recharts
**Backend:** Node.js + Express + TypeScript + Prisma ORM + JWT + Multer
**Database:** PostgreSQL (Neon)
**Package manager:** pnpm (workspaces monorepo)

## Prerequisites

- **Node.js 18+** — check with `node --version`
- **pnpm** — install with `npm install -g pnpm`
- **PostgreSQL database** — use [Neon](https://neon.tech) free tier or local PostgreSQL

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the example env files and fill in your values:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Set `DATABASE_URL` in `backend/.env` to your PostgreSQL connection string:

```
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
```

### 3. Run database migrations and seed

```bash
cd backend
pnpm db:migrate
pnpm db:seed
```

### 4. Start the app

From the repo root:

```bash
pnpm dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001/api
- Swagger docs: http://localhost:3001/api/docs

> **Already set up?** Just run `pnpm dev` from the root.

### Resetting demo data

```bash
cd backend && pnpm db:seed
```

## URLs

| | |
|---|---|
| App (frontend) | http://localhost:5173 |
| REST API | http://localhost:3001/api |
| Swagger / API docs | http://localhost:3001/api/docs |

## Project Structure

```
health-claims/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema
│   │   └── seed.ts              # Demo data seeder
│   └── src/
│       ├── index.ts             # Express entry
│       ├── config.ts            # Environment config
│       ├── swagger.ts           # OpenAPI setup
│       ├── lib/prisma.ts        # Prisma singleton
│       ├── middleware/
│       │   ├── auth.ts          # JWT verification
│       │   ├── roles.ts         # Role-based guard
│       │   ├── error.ts         # Global error handler
│       │   ├── upload.ts        # Multer file uploads
│       │   └── validate.ts      # Zod request validation
│       ├── routes/
│       │   ├── auth.ts          # Register, login, reset
│       │   ├── users.ts         # Profile management
│       │   ├── policies.ts      # Policy CRUD
│       │   ├── claims.ts        # Full claims workflow
│       │   ├── documents.ts     # File upload/download
│       │   ├── notifications.ts # In-app notifications
│       │   ├── admin.ts         # Admin panel APIs
│       │   └── payouts.ts       # Finance payout processing
│       ├── services/
│       │   ├── claims.ts        # Eligibility calculation
│       │   └── email.ts         # Nodemailer email service
│       └── utils/
│           ├── jwt.ts           # Token helpers
│           ├── audit.ts         # Audit log writer
│           ├── claimNumber.ts   # CLM-YYYY-XXXXXX generator
│           └── notification.ts  # Notification helper
└── frontend/
    └── src/
        ├── api/                 # Axios API client modules
        ├── components/          # Shared UI components
        │   ├── Layout.tsx       # App shell (sidebar + topbar)
        │   ├── Sidebar.tsx      # Role-based navigation
        │   ├── StatusBadge.tsx  # Color-coded claim status
        │   ├── ClaimTimeline.tsx # Audit trail timeline
        │   ├── FileUpload.tsx   # Drag-and-drop uploader
        │   └── NotificationBell.tsx
        ├── pages/
        │   ├── auth/            # Login, Register, Password reset
        │   ├── patient/         # Dashboard, NewClaim wizard, ClaimDetail
        │   ├── adjuster/        # ClaimQueue, ClaimReview with modals
        │   ├── finance/         # PayoutList with batch processing
        │   └── admin/           # UserMgmt, PolicyMgmt, AuditLogs, Analytics
        ├── store/
        │   ├── authStore.ts     # Auth state (Zustand + localStorage)
        │   └── notificationStore.ts  # Polling for unread count
        └── types/index.ts       # Shared TypeScript types
```

## Features

### Patient
- 4-step claim submission wizard (type → details → upload → review)
- Auto-calculated eligible reimbursement based on policy deductible + copay
- Document upload (PDF, JPG, PNG, max 5 files × 10MB)
- Real-time status tracking with timeline
- Respond to adjuster info requests
- Resubmit rejected claims

### Adjuster
- Filtered claim queue (by status, type, date, amount)
- Approve with notes / Reject with reason / Request info
- Self-assign or reassign claims
- Full audit timeline per claim

### Finance Officer
- Approved claims pending payout list
- Single pay with payment reference number
- Batch pay multiple claims
- Export payout report as CSV

### Admin
- User management (create, edit roles, deactivate)
- Policy management (BASIC / STANDARD / PREMIUM plans)
- System audit logs with filters
- Analytics dashboard (Recharts: bar, line, pie charts)

## API Documentation

Interactive Swagger UI is available at `http://localhost:3001/api/docs` when the backend is running.

## Database Schema

Key tables: `User`, `Policy`, `UserPolicy`, `Claim`, `Document`, `ClaimEvent`, `InfoRequest`, `Payout`, `Notification`, `AuditLog`.

Claim status flow:
```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PAID
                 ↘ INFO_REQUESTED → UNDER_REVIEW
                 ↘ REJECTED → SUBMITTED (resubmit)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 32 chars, used to sign tokens |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `PORT` | Backend port (default `3001`) |
| `UPLOAD_DIR` | File storage directory (default `uploads`) |
| `SMTP_HOST` | Email server (optional) |
| `VITE_API_URL` | Frontend API base URL |

## Email

Email is optional. Without SMTP config, emails are logged to the console. To enable real email, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in `backend/.env`.

## Seeded Demo Data

- 3 Policies: Basic ($50k coverage, $500 deductible), Standard ($100k, $250), Premium ($200k, $100)
- All patients have the Standard policy assigned
- Sample claims in all statuses: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, PAID, REJECTED
- Notifications and timeline events pre-populated for demo purposes

## Hosting

| Part | Service |
|------|---------|
| Frontend | [Vercel](https://vercel.com) |
| Backend | [Render](https://render.com) (free tier — spins down after 15 min idle) |
| Database | [Neon](https://neon.tech) (free PostgreSQL) |
