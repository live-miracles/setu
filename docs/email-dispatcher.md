# Apps Script email dispatcher

The Apps Script worker in `src/EmailDispatcher.ts` sends queued comment and
overdue-equipment reminder emails through the Workspace account's `MailApp`
permission.

## Setup

After deploying the Apps Script project, run `installEmailDispatcherTrigger`
once from the Apps Script editor. Configure these Script Properties:

| Property | Required | Description |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role key used to claim and update the email outbox. Keep it only in Apps Script properties. |
| `APP_URL` | Recommended | Deployed Setu origin used for “View request” links. |
| `EMAIL_SENDER_NAME` | No | Display name for outgoing mail. Defaults to `Live Stream Setu`. |
| `CC_EMAIL` | No | Address copied on every email, in addition to the lead and request participants. Multiple addresses may be comma-separated. |

`CC_EMAIL` is merged with the request's existing CC recipients. Duplicate
addresses and the primary `To` recipient are removed automatically. If
`CC_EMAIL` is empty or absent, the existing lead and participant CC behavior is
unchanged.

## Deployment

The deployment workflow builds the Apps Script source and pushes it with
`clasp`. It requires the repository secrets `CLASPRC_JSON`, `APPS_SCRIPT_ID`,
and `APPS_SCRIPT_DEPLOYMENT_ID`.
