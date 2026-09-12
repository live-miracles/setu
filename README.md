# Setu

Setu is an internal operations app built on Supabase and Vercel. The frontend
is a Vercel-style static app; its API boundary is a Supabase Edge Function
backed by Postgres.

It covers equipment and program requests, comments, roster scheduling,
inventory, programs, home content, and user settings.

## Free-tier deployment

This architecture can run on the free tiers of Supabase and Vercel for both
the Setu and Setu Dev environments, within each provider's current quotas and
terms. Supabase hosts the database, Storage, Edge Functions, and the 10-minute
`pg_cron` job; Vercel only serves the static frontend. Supabase's current Free
plan includes two active projects, 500,000 Edge Function invocations, 1 GB of
file storage, and 500 MB of database storage per project. Free projects may be
paused after inactivity, so the first request after a pause can be slower.

Comment email delivery also depends on the email provider's limits. The
current Resend Free plan includes 3,000 transactional emails per month with a
100-email daily limit. The application intentionally treats delivery as
best-effort and does not retry failed messages. Vercel's Hobby plan has its
own usage limits and is intended for personal, non-commercial use, so check
Vercel's current terms if this becomes a commercial deployment.

See the providers' current plan details before relying on these numbers:
[Supabase pricing](https://supabase.com/pricing),
[Vercel pricing](https://vercel.com/pricing), and
[Resend pricing](https://resend.com/pricing/).

## Architecture

```text
Browser → Vercel static app → Supabase Auth
                           ├→ Edge Function: api
                           ├→ Postgres
                           └→ Storage
```

- `frontend/` contains the browser application.
- `supabase/migrations/` contains the database schema.
- `supabase/functions/api/` contains the authenticated API boundary.
- `shared/types.d.ts` contains the frontend/API contract.

## Requirements

- Node.js 22 or newer
- A Supabase account and a development project
- A Google OAuth client configured for that Supabase project
- Git

Docker is not required for the recommended hosted-development workflow. The
Supabase CLI is installed as a project dependency by `npm install`.

## Start a new developer environment

### 1. Install the project

```bash
git clone <repository-url>
cd setu
npm install
cp .env.example .env.local
```

Edit `.env.local` with the URL and publishable/anon key for the Supabase
development project. In the Supabase dashboard, open the project (if your
organization has more than one, confirm which is the shared _development_
project before continuing — do not point `.env.local` at a production
project), then go to **Project Settings → API Keys**, "Publishable and secret
API keys" tab:

```env
SETU_SUPABASE_URL=https://<project-ref>.supabase.co
SETU_SUPABASE_PUBLISHABLE_KEY=<the "Publishable key" value shown there>
```

`.env.local` is ignored by Git. Never put a service-role/secret key or OAuth
secret in it — only the publishable key is safe to use here.

### 2. Configure Supabase Auth

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
3. Under **Authorized JavaScript origins**, add `http://localhost:3000`.
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

### 3. Apply the schema and deploy the API

Authenticate the Supabase CLI and connect it to the development project.
`supabase login` opens a browser tab to authorize the CLI — run it from an
interactive terminal, not a non-interactive/CI shell:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase secrets set SETU_APP_ORIGIN=http://localhost:3000
npx supabase functions deploy api
npx supabase functions deploy email-dispatcher
```

Comment email delivery

Comments enqueue email rows transactionally in `email_outbox`. Deploy the
`email-dispatcher` function with `RESEND_API_KEY`, `EMAIL_FROM`, and a shared
`EMAIL_DISPATCH_SECRET`. Schedule an authenticated POST to the function every
10 minutes using the checked-in Supabase Cron/pg_net job. Store the project
URL in Vault as `setu_project_url` and the same dispatch secret used by the
function as `setu_email_dispatch_secret`. The dispatcher claims at most 100 pending
rows, marks successful deliveries as `sent`, and marks failures as terminal
`failed` rows; failed mail is intentionally not retried.

If any of `RESEND_API_KEY`, `EMAIL_FROM`, or `EMAIL_DISPATCH_SECRET` is empty,
the dispatcher immediately returns without claiming or sending any queue rows.

Email-domain access control

The Admin Settings page manages the allowed email domains. An empty list keeps
the app open to all domains; adding the first domain switches the app to
allowlist mode. The migration creates the Supabase `Before User Created` Auth
Hook function. For hosted projects, enable it once in **Authentication →
Hooks** using the Postgres function
`public.restrict_user_by_email_domain` (the checked-in `supabase/config.toml`
contains the equivalent local configuration). A refreshed page is enough for
an existing session to pick up a changed allowlist.

`db push` applies the checked-in migrations, including the trigger that
creates a `profiles` row for each new Supabase Auth user. `SETU_APP_ORIGIN`
is required for the API's CORS policy.

**Complete this step before your first Google sign-in.** If you already
signed in earlier (e.g. while testing the OAuth setup in step 2, before
`db push` had run), your `auth.users` row exists but has no matching
`profiles` row — see [Troubleshooting](#troubleshooting) below.

### 4. Run the frontend

```bash
npm run dev
```

Open <http://localhost:3000> and sign in with Google. The dev server uses the
same Supabase API transport as the Vercel build.

## Useful commands

```bash
npm run dev             # Start the local frontend
npm run typecheck       # Type-check backend and frontend
npm run format:check    # Check formatting
npm run build:vercel    # Build the Vercel output in web/
npx supabase db push   # Apply migrations to the linked project
npx supabase functions deploy api
```

There is no mock backend. If the Edge Function reports that an operation has
not been migrated, that operation is not implemented yet.

## Troubleshooting

**Browser shows "Something went wrong / Failed to send a request to the Edge
Function"**: the `api` function isn't deployed to your linked project yet.
Run `npx supabase functions deploy api` (step 3).

**Browser shows "Something went wrong / Edge Function returned a non-2xx
status code"**: check the function logs in the Supabase dashboard
(**Edge Functions → api → Logs**). An error there reading `Cannot coerce the
result to a single JSON object` means a `.single()` query got zero rows —
almost always because the signed-in user has no matching `public.profiles`
row. This happens if you signed in before running `db push`, since the
profile-creation trigger only fires for auth users created _after_ the
trigger exists. Fix it by backfilling the missing row(s) for any existing
`auth.users` from the Supabase dashboard's SQL Editor:

```sql
insert into public.profiles (id, email, name)
select u.id, coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
```

This only inserts rows for users missing a profile, so it's safe to re-run.
New sign-ins after `db push` don't need this — the trigger handles them
automatically.

If every account has a profile and you still see this error only for an
`admin`/`approver` account: the `profiles` RLS policy lets admins/approvers
read every profile row, so an unfiltered `select('*').single()` query for
"my own profile" can return more than one row. The Edge Function code
filters explicitly by `.eq('id', userId)` before `.single()` for this
reason — if you're extending `supabase/functions/api/index.ts`, follow the
same pattern rather than relying on RLS alone to narrow a `.single()` query.

**Browser shows "Unsupported provider: provider is not enabled"**: the
Google provider isn't turned on yet, or Client ID/Secret aren't saved — see
step 2.

**Signing in on a Vercel deployment redirects to `localhost` instead of the
app**: that project's Supabase Auth **Site URL** is still pointing at the
local dev default. See [Deploy to Vercel](#deploy-to-vercel) step 2.

## Deploy to Vercel

Not required for local development — `npm run dev` (step 4 above) runs the
full app against your Supabase dev project without Vercel. This section only
applies when you're ready to deploy a preview or production build, and it
typically uses its own Supabase project rather than the shared development
project from step 1.

### 1. Connect the repository to Vercel

Set these environment variables for the appropriate Vercel environments
(Preview and Production):

- `SETU_SUPABASE_URL`
- `SETU_SUPABASE_PUBLISHABLE_KEY`

Vercel uses `npm run build:vercel` and publishes `web/` as configured in
`vercel.json`.

### 2. Point Supabase Auth at the Vercel domain

In the Supabase dashboard, for the project this Vercel deployment uses, go to
**Authentication → URL Configuration**:

- Set **Site URL** to the deployed domain, e.g. `https://<vercel-domain>`.
- Add that same URL to **Redirect URLs** (use `https://<vercel-domain>/**`,
  or `https://*.vercel.app/**` to also cover preview deployments).

Skip this and Google sign-in still completes, but the browser is sent back to
whatever Site URL happens to be set — often `http://localhost:3000`, left
over from local dev — instead of the Vercel domain.

Also add the Vercel domain to the Google OAuth client from step 2 above:
under **Authorized JavaScript origins**, add `https://<vercel-domain>`. The
**Authorized redirect URIs** entry doesn't need to change — Google always
redirects to the Supabase callback URL, not the app directly.

### 3. Deploy the database and API to this project

Vercel only builds and serves `web/`; the database schema and Edge Function
are deployed separately. Run these against the same project used in step 1
(pass `--project-ref <project-ref>` if it isn't the CLI's currently linked
project):

```bash
npx supabase secrets set SETU_APP_ORIGIN=https://<vercel-domain> --project-ref <project-ref>
npx supabase functions deploy api --project-ref <project-ref>
npx supabase db push --project-ref <project-ref>
```

Skipping this step is the most common cause of a newly connected Vercel
deployment showing "Something went wrong / getDashboard: Failed to send a
request to the Edge Function" — see [Troubleshooting](#troubleshooting).

## Migration status

The current Edge Function implements `whoAmI`, `getDashboard`, and
`updateOwnProfile`. The remaining CRUD and workflow operations are still being
migrated; the frontend contract remains in `shared/types.d.ts` so each
operation can be ported incrementally.

The database schema already replaces Sheets-era JSON and comma-separated
fields with relational tables. Image storage is represented by the private
`request-images` bucket and still needs its complete upload/signing workflow.

## Roles

The database roles are `admin`, `approver`, `viewer`, and `user`:

| Role       | Access                                               |
| ---------- | ---------------------------------------------------- |
| `admin`    | Everything, including settings and role management   |
| `approver` | Requests, approvals, scheduling, and read-only users |
| `viewer`   | All requests and standard app sections except roster |
| `user`     | Own and participant requests; no roster              |

New Supabase Auth users receive a profile through the database trigger. Assign
the first development administrator explicitly in the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```
