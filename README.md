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

1. **Create the Google Sheet.** Any new spreadsheet works — the app creates its own tabs. Copy its ID from the URL (`https://docs.google.com/spreadsheets/d/<ID>/edit`).
2. **Create the Apps Script project.**
    ```bash
    npx clasp login          # one-time interactive OAuth, opens a browser
    npx clasp create --type webapp --title "Livestream Operations" --rootDir src
    ```
    Or, if you'd rather create the project by hand at [script.google.com](https://script.google.com), use `npx clasp clone <scriptId> --rootDir src` instead. Either way you end up with a `.clasp.json` pointing `rootDir` at `src` — this file is git-ignored since it's environment-specific.
3. **Set Script Properties** (Apps Script editor → Project Settings → Script Properties):
    - `SPREADSHEET_ID` — the Sheet ID from step 1.
    - `BOOTSTRAP_ADMIN_EMAIL` — the lowercase Google account email of the first administrator. The first person to open the app with that email becomes the first active admin; everyone else needs to be invited from the Admin section first.
4. **Push and run the one-time setup functions:**
    ```bash
    npm run push
    ```
    Then in the Apps Script editor, select and run (once each, in this order):
    - `setupSheets` — idempotently creates all 19 tabs with their headers.
    - `ensureAttachmentsFolder` — creates the private "Setu Attachments" Drive folder and stores its ID as a Script Property.
    - `installTriggers` — installs the daily overdue-request-scan trigger.
5. **Deploy as a web app.** In the Apps Script editor: Deploy → New deployment → Web app → Execute as **Me**, Who has access **Anyone with a Google account**. Copy the deployment ID it gives you.
6. **Wire up `npm run deploy`.** Set `CLASP_DEPLOYMENT_ID` to that deployment ID (as a shell env var locally, or a repo secret if you script deploys from CI) — every subsequent `npm run deploy` reuses it so the live URL never changes:
    ```bash
    export CLASP_DEPLOYMENT_ID=<your-deployment-id>
    npm run deploy
    ```

**First-time visitors will see Google's "unverified app" warning** the first time they authorize (this project won't go through Google's app verification process). For a small internal team this is an expected click-through, not a sign of something broken.

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
