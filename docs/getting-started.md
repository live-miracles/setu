# Getting started

How to set up a developer environment for Setu and run the app locally. To put the
app in front of users, continue with [Deployment](deployment.md). If something
fails, see [Troubleshooting](troubleshooting.md).

## Try it without Supabase

To look around the app first, run the demo. It serves the real frontend, signed in as
a fictional administrator, with invented people, programs, inventory and rosters
instead of a Supabase project. It needs no credentials and touches no real data.
Approving, rejecting and commenting on requests work and are kept in memory until
you stop the server; every other change fails.

```bash
npm install
npm run demo   # http://localhost:47195
```

The data lives in `build-tools/demo-data.mjs`, with dates relative to today. The
README screenshots come from the same demo: `npm run screenshots` regenerates the
stills in `docs/images/`, and `npm run demo:gif` re-records the walkthrough GIF. Both
need Chrome (set `CHROME_PATH` if it isn't in a standard location); the GIF also
needs ffmpeg.

## Requirements

- Node.js 26 or newer
- Access to the Setu Supabase project (shared by production and development)
- A Google OAuth client configured for that Supabase project
- Git

Docker is not required for the recommended hosted-development workflow. The
Supabase CLI is installed as a project dependency by `npm install`.

## 1. Install the project

```bash
git clone <repository-url>
cd setu
npm install
cp .env.example .env.local
```

Edit `.env.local` with the URL and publishable/anon key for the Setu Supabase
project. Production and local development share this one project, so local
work reads and writes live data: sign in with a test account, don't run bulk or
destructive changes, and remember that comments queue real emails to the
request's participants. In the Supabase dashboard, open the project, then go to
**Project Settings → API Keys**, "Publishable and secret API keys" tab:

```env
SETU_SUPABASE_URL=https://<project-ref>.supabase.co
SETU_SUPABASE_PUBLISHABLE_KEY=<the "Publishable key" value shown there>
```

`.env.local` is ignored by Git. Never put a service-role/secret key or OAuth
secret in it — only the publishable key is safe to use here.

## 2. Configure Supabase Auth

The frontend signs users in with Google OAuth, which needs an OAuth client in
Google Cloud plus matching config in Supabase. Do this before your first
sign-in attempt — see the note at the end of step 3 if you already tried
signing in.

**In Google Cloud Console** ([APIs & Credentials](https://console.cloud.google.com/apis/credentials)):

1. Pick or create a GCP project for this app. If prompted, configure the
   OAuth consent screen first (app name, support email) — this is a one-time
   step per GCP project. While the app is in "Testing" mode, only accounts
   you explicitly add as test users can sign in.
2. **Create Credentials → OAuth client ID** → Application type **Web
   application**.
3. Under **Authorized JavaScript origins**, add `http://localhost:47193` (plus
   the Vercel domain, see [Deployment](deployment.md#deploy-to-vercel)).
4. Under **Authorized redirect URIs**, add the callback URL shown in the
   Supabase panel from the next step, typically
   `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Click **Create**. Google shows a **Client ID**
   (`....apps.googleusercontent.com`) and **Client Secret** (`GOCSPX-...`) —
   keep this tab open, you'll need both in the next step.

**In the Supabase dashboard**, under **Authentication → Sign In / Providers**
(this section may just be labeled "Providers" in older dashboard versions),
scroll to **Auth Providers** and click **Google**:

1. Paste the Client ID into **Client IDs** and the Client Secret into
   **Client Secret (for OAuth)**.
2. Leave **Skip nonce checks** and **Allow users without an email** off —
   they're workarounds for platforms Setu doesn't need (native iOS flows,
   providers that omit email).
3. Toggle **Enable Sign in with Google** on, then **Save**.

Without this provider setup, the browser will show
`Unsupported provider: provider is not enabled`.

## 3. Apply the schema and deploy the API

Authenticate the Supabase CLI and connect it to the project. `supabase login`
opens a browser tab to authorize the CLI — run it from an interactive
terminal, not a non-interactive/CI shell. This is the same project that serves
production, so the commands below are only needed for the first setup; after
that, merging to `master` deploys migrations and functions automatically.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase secrets set SETU_APP_ORIGIN=https://<vercel-domain> SETU_EXTRA_ORIGINS=http://localhost:47193
npx supabase functions deploy api
```

`SETU_APP_ORIGIN` is the public app origin (used for CORS and the “View
request” email links). `SETU_EXTRA_ORIGINS` is an optional comma-separated list
of additional browser origins the API accepts; it lets `npm run dev` call the
production API. Without it, the browser blocks local requests with a CORS
error. If you use another port (`PORT=3001 npm run dev`), add that origin too.

Because `db push` and `functions deploy` here change production, avoid running
them from an unmerged branch: a migration that fails halfway or drops data
cannot be undone without a restore (see [Database backups](database-backups.md)).
`npm test` runs every migration against an isolated PostgreSQL (PGlite), so run
it before merging.

`db push` applies the checked-in migrations, including the trigger that creates
a `profiles` row for each new Supabase Auth user.

**Complete this step before your first Google sign-in.** If you already signed
in earlier (e.g. while testing the OAuth setup in step 2, before `db push` had
run), your `auth.users` row exists but has no matching `profiles` row — see
[Troubleshooting](troubleshooting.md).

Optional one-time setup that is not needed to run the app locally: comment
email delivery and the email-domain allowlist are covered in
[Deployment](deployment.md).

## 4. Run the frontend

```bash
npm run dev
```

Open <http://localhost:47193> and sign in with Google. The dev server uses the
same Supabase API transport as the Vercel build.

## 5. Make yourself an administrator

New Supabase Auth users receive a profile through the database trigger. Assign
the first development administrator explicitly in the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

## Roles

The database roles are `admin`, `approver`, `viewer`, and `user`:

| Role       | Access                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| `admin`    | Everything, including settings and role management                           |
| `approver` | Requests, approvals, scheduling, and read-only users                         |
| `viewer`   | All requests and standard app sections, including roster and inventory types |
| `user`     | Own and participant requests, plus roster and inventory types                |

## Useful commands

```bash
npm run dev             # Start the local frontend
npm run demo            # Run the app on fictional data, no Supabase needed
npm run screenshots     # Regenerate the README stills from the demo (needs Chrome)
npm run demo:gif        # Re-record the README walkthrough GIF (needs Chrome, ffmpeg)
npm test                # Run the tests (migrations run against an in-memory Postgres)
npm run typecheck       # Type-check backend and frontend
npm run format:check    # Check formatting
npm run format          # Fix formatting
npm run build:vercel    # Build the Vercel output in web/
npx supabase db push   # Apply migrations to the linked project
npx supabase functions deploy api
```

There is no mock backend: the app always talks to the Supabase project from
`.env.local`.

## Project layout

- `frontend/` — the browser application (React, Tailwind, PWA manifest and service worker).
- `frontend/src/ui/` — the in-repo UI kit (see [ADR 0001](adr/0001-own-ui-kit.md)).
- `supabase/migrations/` — the database schema.
- `supabase/functions/api/` — the authenticated API boundary.
- `supabase/functions/email-dispatcher/` — the comment-email worker.
- `shared/types.d.ts` — the frontend/API contract.
- `build-tools/` — dev server, Vercel build, and the test suite.
- [`CONTEXT.md`](../CONTEXT.md) — glossary of the domain terms used in the code.
