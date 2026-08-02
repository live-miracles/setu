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
   +--> Google Drive (native DriveApp — request photos, "anyone with the link" view access)
   +--> MailApp (notification emails)

Time-driven trigger --> daily overdue-request scan
```

Everything — backend and frontend — is TypeScript. The backend compiles via `clasp push` directly to the Apps Script runtime (V8); the frontend is bundled by esbuild (no framework) into a single inlined `<script>` block served by `HtmlService`. Both share one ambient-global type contract at `shared/types.d.ts`.

## Frontend layout

Apps Script serves one HTML document and has no module loader, so whatever the frontend is written as has to arrive as a single inlined script. esbuild is what makes that a build concern rather than an authoring one: the sources are ordinary ES modules, and the import graph decides the order.

```
frontend/
  shell.html            page chrome — the one copy, templated for both targets
  input.css             Tailwind + daisyUI entry
  src/
    main.ts             production entry point
    dev.ts              dev entry point: mock backend + main
    router.ts           routing core — navigation, role gating, nav chrome
    api.ts              the only module that talks to the backend
    state.ts            the client-side store
    workflows.ts        client-side mirror of the server state machines
    ids.ts              client-generated request ids
    config.ts
    ui/format.ts        value -> display string (escaping, dates)
    ui/components.ts    reusable HTML fragments
    ui/icons.ts         the hand-authored line-icon set
    ui/styles.ts        domain value -> daisyUI class names
    ui/feedback.ts      the saving badge and error toast
    sections/index.ts   the routing table
    sections/*.ts       one module per section (home, roster, inventory, …)
    mock/backend.ts     in-memory stand-in for google.script.run
```

Two properties of that graph are worth preserving:

**It is acyclic.** `router.ts` imports no section — `sections/index.ts` builds the routing table and `main.ts` passes it in via `initRouter()`. Sections import navigation helpers from the router, and nothing in the router reaches back. Typing the table as `Record<SectionKey, SectionRenderer>` still makes a missing section a compile error rather than a blank page.

**The mock cannot ship.** `mock/backend.ts` is reachable only from `dev.ts`, so no import path leads from the production entry point to it — that holds regardless of build flags, rather than depending on a file being left out of a list.

## Local development

```bash
npm install
npm run dev
```

This starts esbuild `--watch` + Tailwind `--watch` + `browser-sync` on `http://localhost:3000`, building `frontend/src/dev.ts` into `frontend/dist/` and serving it against an in-memory mock backend — no Google account, Sheet, or Apps Script project needed to develop the UI. `frontend/dist/` is a build artifact and never gets pushed to Apps Script.

```bash
npm run typecheck   # tsc --noEmit against both the backend and frontend programs
npm run build       # bundles everything into src/{Index,Stylesheet,JavaScript}.html
```

`tsc` only type-checks — esbuild does the emitting, so nothing compiles TypeScript twice.

## One-time Google-side setup

All pushing/deploying happens in CI (see below) — nothing here needs `clasp` installed locally or a local `.clasp.json`. You're just collecting IDs and setting them as GitHub secrets.

1. **Create the Google Sheet.** Any new spreadsheet works — the app creates its own tabs. Copy its ID from the URL (`https://docs.google.com/spreadsheets/d/<ID>/edit`).
2. **Create the Apps Script project** at [script.google.com](https://script.google.com) → New project. Rename it, then copy its Script ID from Project Settings (gear icon) → **IDs** → Script ID.
3. **Deploy as a web app** right away, before any real code is pushed — the placeholder boilerplate is fine, CI will overwrite it. In the Apps Script editor: Deploy → New deployment → Web app → Execute as **Me**, Who has access **Anyone within [your domain]** (only available if the script is owned by a Workspace account on that domain). Copy the deployment ID it gives you.
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
    - `ALLOWED_EMAIL_DOMAIN` — your organisation's Google Workspace email domain (e.g. `example.org`). Anyone signing in with a Google account on that domain self-registers on first visit with the least privileged role — see "Access" below.
    - `BOOTSTRAP_ADMIN_EMAIL` — the lowercase Google account email of the first administrator. That email must also be on `ALLOWED_EMAIL_DOMAIN`; it's granted the `admin` role on first sign-in instead of `user`.
    - `IMAGES_DRIVE_FOLDER_ID` — the ID of a Drive folder the deploying account already has edit access to, where request photos get uploaded.
7. **Push the first version tag** (e.g. `git tag v0.1.0 && git push origin v0.1.0`), or run the workflow manually from the Actions tab, to build and push the real code to the deployment from step 3.
8. **Run the one-time setup functions.** In the Apps Script editor, select and run (once each, in this order):
    - `setupSheets` — idempotently creates all the tabs (one per table plus `Counters`) with their headers.
    - `installTriggers` — installs the daily overdue-request-scan trigger.
9. **Find the live URL.** Apps Script editor → Deploy → Manage deployments, next to the deployment ID from step 3.

**First-time visitors will see Google's "unverified app" warning** the first time they authorize (this project won't go through Google's app verification process). For a small internal team this is an expected click-through, not a sign of something broken.

## Continuous deployment (GitHub Actions)

`.github/workflows/deploy.yml` runs `npm run typecheck` + `npm run build` + `clasp push` + `clasp version` + `clasp deploy` automatically whenever you push a tag matching `v*` (e.g. `git tag v1.2.0 && git push origin v1.2.0`), the same way `multi-lang-qa` deploys its Apps Script backend on tags. It can also be run manually from the Actions tab (`workflow_dispatch`).

Each run: pushes the built code, creates an immutable Apps Script version named after the tag (`clasp --json version "$TAG"`), then points the existing deployment at that exact version (`clasp deploy --deploymentId ... --versionNumber ...`) — so the live URL never changes, only which version it serves.

The workflow reconstructs `.clasp.json` and `~/.clasprc.json` on the runner from the `APPS_SCRIPT_ID` and `CLASPRC_JSON` secrets before every run — neither file needs to (or should) exist in the repo or on your machine.

## Access

There is no invite flow and no per-user disable switch. The `Users` sheet tab (keyed by email) is the allowlist: anyone signing in with a Google account on `ALLOWED_EMAIL_DOMAIN` self-registers as a `user` on their first visit (or `admin`, for `BOOTSTRAP_ADMIN_EMAIL`), with an empty `Phone` until they submit the registration form the frontend shows in place of the app on that first visit (name, department, phone, WhatsApp — see `updateOwnProfile` in `Admin.ts`). Revoking someone's organisation Google account revokes their access to this app — an admin can still change a person's role from Settings → Users, but there is no in-app way to block a still-valid account.

### Roles

Four roles, strictly nested — each row can do everything the row below it can:

| Role       | Sections              | Requests                   | Can also                                                                                          |
| ---------- | --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `admin`    | all                   | every request              | edit departments, places, inventory types, quick links and home content, and change anyone's role |
| `approver` | all                   | every request              | approve/reject/issue/return/cancel/close, assign and reopen tickets, schedule shifts, read People |
| `viewer`   | no Roster             | every request              | —                                                                                                 |
| `user`     | no Roster, no Tickets | own + participant requests | —                                                                                                 |

Inventory, Programs, Home and Profile are open to everyone. Roster is admin/approver-only — reading it, not just scheduling into it. Tickets are hidden from `user` outright (a `Ticket` row has no reporter column, so there is nothing to scope a personal ticket list by); `user` can't list, report, act on or be assigned one, and the assignee picker skips them.

There is no combined Admin page. The navbar's **Settings** dropdown holds one page per list — Users, Departments, Places, Inventory types, Home content. Quick links sit on the Home content page rather than a page of their own, since both feed the same screen. Users is visible to approvers as a read-only roster of who has access; the other four are admin-only, and the dropdown itself is hidden from viewers and users. The "notification emails failed" warning lives on Home, where only admins see it.

Everyone, `user` included, can raise equipment and program requests, and comment on any request they can see.

Roles are interpreted in exactly one place — the `canManageConfig`/`canApprove`/`canViewAllRequests`/`canUseTickets`/`canViewRequest` helpers in `Auth.ts`, which every endpoint calls; `frontend/src/workflows.ts` mirrors the first three client-side purely to decide which sections and buttons to draw, and `getDashboard` sends empty lists for the sections a role can't open. `roleOf` folds any unrecognised `Role` cell (including the pre-split `member` value, and anything typed by hand into the Sheet) down to `user`, so a bad value fails closed rather than granting access.

One consequence worth knowing: crew scheduled onto a shift who are on `viewer` or `user` get the assignment email but have no in-app roster to check. Anyone in the `Users` tab can still be a shift assignee — that is deliberate, since restricting it to admins and approvers would make scheduling useless.

Inventory and program requests can also list `Participants` — a comma-separated list of emails notified alongside the requester and given the same submit permission on that request. Participants don't need to be registered Setu users; an email with no account just receives the notification.

## What's simplified vs. a "real" backend

This rewrite deliberately trades a few things for staying free and simple, appropriate at the usage level it's built for (effectively one concurrent user):

- **Locking:** one coarse `LockService` mutex per mutation instead of Postgres row-level locking. Every create/action function wraps its _entire_ read-modify-write sequence in one lock (see `SheetTable.ts`'s `withLock`) — this specifically avoids the race multi-lang-qa's reference pattern has, where only the final write was locked.
- **Idempotency:** a `CacheService`-backed dedupe check (`Dedupe.ts`) instead of a formal ledger table — good enough to survive double-taps and network retries, not a durable audit trail.
- **Notifications:** email (`MailApp`) only. If `MailApp.sendEmail` throws, the failure is logged to the `FailedEmails` tab and execution continues rather than retrying.
- **Images:** native `DriveApp` uploads (see `Images.ts`) with "anyone with the link" view access, rather than signed URLs — the closest equivalent without Storage-style signed links.
- **Audit trail:** every status change on an inventory or program request is narrated as a plain comment authored by whoever performed it (see `Comments.ts`), rather than a separate immutable audit table.

## Known gaps in this build

- Participants and images can only be set when a request is created — there's no way to edit either afterward yet.
- The UI is functional but not visually polished — action confirmations use `window.prompt`/`window.confirm` rather than proper modals.
