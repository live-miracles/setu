# Livestream Operations

A mobile-first internal web app for roster coverage, equipment handovers and
studio support. It replaces the daily AppSheet workflows without carrying over
AppSheet data or offline synchronization.

## Included

- Google sign-in with an application allowlist and fixed `admin` / `member`
  roles
- Home dashboard with upcoming shifts, active inventory requests, quick links,
  guidelines, WhatsApp and tutorial links
- Roster creation and assignment notifications
- Equipment catalogue and the full request lifecycle: submit, approve/reject,
  issue, return, damaged/missing recording and close
- Tickets with assignment, comments, close and reopen
- User profile and notification preferences
- Admin APIs and UI for allowlist access, departments, locations, equipment
  types, inventory, links and home content
- In-app, Resend email and VAPID Web Push notifications
- Private Supabase Storage uploads with five-minute signed download links
- An installable PWA shell for iOS, Android and desktop
- Daily overdue reminders and idempotent notification retries
- Immutable audit records for sensitive business transitions

The service worker intentionally has no `fetch` handler and creates no cache.
When disconnected, the app displays an offline warning and refuses writes.

## Local preview

Node.js 24 LTS is recommended.

```bash
npm install
cp .env.example .env.local
npm run dev
```

The example environment enables demo mode, so the complete UI and workflows can
be evaluated without cloud credentials at
[http://localhost:3000/app](http://localhost:3000/app).

Before opening a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Supabase setup

1. Create a Supabase Pro project.
2. Run `supabase/migrations/0001_initial.sql` in the SQL editor or with the
   Supabase CLI.
3. In Authentication, enable Google and add
   `https://<your-domain>/auth/callback` as an allowed redirect URL.
4. Create VAPID keys and a verified Resend sender.
5. Set `NEXT_PUBLIC_DEMO_MODE=false` and fill every production variable from
   `.env.example`.
6. Set `BOOTSTRAP_ADMIN_EMAIL` to the first administrator's lowercase Google
   account email. The first successful login creates that administrator.
7. Invite all other users from Admin before they sign in.

The browser uses Supabase only for its signed-in session. All business writes
go through `/api/v1`; service-role credentials must never be exposed as a
`NEXT_PUBLIC_` variable.

## Vercel deployment

Import this repository into a Vercel Pro project and configure the same
environment variables for Preview and Production. `vercel.json` installs the
overdue-request job daily at 02:30 UTC and retries notifications every
15 minutes. Vercel sends `CRON_SECRET` as a Bearer token.

Recommended release flow:

1. Apply the database migration to a staging Supabase project.
2. deploy a Vercel Preview environment;
3. complete the mobile, permission, attachment and concurrency acceptance
   checklist;
4. rehearse database restore and private attachment access;
5. apply the migration and environment settings to Production, then promote the
   verified build.

This checkout is not linked to a Vercel account. Running `vercel link` once is
required before command-line deployments.

## Architecture

```text
Browser / installed PWA
        |
        | Google session + /api/v1
        v
Next.js route handlers on Vercel
        |
        +--> Supabase PostgreSQL + RLS + audit log
        +--> private Supabase Storage + signed URLs
        +--> Resend email
        +--> VAPID Web Push

Vercel Cron --> overdue scan / delivery retry
```

Inventory and ticket commands require an `Idempotency-Key` header. The database
functions lock the affected request and stock rows before approving, issuing or
returning items, so concurrent clicks cannot double-adjust availability.

## API surface

The implementation exposes the planned `/api/v1` groups for session, users,
departments, locations, roster, equipment types, inventory items and requests,
tickets and comments, attachments, notifications, push subscriptions, home
content, links and cron jobs.

Attachment uploads are limited to JPEG, PNG, WebP and PDF files up to 15 MiB.
Downloads are authorized against the owning record and returned as short-lived
signed URLs.

## Operational notes

- All timestamps are stored in UTC and rendered in the user's configured time
  zone; the default is `Asia/Kolkata`.
- Disabling a user prevents the profile lookup required by every API request.
- Admins cannot demote or disable their own administrator account.
- There is no AppSheet data import in this release.
- Production backup and point-in-time recovery are provided by the selected
  Supabase plan and must be verified with a restore rehearsal before launch.
