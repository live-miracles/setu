# Setu

Setu is an internal operations app built with Google Apps Script, Google Sheets, Google Drive, and a TypeScript frontend.

It supports:

- equipment and program requests
- tickets and comments
- roster scheduling
- inventory, programs, home content, and user settings
- email notifications and request images

## How it works

```text
Browser → Apps Script web app → Google Sheets
                              ├→ Google Drive
                              └→ MailApp
```

The backend lives in `src/`. The frontend lives in `frontend/` and is bundled into the HTML files served by Apps Script. Shared types are in `shared/types.d.ts`.

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The local app uses an in-memory mock backend, so it does not require a Google account or a configured Sheet.

Useful commands:

```bash
npm run typecheck   # Type-check backend and frontend
npm run build       # Build Apps Script HTML files
npm run pages       # Build the public demo site
```

## Google setup

Deployment is handled by GitHub Actions. Create the following resources first:

1. A Google Sheet for app data.
2. A Google Apps Script project.
3. A web-app deployment that executes as the deploying account. The deploying account is always treated as an administrator.
4. A Google Drive folder for uploaded request images.

Add these GitHub Actions secrets:

- `APPS_SCRIPT_ID` — Apps Script project ID.
- `APPS_SCRIPT_DEPLOYMENT_ID` — web-app deployment ID.
- `CLASPRC_JSON` — the contents of `~/.clasprc.json` after running `npx clasp login`.

Set these Apps Script properties:

- `SPREADSHEET_ID` — the app’s Google Sheet ID.
- `IMAGES_DRIVE_FOLDER_ID` — Drive folder ID for request images.
- `NOTIFICATION_EMAIL` — optional address used for notifications.

After configuration, run `setupSheets` and `installTriggers` once from the Apps Script editor.

## Deployment

Push a version tag to deploy the app:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The deployment workflow type-checks, builds, pushes the Apps Script files, and updates the existing deployment. It can also be run manually from GitHub Actions.

## Public demo

The public demo is built from the mock backend and published at:

<https://live-miracles.github.io/setu/>

The demo has no access to the production Google Sheet.

## Access and roles

Users sign in through the Google Workspace restriction configured on the Apps Script deployment. New users are registered automatically. The deploying account always receives the `admin` role; other users receive the `user` role until an administrator changes it.

| Role | Access |
| --- | --- |
| `admin` | Everything, including settings and role management |
| `approver` | All requests, approvals, tickets, scheduling, and read-only users |
| `viewer` | All requests and standard app sections except Roster |
| `user` | Own and participant requests; no Roster or Tickets |

Everyone can create equipment and program requests and comment on requests they can see. Participants can be external email addresses and do not need a Setu account.

## Current limitations

- Participants and images can only be added when a request is created.
- Action confirmations currently use browser prompts instead of custom modals.
