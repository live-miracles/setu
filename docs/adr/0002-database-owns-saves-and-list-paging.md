# The database owns multi-row saves and list paging

Status: accepted

## Context

The backend began as a port of an Apps Script app whose "database" was a
spreadsheet: read every row, filter and sort in code, rewrite a whole row or
column on save, and use a cache entry as a lock. Those habits survived the move
to Supabase:

- creating or editing a request was a TypeScript sequence of statements (insert,
  delete the children, insert each child), so a failure part-way left a request
  half-saved, and the place-availability check ran outside the lock approval takes;
- every list page read every request and its children, built every DTO, then
  filtered, sorted and sliced 25 rows in memory, which does not meet the
  100,000-record target;
- `withLockedDedupe` claimed a row in an `idempotency_keys` table around nearly
  every write: two or three extra round trips per write, and not a lock.

## Decision

- A request is saved by one SQL function per kind (`save_inventory_request_tx`,
  `save_program_request_tx`) that writes the request and its children in a single
  transaction and enforces place availability under the place lock. The edge
  function still authorizes and validates, then passes validated values in as JSON
  with the status it authorized against.
- A request list page is produced by SQL (`list_*_requests_page`): filtering,
  searching, sorting, paging and status counts happen in the database, and the edge
  function loads only the requests on the page.
- Idempotency is the client's id for a create: it becomes the new row's primary
  key, so a replay finds the row. Other writes are repeatable or rejected by their
  own transition and uniqueness rules. The `idempotency_keys` table is
  dropped (20261124040000), one release after the edge function stopped writing to it.
- `supabase/functions/api/operations.ts` is the single table of operations the
  browser may call, with an argument schema per operation.

## Consequences

- Business rules that need to be atomic live in SQL next to the data. Tests for
  them are PGlite db-checks (`atomic-request-saves-db-check.mjs`,
  `request-list-pages-db-check.mjs`), not TypeScript fakes.
- The list functions are `SECURITY DEFINER` so they can match on a requester's
  name; they limit rows with `can_view_*_request`, the same rule the table
  policies use. Text sorting uses the database collation, so numbers inside names
  sort as text.
- A double-submitted edit or workflow action is no longer replayed silently: a
  repeated edit simply runs again and a repeated transition is refused by the
  state machine.
- Reference lists (departments, places, types) are still read whole: they are
  small and bounded, and the UI filters them locally.
