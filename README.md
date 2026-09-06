# Setu

Setu is an internal operations app migrating from Google Apps Script, Google
Sheets, and Google Drive to Supabase and Vercel.

It supports:

- equipment and program requests
- tickets and comments
- roster scheduling
- inventory, programs, home content, and user settings
- email notifications and request images

## How it works

```text
Browser → Vercel → Supabase Auth / Edge Functions / Postgres / Storage
```

The Supabase migration lives in `supabase/`, and the Vercel frontend lives in
`frontend/`. `src/` and the Apps Script build tools remain temporarily for the
legacy deployment. Shared API types are in `shared/types.d.ts`.

## Local development

```bash
npm install
cp .env.example .env.local
# Set the values for your Supabase development project in .env.local.
npm run dev
```

Open <http://localhost:3000>. Local development calls the same Supabase Edge
Function and uses the same authentication and RLS rules as Vercel. Configure
Google OAuth in the development Supabase project before signing in.

Useful commands:

```bash
npm run typecheck   # Type-check backend and frontend
npm run build       # Build the Apps Script HTML shell and validate production JS
npm run supabase:start # Start a local Supabase stack (Supabase CLI required)
npm run supabase:reset # Apply migrations to the local stack
npm run supabase:serve # Serve the API Edge Function locally
```

For a local stack, copy `supabase/.env.example` to `supabase/.env.local` and
set its browser origin before running `npm run supabase:serve`. Use the local
API URL and anon/publishable key reported by `supabase status` in `.env.local`.
`supabase db reset` loads the small catalog in `supabase/seed.sql`. After the
first local sign-in, promote that development profile to admin from the SQL
editor if you need to exercise administrative workflows.

## Google setup

Deployment is handled by GitHub Actions. Create the following resources first:

1. A Google Sheet for app data.
2. A Google Apps Script project.
3. A web-app deployment that executes as the deploying account. The deploying account is always treated as an administrator.
4. A Google Drive folder for uploaded request images.

The Apps Script manifest requests the full Drive scope because uploads resolve
an existing folder by ID, create files in it, and set link-sharing permissions.
After changing this scope or deploying a new version, the deploying account
must authorize the updated deployment when prompted.

Add these GitHub Actions secrets:

- `APPS_SCRIPT_ID` — Apps Script project ID.
- `APPS_SCRIPT_DEPLOYMENT_ID` — web-app deployment ID.
- `CLASPRC_JSON` — the contents of `~/.clasprc.json` after running `npx clasp login`.

Set these Apps Script properties:

- `SPREADSHEET_ID` — the app’s Google Sheet ID.
- `IMAGES_DRIVE_FOLDER_ID` — Drive folder ID for request images.
- `NOTIFICATION_EMAIL` — optional address used for notifications.

After configuration, run `setupSheets` and `installTriggers` once from the Apps Script editor.

### Email notifications and triggers

Email notifications are sent synchronously when comments or related request updates create a notification. The app uses `GmailApp` first and falls back to `MailApp`. The configured `NOTIFICATION_EMAIL` is used as the notification sender/address, while the request owner, lead, and participants receive the message. Duplicate notifications are suppressed for six hours. Failed sends are recorded in the `FailedEmails` sheet; they are not retried by a scheduled job.

The deployment workflow only builds, pushes, and deploys the Apps Script code. It does not create Apps Script triggers. Run `installTriggers` manually once in the Apps Script editor after the first deployment. This installs the daily `dailyOverdueScan` trigger, which runs once per day at approximately 3 AM in the script time zone. It currently scans overdue inventory requests and does not send email.

No hourly trigger is required for the current email notifications. If scheduled emails are added in the future, the corresponding time-driven trigger must be added to `installTriggers` and the installer must be run manually again.

## Deployment

Create a new version and push its tag to deploy the app:

```bash
npm version patch        # or minor / major
git push origin master --follow-tags
```

`npm version` updates `package.json` and `package-lock.json`, creates a release commit, and creates the corresponding `v*` Git tag. The deployment workflow runs when that tag is pushed.

The deployment workflow type-checks, builds, pushes the Apps Script files, and updates the existing deployment. It can also be run manually from GitHub Actions.

## Access and roles

Users sign in through the Google Workspace restriction configured on the Apps Script deployment. New users are registered automatically. The deploying account always receives the `admin` role; other users receive the `user` role until an administrator changes it.

| Role       | Access                                                            |
| ---------- | ----------------------------------------------------------------- |
| `admin`    | Everything, including settings and role management                |
| `approver` | All requests, approvals, tickets, scheduling, and read-only users |
| `viewer`   | All requests and standard app sections except Roster              |
| `user`     | Own and participant requests; no Roster or Tickets                |

Everyone can create equipment and program requests and comment on requests they can see. Participants can be external email addresses and do not need a Setu account.

## Current limitations

- Participants and images can only be added when a request is created.
