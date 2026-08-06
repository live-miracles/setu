# UI/UX refactor test evidence

All images in this folder are screenshots of the locally running application with the deterministic mock backend. They are review evidence, not design mock-ups. The desktop reference viewport is `1440×900`; the mobile reference viewport is `390×844`.

Offline behavior is intentionally absent from this matrix. Setu and the AppSheet workflow it replaces do not require offline use.

## Baseline

| File                                                                    | Role          | Viewport | Scenario        | Baseline observation                                                            |
| ----------------------------------------------------------------------- | ------------- | -------- | --------------- | ------------------------------------------------------------------------------- |
| [01-admin-home-desktop.png](baseline/01-admin-home-desktop.png)         | Administrator | 1440×900 | Home            | Decorative hero pushes the operational queue below the first viewport.          |
| [02-program-create-desktop.png](baseline/02-program-create-desktop.png) | Administrator | 1440×900 | Program request | Session fields have weak hierarchy and limited conflict context.                |
| [03-ticket-detail-desktop.png](baseline/03-ticket-detail-desktop.png)   | Administrator | 1440×900 | Ticket detail   | Reporter, priority, place, timestamps, and activity are absent.                 |
| [04-roster-mobile.png](baseline/04-roster-mobile.png)                   | Administrator | 390×844  | Roster          | The desktop calendar is compressed into the phone viewport and labels overflow. |

## Final evidence captured

| File                                                                                 | Role          | Viewport | Expected result                                                                     | Automated coverage                                                |
| ------------------------------------------------------------------------------------ | ------------- | -------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [01-admin-home-desktop.png](final/01-admin-home-desktop.png)                         | Administrator | 1440×900 | Role-aware action queue is visible immediately.                                     | `admin Home exposes a role-aware action queue and filtered links` |
| [02-user-home-desktop.png](final/02-user-home-desktop.png)                           | User          | 1440×900 | Non-actionable queues are omitted and the personal workspace remains clear.         | Four-role navigation matrix                                       |
| [03-mobile-navigation.png](final/03-mobile-navigation.png)                           | Administrator | 390×844  | Drawer navigation is usable without brand or label truncation.                      | Four-role navigation matrix; mobile axe scan                      |
| [04-inventory-board-mobile.png](final/04-inventory-board-mobile.png)                 | Administrator | 390×844  | Inventory board remains readable and touch targets meet the mobile baseline.        | Inventory return and mobile navigation tests                      |
| [05-inventory-return-dialog-mobile.png](final/05-inventory-return-dialog-mobile.png) | Administrator | 390×844  | One structured dialog records every returned item and blocks duplicate interaction. | Inventory return flow                                             |
| [06-program-conflict-desktop.png](final/06-program-conflict-desktop.png)             | Administrator | 1440×900 | Approved place conflict appears before submission.                                  | `program form reports approved place conflicts before submission` |
| [07-ticket-activity-desktop.png](final/07-ticket-activity-desktop.png)               | Administrator | 1440×900 | Ticket metadata and activity log are visible together.                              | `ticket assignment and activity use structured controls`          |
| [08-roster-month-desktop.png](final/08-roster-month-desktop.png)                     | Administrator | 1440×900 | Month calendar remains the desktop default.                                         | Roster desktop axe scan                                           |
| [09-roster-agenda-mobile.png](final/09-roster-agenda-mobile.png)                     | Administrator | 390×844  | Phone layout uses an agenda with no horizontal overflow.                            | Mobile Roster overflow test and axe scan                          |
| [10-dialog-focus-restored-mobile.png](final/10-dialog-focus-restored-mobile.png)     | Administrator | 390×844  | Escape closes the dialog and returns focus to the invoking action.                  | Dialog focus-restoration test                                     |
| [11-settings-desktop.png](final/11-settings-desktop.png)                             | Administrator | 1440×900 | Home settings are separate from Roster presets and every control is labelled.       | Legacy URL regression; settings axe scan                          |
| [12-error-retry-state-mobile.png](final/12-error-retry-state-mobile.png)             | Administrator | 390×844  | Dashboard failure presents a focused, keyboard-operable retry path.                 | Dashboard failure and retry test                                  |

## Verification record

- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run format:check` — passed.
- `npm run test:unit` — 2 files, 9 tests passed.
- `npm run test:ui` — 37 passed, 7 intentionally skipped by viewport, 0 failed.
- Extended axe coverage — Home (desktop/mobile), Inventory, Program form, Ticket detail, Roster (desktop/mobile), and Home settings passed with no critical or serious WCAG A/AA findings.
- Structured dialog focus restoration, role navigation, draft save/edit/submit, rejection, return, program conflict, ticket activity, legacy settings URL, retry state, and mobile overflow were exercised in the browser.
- The final evidence run regenerated all 12 post-change screenshots from the completed code.

## Sheets migration gate

`backupAndMigrateSheets()` creates a whole-file backup before applying the append-only schema-v2 migration. Unit coverage verifies the legacy column prefixes and backup-before-migrate ordering. This checkout has no `.clasp.json`, so no live spreadsheet target was available for the required two-pass backup-copy rehearsal. Do not run the production migration until that rehearsal records before/after row counts and relationship checks.
