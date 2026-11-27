# Deployment

Everything needed to run Setu beyond a developer machine: free-tier limits, Vercel,
comment email delivery, the email-domain allowlist, and automatic deploys. Local
setup is in [Getting started](getting-started.md).

## Free-tier deployment

This architecture can run on the free tiers of Supabase and Vercel, within each
provider's current quotas and terms. Setu uses a single Supabase project for
both production and local development: the free plan allows only two active
projects, and this is a small internal app. Supabase hosts the database, Storage,
and Edge Functions, including the 10-minute comment-email worker that sends
through the Gmail API, and Vercel only serves the static frontend. Supabase's
current Free plan includes two active projects, 500,000 Edge Function
invocations, 1 GB of file storage, and 500 MB of database storage per project.
Free projects pause after 7 days with no API activity.

[`.github/workflows/keep-alive.yml`](../.github/workflows/keep-alive.yml) pings
the project every 3 days to prevent this. It needs two repository secrets
(**Settings → Secrets and variables → Actions** in GitHub), using the URL and
publishable key from the project's **Project Settings → API Keys** page (see
[Getting started](getting-started.md#1-install-the-project) for where to find these):

- `SETU_SUPABASE_URL_PROD` / `SETU_SUPABASE_PUBLISHABLE_KEY_PROD`

Trigger a manual run from the **Actions** tab (**Keep Supabase projects
alive → Run workflow**) to verify it after setup.

Comment email delivery uses the Gmail API sending limits of the mailbox that
authorized it (roughly 500 recipients a day for a consumer Gmail account and
2,000 for Google Workspace), so this path is intended for Setu's low-volume
internal notifications.

See the providers' current plan details before relying on these numbers:
[Supabase pricing](https://supabase.com/pricing),
[Vercel pricing](https://vercel.com/pricing), and
[Gmail sending limits](https://support.google.com/a/answer/166852).

## Deploy to Vercel

Not required for local development — `npm run dev` runs the full app against the
Setu Supabase project without Vercel. This section only applies when you're ready
to deploy a preview or production build. It uses the same Supabase project as
local development.

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
  or `https://<project>-*-<team-slug>.vercel.app/**` to also cover this
  project's preview deployments). Never use a bare `https://*.vercel.app/**`:
  anyone can publish a site on `vercel.app`, so it would let another site
  receive the sign-in result.

Skip this and Google sign-in still completes, but the browser is sent back to
whatever Site URL happens to be set — often `http://localhost:3000`, left
over from local dev — instead of the Vercel domain.

Also add the Vercel domain to the Google OAuth client from
[Getting started](getting-started.md#2-configure-supabase-auth): under
**Authorized JavaScript origins**, add `https://<vercel-domain>`. The
**Authorized redirect URIs** entry doesn't need to change — Google always
redirects to the Supabase callback URL, not the app directly.

### 3. Deploy the database and API to this project

Vercel only builds and serves `web/`; the database schema and Edge Functions
are deployed separately (automatically from `master`, see
[Automatic deploys](#automatic-supabase-deploys)). To do it by hand, run these
against the same project used in step 1 (pass `--project-ref <project-ref>` if it
isn't the CLI's currently linked project):

```bash
npx supabase secrets set SETU_APP_ORIGIN=https://<vercel-domain> SETU_EXTRA_ORIGINS=http://localhost:47193 --project-ref <project-ref>
npx supabase functions deploy api --project-ref <project-ref>
npx supabase db push --project-ref <project-ref>
```

Skipping this step is the most common cause of a newly connected Vercel
deployment showing "Something went wrong / getDashboard: Failed to send a
request to the Edge Function" — see [Troubleshooting](troubleshooting.md).

## Automatic Supabase deploys

Supabase migrations and the `api` and `email-dispatcher` Edge Functions are
deployed automatically to the Setu project by
`.github/workflows/deploy-supabase.yml` when Supabase migrations, functions,
or configuration files change on `master`. Add `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_PROJECT_REF_PROD` as repository secrets, then use the workflow's
manual dispatch when needed. The workflow applies migrations and deploys both
functions independently; manual dispatch runs both deployment areas.

## Comment email delivery

Comments enqueue email rows transactionally in `email_outbox`. Every ten
minutes pg_cron calls `public.run_comment_email_dispatch()`, which posts to the
`email-dispatcher` Edge Function with a shared secret. The function exchanges a
stored Google refresh token for an access token, claims at most 50 pending rows
through the `claim_comment_email_batch` RPC, sends each one with the Gmail API
`users.messages.send` endpoint, and marks it `sent`. A failed send is retried
with a growing delay and marked `failed` after five attempts. Rows are claimed
with `for update skip locked`, so overlapping runs never send the same row
twice. If the token refresh fails, no rows are claimed.

One-time Gmail setup (free; repeat the last two steps if the token is revoked):

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project (a personal account can own it), enable the **Gmail API**, and set up
   the OAuth consent screen. Add the `https://www.googleapis.com/auth/gmail.send`
   scope. With an **External** consent screen, set the publishing status to
   **In production**: refresh tokens issued in **Testing** expire after 7 days.
   An unverified app shows a warning on the one-time sign-in, which is fine for
   a single sending mailbox.
2. Create an OAuth client of type **Web application** and add
   `https://developers.google.com/oauthplayground` as an authorized redirect URI.
3. In the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground),
   open the settings, tick **Use your own OAuth credentials**, and enter the
   client ID and secret. Authorize the `gmail.send` scope while signed in as the
   mailbox that should send the emails, then exchange the authorization code
   and copy the refresh token. If the sign-in says the app is blocked by an
   administrator, that Workspace does not allow third-party Gmail access; use a
   different mailbox or ask the admin to trust the OAuth client.
4. Set the function secrets (on each project) and deploy:

```bash
npx supabase secrets set GOOGLE_CLIENT_ID=<client-id> GOOGLE_CLIENT_SECRET=<client-secret> GOOGLE_REFRESH_TOKEN=<refresh-token> GMAIL_SENDER=<sending-address> EMAIL_DISPATCH_SECRET=<random-string> --project-ref <project-ref>
```

```bash
npx supabase functions deploy email-dispatcher --no-verify-jwt --project-ref <project-ref>
```

5. Store the scheduler's endpoint and the same shared secret in Vault by running
   this in the SQL editor (skip any secret that already exists):

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'setu_project_url');
select vault.create_secret('<same-random-string>', 'setu_email_dispatch_secret');
```

`GMAIL_SENDER` must be the authorized mailbox's address (or one of its Gmail
“Send mail as” aliases). Optional secrets: `EMAIL_SENDER_NAME` (defaults to
`Live Stream Setu`), `EMAIL_REPLY_TO` (where replies should go instead of the
sending mailbox), `EMAIL_TIME_ZONE` for session times (defaults to
`Asia/Kolkata`), and `CC_EMAIL`, an additional address that should receive a
copy of every email; multiple comma-separated addresses are supported. The
configured address is added alongside the lead and request participants, with
duplicates and the primary recipient removed automatically. “View request”
links use the existing `SETU_APP_ORIGIN` secret. Until the required secrets
are set, the function does nothing and queued rows stay pending.

Email subjects use the request serial, the same combined request title shown
in the detail view, and the start month/year, for example
`PRG-7 - English Workshop Title | Sep 2026`. The body starts with the author's
name and comment, renders the full session or inventory list as an HTML `<ul>`,
and ends with a clickable “View request” link to the request in Setu. A
plain-text body is included as a fallback.

## Email-domain access control

The Admin Settings page manages the allowed email domains. An empty list keeps
the app open to all domains; adding the first domain switches the app to
allowlist mode. The migration creates the Supabase `Before User Created` Auth
Hook function. For hosted projects, enable it once in **Authentication →
Hooks** using the Postgres function
`public.restrict_user_by_email_domain` (the checked-in `supabase/config.toml`
contains the equivalent local configuration). A refreshed page is enough for
an existing session to pick up a changed allowlist.

## Database backups

The free Supabase plan has no managed backups; a paid Supabase plan includes
them. This repository deliberately contains no backup job, because workflow
artifacts of a public repository can be downloaded by anyone. On the free plan,
run an encrypted weekly backup from a small separate private repository
instead. [Database backups](database-backups.md) has the setup, a ready-to-use
workflow template, and the restore steps.

## Content-Security-Policy and custom Supabase domains

`vercel.json` sets a Content-Security-Policy that lets the app talk to `https://*.supabase.co`. If the project uses a custom Supabase domain, add it to the `connect-src` and `img-src` lists there. If `frontend/shell.html`'s inline theme script changes, update its `sha256-` hash in the policy; `npm test` fails until you do.
