# Setu

Setu is an internal operations app being migrated from Google Apps Script and
Google Sheets to Supabase and Vercel. The current frontend is a Vercel-style
static app; its API boundary is a Supabase Edge Function backed by Postgres.

It covers equipment and program requests, tickets and comments, roster
scheduling, inventory, programs, home content, and user settings.

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
- `src/` and the Apps Script build files are retained temporarily for the
  legacy deployment and are not the normal development path.

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
organization has more than one, confirm which is the shared *development*
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
```

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
not been migrated, that operation still needs to be ported from the legacy
Apps Script implementation.

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
profile-creation trigger only fires for auth users created *after* the
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

## Deploy to Vercel

Not required for local development — `npm run dev` (step 4 above) runs the
full app against your Supabase dev project without Vercel. This section only
applies when you're ready to deploy a preview or production build.

Connect the repository to Vercel and set these environment variables for the
appropriate Vercel environments (Preview and Production):

- `SETU_SUPABASE_URL`
- `SETU_SUPABASE_PUBLISHABLE_KEY`

Vercel uses `npm run build:vercel` and publishes `web/` as configured in
`vercel.json`. Add the deployed Vercel URL to Supabase Auth's site and redirect
URL settings, and configure the Google OAuth client for that URL where
required. Set the API's CORS origin and deploy the Edge Function and database
migrations separately with the Supabase CLI or CI:

```bash
npx supabase secrets set SETU_APP_ORIGIN=https://<vercel-domain>
npx supabase functions deploy api
npx supabase db push
```

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

| Role       | Access                                                        |
| ---------- | ------------------------------------------------------------- |
| `admin`    | Everything, including settings and role management            |
| `approver` | Requests, approvals, tickets, scheduling, and read-only users |
| `viewer`   | All requests and standard app sections except roster          |
| `user`     | Own and participant requests; no roster or tickets            |

New Supabase Auth users receive a profile through the database trigger. Assign
the first development administrator explicitly in the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

## Legacy Apps Script deployment

The old Google Apps Script backend remains under `src/` only while migration
work is in progress. Its CI workflow is `.github/workflows/deploy.yml` and its
build commands are:

```bash
npm run build
npm run build:backend
```

Those commands are not required to run the Supabase/Vercel application. Do not
add new application behavior to the legacy backend unless it is part of a
planned compatibility change.
