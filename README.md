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
development project:

```env
SETU_SUPABASE_URL=https://<project-ref>.supabase.co
SETU_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
```

`.env.local` is ignored by Git. Never put a service-role key or OAuth secret
in it.

### 2. Configure Supabase Auth

In the Supabase dashboard for the development project:

1. Enable Google under Authentication → Providers.
2. Set the site URL to `http://localhost:3000` and add it to the allowed
   redirect URLs.
3. In Google Cloud, add the Supabase callback URL shown by the provider
   settings (typically `https://<project-ref>.supabase.co/auth/v1/callback`) to
   the OAuth client's authorized redirect URIs.

The frontend signs users in with Google OAuth. Without this provider setup,
the browser will show `Unsupported provider: provider is not enabled`.

### 3. Apply the schema and deploy the API

Authenticate the Supabase CLI and connect it to the development project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase secrets set SETU_APP_ORIGIN=http://localhost:3000
npx supabase functions deploy api
```

`db push` applies the checked-in migrations. The Supabase runtime supplies its
standard function credentials; `SETU_APP_ORIGIN` is required for the API's
CORS policy.

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

## Deploy to Vercel

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
