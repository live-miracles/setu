# Livestream Operations — Apps Script + Sheets

A Google Apps Script web app that uses a Google Sheet as its database, following the same deployment pattern as `multi-lang-qa`. Runs entirely on Google's free tier: no hosting bill, no database that pauses itself after a week of inactivity.

## Architecture

```text
Browser
   |
   | google.script.run
   v
Apps Script web app (doGet + ~30 exposed functions)
   |
   +--> Google Sheet (one tab per entity, via the SheetTable helper)
   +--> Google Drive (private "Setu Attachments" folder)
   +--> MailApp (notification emails)

Time-driven trigger --> daily overdue-request scan
```

Everything — backend and frontend — is TypeScript. The backend compiles via `clasp push` directly to the Apps Script runtime (V8); the frontend compiles via plain `tsc` (no bundler/framework) into a single inlined `<script>` block served by `HtmlService`. Both share one ambient-global type contract at `shared/types.d.ts`.

## Local development

```bash
npm install
npm run dev
```

This starts `tsc --watch` + Tailwind `--watch` + `browser-sync` on `http://localhost:3000`, serving `frontend-src/` directly against an in-memory mock backend (`frontend-src/ts/01-mock-backend.ts`) — no Google account, Sheet, or Apps Script project needed to develop the UI. `frontend-src/index.html` is the dev shell; it never gets pushed to Apps Script.

```bash
npm run typecheck   # tsc --noEmit against both the backend and frontend programs
npm run build       # compiles + concatenates everything into src/{Index,Stylesheet,JavaScript}.html
```

## One-time Google-side setup

All pushing/deploying happens in CI (see below) — nothing here needs `clasp` installed locally or a local `.clasp.json`. You're just collecting IDs and setting them as GitHub secrets.

1. **Create the Google Sheet.** Any new spreadsheet works — the app creates its own tabs. Copy its ID from the URL (`https://docs.google.com/spreadsheets/d/<ID>/edit`).
2. **Create the Apps Script project** at [script.google.com](https://script.google.com) → New project. Rename it, then copy its Script ID from Project Settings (gear icon) → **IDs** → Script ID.
3. **Deploy as a web app** right away, before any real code is pushed — the placeholder boilerplate is fine, CI will overwrite it. In the Apps Script editor: Deploy → New deployment → Web app → Execute as **Me**, Who has access **Anyone with a Google account**. Copy the deployment ID it gives you.
4. **Get a clasp auth token**, on any machine with a browser (doesn't need to be tied to this project or repo):
    ```bash
    npx clasp login   # one-time interactive OAuth, writes ~/.clasprc.json
    cat ~/.clasprc.json
    ```
5. **Add repo secrets** (Settings → Secrets and variables → Actions) — same names as `multi-lang-qa` uses for its Apps Script deploys:
    - `APPS_SCRIPT_ID` — the Script ID from step 2.
    - `APPS_SCRIPT_DEPLOYMENT_ID` — the deployment ID from step 3.
    - `CLASPRC_JSON` — the raw file contents printed by `cat ~/.clasprc.json` in step 4 (paste as-is, no encoding needed — GitHub secrets hold multi-line text fine). This is a long-lived OAuth refresh token for whichever Google account ran `clasp login` — treat it like a password; rotate by re-running `clasp login` and re-pasting.
6. **Set Script Properties** (Apps Script editor → Project Settings → Script Properties):
    - `SPREADSHEET_ID` — the Sheet ID from step 1.
    - `BOOTSTRAP_ADMIN_EMAIL` — the lowercase Google account email of the first administrator. The first person to open the app with that email becomes the first active admin; everyone else needs to be invited from the Admin section first.
7. **Push the first version tag** (e.g. `git tag v0.1.0 && git push origin v0.1.0`), or run the workflow manually from the Actions tab, to build and push the real code to the deployment from step 3.
8. **Run the one-time setup functions.** In the Apps Script editor, select and run (once each, in this order):
    - `setupSheets` — idempotently creates all 19 tabs with their headers.
    - `ensureAttachmentsFolder` — creates the private "Setu Attachments" Drive folder and stores its ID as a Script Property.
    - `installTriggers` — installs the daily overdue-request-scan trigger.
9. **Find the live URL.** Apps Script editor → Deploy → Manage deployments, next to the deployment ID from step 3.

**First-time visitors will see Google's "unverified app" warning** the first time they authorize (this project won't go through Google's app verification process). For a small internal team this is an expected click-through, not a sign of something broken.

## Continuous deployment (GitHub Actions)

`.github/workflows/deploy.yml` runs `npm run typecheck` + `npm run build` + `clasp push` + `clasp version` + `clasp deploy` automatically whenever you push a tag matching `v*` (e.g. `git tag v1.2.0 && git push origin v1.2.0`), the same way `multi-lang-qa` deploys its Apps Script backend on tags. It can also be run manually from the Actions tab (`workflow_dispatch`).

Each run: pushes the built code, creates an immutable Apps Script version named after the tag (`clasp --json version "$TAG"`), then points the existing deployment at that exact version (`clasp deploy --deploymentId ... --versionNumber ...`) — so the live URL never changes, only which version it serves.

The workflow reconstructs `.clasp.json` and `~/.clasprc.json` on the runner from the `APPS_SCRIPT_ID` and `CLASPRC_JSON` secrets before every run — neither file needs to (or should) exist in the repo or on your machine.

## Inviting people

Access is gated by the `Profiles` sheet tab itself — there is no separate allowlist. An admin invites someone from the Admin section (creates a row with status `invited`); that person's first successful visit with the matching Google account flips them to `active`. Disabling a user immediately blocks every backend call for them.

## What's simplified vs. a "real" backend

This rewrite deliberately trades a few things for staying free and simple, appropriate at the usage level it's built for (effectively one concurrent user):

- **Locking:** one coarse `LockService` mutex per mutation instead of Postgres row-level locking. Every create/action function wraps its _entire_ read-modify-write sequence in one lock (see `SheetTable.ts`'s `withLock`) — this specifically avoids the race multi-lang-qa's reference pattern has, where only the final write was locked.
- **Idempotency:** a `CacheService`-backed dedupe check (`Dedupe.ts`) instead of a formal ledger table — good enough to survive double-taps and network retries, not a durable audit trail.
- **Notifications:** email (`MailApp`) + in-app only. No push notifications — if `MailApp.sendEmail` throws, the failure is logged to the `FailedNotifications` tab and execution continues rather than retrying.
- **Attachments:** private Google Drive folder instead of signed URLs. Every download re-runs the same access check that produced the upload permission, which is the closest equivalent without Storage-style signed links.
- **Audit trail:** a plain append-only `ActivityLog` tab instead of an RLS-guarded, immutable audit table.

## Known gaps in this build

- Attachment upload isn't wired into the Inventory/Tickets UI yet (the backend functions and Drive folder structure exist; the file-picker widget in the frontend doesn't).
- The UI is functional but not visually polished — action confirmations use `window.prompt`/`window.confirm` rather than proper modals.
