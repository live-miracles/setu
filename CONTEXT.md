# Setu domain glossary

Terms used in the code and in architecture discussions. Keep this short; add a term when a concept gets a name.

## Requests

- **Request**: an inventory request (equipment on loan) or a program request (sessions at a place). Both kinds follow the same lifecycle skeleton and are served by `supabase/functions/api/requests.ts`.
- **Party**: the requester or a participant of a request. Parties get the requester-side rights (submit, edit a draft, revise a rejected request, manage participants and comments).
- **Approver**: a user with the `admin` or `approver` role. Approvers decide requests (approve, reject, cancel, issue, close, unapprove, reopen), may edit any request, and may create and submit inventory and program requests on behalf of another user.
- **Viewer**: the read-only role. It may read every request and may never write.
- **Request policy**: `supabase/functions/_shared/request-policy.ts`, the one module that decides which transitions exist, who may perform them, and who may edit or delete a request in which status. The React app and the edge function both use it. The SQL functions `perform_inventory_request_action_tx` and `perform_program_request_action_tx` remain the atomic executor; `build-tools/request-policy-db-check.mjs` checks they agree with the policy.
- **Workflow action**: a status transition (`submit`, `approve`, `reject`, `issue`, `close`, `cancel`, `revise`, `unapprove`, `reopen`). Status never changes any other way.

## Scheduling

- **Program place**: a room where program sessions are held (table `places`). Programs and blocks point at it.
- **Inventory place**: where equipment is kept (table `inventory_places`), a separate list from program places. Inventory types and labels point at it as their `Location`; a label with no place sits where its type sits. Both place lists are edited on the Other settings page.
- **Place availability**: two approved programs may not use the same place within an hour of each other. Owned by `supabase/functions/api/scheduling.ts`; SQL approval enforces the same rule under a lock.

## Dashboard

- **Dashboard sample**: the bounded, recent slice of requests the home screen loads (at most 250 of each kind, inventory only while ongoing). It is not history: screens that need a department's, user's, inventory type's or label's requests ask the request list endpoints instead (`useRelatedRequests`).
