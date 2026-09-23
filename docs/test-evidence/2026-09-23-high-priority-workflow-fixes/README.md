# High-priority workflow fixes — test evidence

Date: 2026-09-23

Branch: `codex/high-priority-workflow-fixes`

## Scope

This change addresses the four highest-risk findings from the September UI feedback:

1. Rejected program requests had no path back to submission.
2. Program status could be edited directly, bypassing workflow actions.
3. Calendar visibility rules were not explained after sessions were added.
4. Request lists were ordered by schedule date rather than latest activity.

## Adversarial review matrix

| Scenario | Expected result | Evidence |
| --- | --- | --- |
| Request owner opens a rejected program | `revise` is available | `runProgramActionAssertions` covers owner/rejected state |
| Participant opens a rejected program | `revise` is available because participants are treated as owners throughout the program workflow | Frontend and API use the same owner predicate |
| Unrelated user opens another user's rejected program | No workflow action is exposed | `runProgramActionAssertions` covers non-owner/rejected state |
| Unrelated user calls the API with `revise` | API returns `Invalid transition.` | API checks requester/participant/approver before changing status |
| Approver reopens a rejected program | Request becomes `draft` | Frontend assertion plus API transition guard |
| User edits a program and injects a different `status` value | Status is unchanged | Status field and payload were removed; generic API update no longer writes `status` |
| User revises, edits, then submits again | `rejected -> draft -> submitted` | Client and API state machines support the full sequence |
| User adds a session to a non-approved program | Detail page explains that it appears after approval | Source assertion in `action-buttons.test.mjs` |
| Calendar contains no approved programs with sessions | Empty state explains the exact visibility rule | Calendar copy in `frontend/src/sections/calendar.tsx` |
| Program/Inventory list loads without an explicit sort | API orders by latest comment timestamp descending | Frontend date sorter removed; existing API fallback uses `latestActivityAt` |
| Request has no comments | Ordering remains deterministic | Existing `latestActivityAt` fallback uses padded display ID |
| Program list is filtered to Future/Past | Date scope is applied, then matching rows are activity-sorted | Existing API filter order retained |

## Automated verification

Run from the repository root:

```text
npm test
  PASS — 3/3 Node test files

npm run typecheck
  PASS — TypeScript emitted no errors

SETU_SUPABASE_URL=https://example.supabase.co \
SETU_SUPABASE_PUBLISHABLE_KEY=test-publishable-key \
npm run build:vercel
  PASS — frontend bundle and Tailwind CSS generated in ignored web/

npx esbuild supabase/functions/api/programs.ts --bundle --platform=neutral \
  --external:npm:* --outfile=/tmp/setu-programs-api-check.js
  PASS — modified Edge Function module and local imports parsed and bundled

git diff --check
  PASS — no whitespace errors
```

Targeted regression assertions added in this change verify:

- rejected owner, rejected non-owner, and rejected approver action visibility;
- absence of a directly editable Status field;
- absence of workflow status writes in the generic update endpoint;
- the rejected-only `revise -> draft` backend guard;
- absence of the schedule-date sorter in request lists;
- presence of the Calendar visibility explanation.

## Browser verification status

The local dev server cannot exercise authenticated workflows in this checkout because the
current `.env.local` has empty Supabase URL and anon-key values under the legacy variable names.
No credentials were created, copied, or committed.

Browser verification must therefore use the authenticated PR Preview or a configured local
Supabase development project. The required walkthrough is recorded in `browser-checklist.md`.
