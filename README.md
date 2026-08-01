# Setu (Livestream Operations)

A mobile-first internal web app for roster coverage, equipment handovers,
program scheduling and studio support.

## Included

- Google sign-in restricted to your organisation's email domain — anyone on
  that domain is registered automatically as a member on first sign-in, with
  fixed `admin` / `member` roles
- Home dashboard with upcoming roster entries, active requests, quick links
  and guidelines
- Roster creation with email notifications
- An inventory catalogue and request lifecycle: submit, approve/reject,
  issue, return (with condition) and close
- Program requests with one or more scheduled sessions, place, approval
  lifecycle and comments
- Comments on inventory and program requests (tickets do not have comments)
- Tickets with assignment, close and reopen
- User profile and admin APIs/UI for departments, places, inventory types,
  links and home content
- Email notifications via Resend; delivery failures are logged, not queued
  or retried
- Images (equipment photos, request photos) stored on Google Drive, not in
  the database — the app uploads them and stores only the Drive file id
- An installable PWA shell for iOS, Android and desktop
- Daily overdue-request reminders

The service worker only handles install/activate (no `fetch` handler, no
cache, no push). When disconnected, the app displays an offline warning and
refuses writes.

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
      and configure it (Internal or External user type, app name, support
      email). Publish the consent screen if External — leaving it in
      "Testing" restricts sign-in to a manually added list of test users.
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
5. Set `ALLOWED_EMAIL_DOMAIN` to your organisation's email domain (e.g.
   `example.org`) — anyone signing in with a Google account on that domain is
   registered automatically. Set `BOOTSTRAP_ADMIN_EMAIL` to the first
   administrator's lowercase email so their first sign-in creates them as an
   admin instead of a member.
6. Create a Google Drive service account for image uploads: in Google Cloud
   Console, create a service account, enable the Drive API, and generate a
   JSON key. Share a Drive folder with the service account's email address
   (Editor access), and set `GOOGLE_DRIVE_FOLDER_ID`,
   `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
   from that key.
7. Create a verified Resend sender and set `RESEND_API_KEY`/`RESEND_FROM_EMAIL`.
8. Set `NEXT_PUBLIC_DEMO_MODE=false` and fill every production variable from
   `.env.example`.

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
Vercel Hobby caps Cron Jobs at once per day, which is enough for
`vercel.json`'s single overdue-request scan, daily at 02:30 UTC; Vercel sends
`CRON_SECRET` as a Bearer token for that request.

If this deployment is more than a personal or evaluation project, note that
Vercel's Hobby plan terms are for personal, non-commercial use — check
Vercel's current terms before relying on it for an organization's internal
tooling, and move to a Pro/Team plan if that applies to you.

Recommended release flow:

1. Apply the database migration to a staging Supabase project.
2. deploy a Vercel Preview environment;
3. complete the mobile, permission and concurrency acceptance checklist;
4. rehearse database restore;
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
        +--> Supabase PostgreSQL
        +--> Google Drive (image uploads)
        +--> Resend email

Vercel Cron --> overdue-request scan (daily)
```

Inventory issue/return and program/ticket status changes run through
row-locked Postgres functions (`perform_inventory_request_action`,
`perform_program_request_action`, `perform_ticket_action`), so concurrent
actions on the same request or ticket serialize instead of racing.

## API surface

The implementation exposes `/api/v1` groups for session, users, departments,
places, rosters, inventory types, inventory requests, program requests and
sessions, tickets, comments, images, home content/settings, links and the
overdue-request cron.

Image uploads are limited to JPEG, PNG and WebP files up to 50KB, stored on
Google Drive with link-based view access; only the Drive file id is kept in
the database.

## Operational notes

- All timestamps are stored in UTC and rendered in the user's configured time
  zone; the default is `Asia/Kolkata`.
- There is no per-user disable switch — access is controlled entirely by
  domain membership (`ALLOWED_EMAIL_DOMAIN`). Revoking someone's organisation
  Google account revokes their access to this app.
- Admins cannot demote their own account out of the admin role.
- Inventory availability is computed on read (total minus everything
  currently issued or returned in non-good condition), not stored.
- Failed email sends are logged to the `failed_emails` table for admins to
  review, not retried automatically.
- There is no AppSheet data import in this release.
- Production backup and point-in-time recovery are provided by the selected
  Supabase plan (not included on Free) and must be verified with a restore
  rehearsal before launch.
