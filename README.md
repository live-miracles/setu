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

1. Create a Supabase project. The Free plan is enough for evaluation and
   small-team use (see the free-tier notes below); move to Pro once the
   project must never auto-pause or you need included backups.
2. Run `supabase/migrations/0001_initial.sql` in the SQL editor or with the
   Supabase CLI.
3. Create a Google OAuth client for sign-in:
    - In [Google Cloud Console](https://console.cloud.google.com/), create or
      select a project, then open **APIs & Services → OAuth consent screen**
      and configure it (External user type, app name, support email). Publish
      the consent screen — leaving it in "Testing" restricts sign-in to a
      manually added list of test users.
    - Open **APIs & Services → Credentials → Create Credentials → OAuth
      client ID**, choose **Web application**, and add Supabase's callback
      URL as an authorized redirect URI. That URL is shown in the Supabase
      dashboard under Authentication → Providers → Google, and follows the
      pattern `https://<project-ref>.supabase.co/auth/v1/callback`.
    - Copy the generated Client ID and Client Secret.
4. In Supabase, open **Authentication → Providers → Google**, enable it and
   paste the Client ID and Client Secret from the previous step. Then under
   **Authentication → URL Configuration**, add
   `https://<your-domain>/auth/callback` to the allowed Redirect URLs.
5. Create VAPID keys and a verified Resend sender.
6. Set `NEXT_PUBLIC_DEMO_MODE=false` and fill every production variable from
   `.env.example`.
7. Set `BOOTSTRAP_ADMIN_EMAIL` to the first administrator's lowercase Google
   account email. The first successful login creates that administrator.
8. Invite all other users from Admin before they sign in.

The browser uses Supabase only for its signed-in session. All business writes
go through `/api/v1`; service-role credentials must never be exposed as a
`NEXT_PUBLIC_` variable.

**Free-tier caveat:** a Free-plan project pauses itself after 7 days with no
API traffic (any sign-in or API call resets that clock). A paused project
must be manually resumed from the Supabase dashboard before the app works
again. Free-plan projects also skip the automatic daily backups and
point-in-time recovery that Pro includes — see "Operational notes" below.

## Vercel deployment

Import this repository into a Vercel project — the Hobby (free) plan is
enough. Configure the same environment variables for Preview and Production.
Vercel Hobby caps Cron Jobs at once per day, so `vercel.json` only installs
the overdue-request scan, daily at 02:30 UTC; Vercel sends `CRON_SECRET` as a
Bearer token for that request.

The notification-retry job needs a much tighter interval (every 15 minutes),
so it runs from `.github/workflows/retry-notifications.yml` on GitHub's own
scheduler instead of Vercel Cron. In the deployed repository's
**Settings → Secrets and variables → Actions**, add:

- `APP_URL` — the deployed app's base URL (e.g. `https://your-app.vercel.app`)
- `CRON_SECRET` — the same value set in Vercel's environment variables

GitHub Actions minutes are unlimited for public repositories, so this costs
nothing as long as the fork stays public. GitHub disables scheduled workflows
after 60 days without a commit to the repository; if retries silently stop,
re-enable the workflow from the Actions tab (or push any commit) to restart
it.

If this deployment is more than a personal or evaluation project, note that
Vercel's Hobby plan terms are for personal, non-commercial use — check
Vercel's current terms before relying on it for an organization's internal
tooling, and move to a Pro/Team plan if that applies to you.

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

Vercel Cron    --> overdue scan (daily)
GitHub Actions --> notification delivery retry (every 15 minutes)
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
  Supabase plan (not included on Free) and must be verified with a restore
  rehearsal before launch.
