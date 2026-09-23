# Authenticated browser checklist

Run against the PR Preview with requester, unrelated-user, and approver accounts.

## Rejected request recovery

1. As an approver, reject a submitted program.
2. As the requester, open the rejected program.
3. Confirm `revise` is the only workflow action and direct editing is not yet available.
4. Select `revise` and confirm the request becomes Draft.
5. Edit a field or session, save, and submit.
6. Confirm the request becomes Submitted and both workflow events appear in Activity.
7. As an unrelated user, confirm no `revise` action is offered for that request.

## Status integrity

1. Open Edit program as an approver.
2. Confirm there is no Status control.
3. Change Place and save.
4. Confirm status is unchanged.
5. Exercise Approve/Reject and confirm only those actions change status.

## Calendar discoverability

1. Add a session to a Draft or Submitted program.
2. Confirm the detail page states that sessions appear on Calendar after approval.
3. Open Calendar and confirm the approved-only explanation is visible.
4. Approve the program after assigning a Place.
5. Confirm the program appears in the correct month, date, and Place column.

## Latest-activity ordering

1. Open Programs and record the first two requests.
2. Add a comment to the second request.
3. Return to Programs and confirm it is now first within the active date scope.
4. Repeat for Inventory.
5. Change Future/Past and status filters; confirm the newest matching request remains first.

## Responsive and failure checks

1. Repeat the detail and Calendar checks at desktop and narrow mobile widths.
2. Attempt Approve without a Place and confirm the existing actionable error remains visible.
3. Refresh immediately after each action and confirm no stale action remains available.
