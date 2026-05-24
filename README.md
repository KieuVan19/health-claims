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
**Database:** SQLite (file-based, zero config)

## Prerequisites

- **Node.js 18+** — check with `node --version`
- **npm** — bundled with Node.js

No database server, no Docker required. SQLite runs as a local file.

## Quick Start

Open **two terminals** in the project root.

### Terminal 1 — Backend

```powershell
cd backend
npm install
npx prisma db push          # creates backend/dev.db
npx tsx prisma/seed.ts      # loads demo users, policies & claims
npm run dev                 # starts API on http://localhost:3001
```

### Terminal 2 — Frontend

```powershell
cd frontend
npm install
npm run dev                 # starts UI on http://localhost:5173
```

Then open **http://localhost:5173** in your browser.

> **Already installed?** Skip `npm install` — just run `npm run dev` in each terminal.

### Resetting demo data

To wipe and re-seed the database at any time:

```powershell
cd backend
npx tsx prisma/seed.ts
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

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | `file:./dev.db` | SQLite file path (relative to `backend/`) |
| JWT_SECRET | set in `.env` | Min 32 chars, used to sign tokens |
| JWT_EXPIRES_IN | `7d` | Token lifetime |
| PORT | `3001` | Backend port |
| UPLOAD_DIR | `uploads` | File storage directory |
| SMTP_HOST | `smtp.ethereal.email` | Email server (optional) |
| VITE_API_URL | `http://localhost:3001/api` | Frontend API base URL |

## Email

Email is optional. Without SMTP config, emails are logged to the console (preview URL via Nodemailer Ethereal). To enable real email, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in `.env`.

## Seeded Demo Data

- 3 Policies: Basic ($50k coverage, $500 deductible), Standard ($100k, $250), Premium ($200k, $100)
- All patients have the Standard policy assigned
- Sample claims in all statuses: DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, PAID, REJECTED
- Notifications and timeline events pre-populated for demo purposes
