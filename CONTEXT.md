# Setu domain glossary

Terms used in the code and in architecture discussions. Keep this short; add a term when a concept gets a name.

## Requests

- **Request**: an inventory request (equipment on loan) or a program request (sessions at a place). Both kinds follow the same lifecycle skeleton and are served by `supabase/functions/api/requests.ts`.
- **Party**: the requester, a participant, or the request's lead (the lead email), matched on the signed-in user's profile email; a participant listed by email before they had an account is matched the same way. Parties get the requester-side rights (submit, edit a draft, revise a rejected request, manage participants and comments).
- **Approver**: a user with the `admin` or `approver` role. Approvers decide requests (approve, reject, cancel, issue, close, unapprove, reopen), may edit any request, and may create and submit inventory and program requests on behalf of another user.
- **Viewer**: the read-only role. It may read every request and may never write.
- **Request policy**: `supabase/functions/_shared/request-policy.ts`, the one module that decides which transitions exist, who may perform them, and who may edit or delete a request in which status. The React app and the edge function both use it. The SQL functions `perform_inventory_request_action_tx` and `perform_program_request_action_tx` remain the atomic executor; `build-tools/request-policy-db-check.mjs` checks they agree with the policy.
- **Workflow action**: a status transition (`submit`, `approve`, `reject`, `issue`, `close`, `cancel`, `revise`, `unapprove`, `reopen`). Status never changes any other way.
- **Activity**: a request's feed (table `comments`), made of three kinds of rows. A `comment` is what people write. A `status` event is written by a workflow action and records the old and new status and the approver's note. An `edit` event is written by a request save once the request has left draft, and lists only the fields that changed (values capped, at most 30 entries). Only the SQL functions write status and edit rows; the Data API can insert plain comments only. Status events email the request's people, edit events never do, and the home screen's recent comments show `comment` rows only.
- **Request save**: creating or editing a request together with its items or sessions and its participants. One SQL function per kind (`save_inventory_request_tx`, `save_program_request_tx`) does it in a single transaction; the edge function authorizes and validates first and passes in the status it authorized against, and the save is refused if the request moved on. The client's id for a create becomes the request's id, so a replayed create returns the same request.
- **Request list page**: one page of a request list. The database filters, searches, sorts, pages and counts statuses (`list_inventory_requests_page`, `list_program_requests_page`), limited to requests the caller may view; the edge function then loads only that page's requests. Default order is newest activity first.
- **Operation**: one thing the browser may ask the edge function to do, declared once in `supabase/functions/api/operations.ts` with its positional arguments (the browser's typed `Api` in `shared/types.d.ts` is the other half; `build-tools/api-contract.test.mjs` keeps them in step). `handler.ts` authenticates, validates arguments and maps errors once.

## Scheduling

- **Program place**: a room where program sessions are held (table `places`). Programs and blocks point at it.
- **Inventory place**: where equipment is kept (table `inventory_places`), a separate list from program places. Inventory types and labels point at it as their `Location`; a label with no place sits where its type sits. Both place lists are edited on the Other settings page.
- **Inventory brand**: the maker of an inventory type, chosen from a managed list (table `inventory_brands`) edited on the Other settings page. The type stores the brand's name, so renaming a brand renames it on every type, and a brand in use cannot be deleted.
- **Place availability**: two approved programs may not use the same place within an hour of each other. SQL enforces it under a place lock, both when a request is approved and when a program request is saved; `supabase/functions/api/scheduling.ts` only answers it ahead of time for the place picker.

## Data

- **Reference data**: the current user, the home content (guidelines, hidden views and their order) and the small lists pickers and labels read (departments, places, blocks, inventory types, shift/program/session types, users). Read with the hooks in `frontend/src/ui/reference.ts`, each fetched once and cached under one react-query key; a save, a Refresh or a reload refetches it.
- **Dashboard**: the home screen's data and nothing else (`getDashboard`, `useDashboard` in `frontend/src/ui/dashboard.tsx`): pending program requests, ongoing inventory requests, recent comments and the upcoming roster (which the Roster page also reads). An ordinary react-query query; there is no second client cache.
- **Dashboard sample**: the bounded, recent slice of requests the dashboard lists (at most 250 of each kind: draft/submitted program requests, inventory requests while ongoing), as summary rows with the true total next to them, plus the newest 8 comments of each kind from any request. It is not history: screens that need a department's, user's, inventory type's or label's requests ask the request list endpoints instead (`useRelatedRequests`).
