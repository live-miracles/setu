# Setu Security Review for Internal Rollout

Prepared for Security Review | 2 October 2026

Setu is a small internal operations application used across teams for inventory requests, program scheduling, approvals, comments, and reference data. This document summarizes the current security controls and the intentional design choices relevant to rollout approval.

**Review conclusion.** No known Critical or High severity issue remains in the reviewed authentication, authorization, image upload, comment, inventory, or scheduling paths. The application is suitable for a limited internal rollout.

> Automated scanners and reviewers without background on the app may flag items that are deliberate. Section 4 lists those items and explains why each is not a security risk in this context. If you change one of those areas, update this document in the same change.

## 1 Application Overview

| Area            | Implementation                                                |
| --------------- | ------------------------------------------------------------- |
| Frontend        | React application hosted on Vercel                            |
| Authentication  | Google OAuth through Supabase Auth                            |
| Application API | Authenticated Supabase Edge Functions                         |
| Database        | Supabase PostgreSQL with Row Level Security                   |
| File storage    | Supabase Storage with server-authorized uploads               |
| Deployment      | GitHub Actions to the single Supabase project                 |
| Expected scale  | Up to 500 internal users and approximately 5 concurrent users |

## 2 Authentication and Authorization

All business operations require a valid Supabase access token. The backend validates the token with Supabase Auth before processing the requested operation and checks whether the authenticated email domain is currently permitted.

Authorization is enforced on the backend and in PostgreSQL. Frontend visibility is not used as a security boundary.

| Role     | Authorized access                                                            |
| -------- | ---------------------------------------------------------------------------- |
| Admin    | User roles, domain allowlist, configuration, approvals, and operational data |
| Approver | Request review and approval without admin configuration access               |
| Viewer   | Read-only access to every request, its comments and the roster               |
| User     | Requests owned by or explicitly shared with the user; no roster              |

## 3 Controls in Place

### Identity and data access

- Users cannot change their own role or email through the application or direct Data API access.
- Only Admins can manage the allowed email-domain list and user roles.
- Request data is restricted by ownership, participation, and operational role.
- Comments are limited to request owners, participants, Admins, and Approvers, and authorship must match the authenticated user.
- A repeated create of a request or comment carries the client's id as the row id. A replay returns the caller's own row; a request or comment id already used by someone else is refused, so one user cannot read or take over another user's row through a replay.

### Image upload controls

- Each signed upload is tied to an existing inventory request or inventory type.
- Request images require Admin or Approver access, or ownership or participation while the request is in draft.
- Inventory type images require Admin access.
- Storage enforces a 50 KB limit and permits only AVIF, JPEG, PNG, and WebP.
- Users cannot replace or delete images belonging to another user.

### Workflow integrity

- Request transitions execute through service-role-only PostgreSQL functions.
- Request, inventory, and scheduling rows are locked before state and availability checks.
- Concurrent issuance cannot commit more inventory than is available.
- Concurrent approvals cannot commit conflicting use of the same place, and neither can concurrent edits: saving a program request re-checks place availability under the same place lock.
- Creating or editing a request writes the request and its items, sessions and participants in one transaction (`save_inventory_request_tx`, `save_program_request_tx`), so a failure leaves no half-saved request. An edit is refused if the request changed status after the caller's permission was checked. An edit never carries a status: any `status` sent by a client is ignored, because the status only changes through workflow actions.
- The request list functions (`list_*_requests_page`) are `SECURITY DEFINER` so they can match on a requester's name; each row is still limited to requests the caller may view (`can_view_*_request`).
- Status changes and their activity rows commit in one transaction and roll back together on failure.
- Activity rows come in three kinds (`comment`, `status`, `edit`). Row Level Security lets the Data API insert plain comments only (`kind = 'comment'`, no structured data), so a user cannot forge a status or edit entry; only the service-only SQL functions write those. Edit entries store just the changed fields, capped in size, and are recorded only after a request leaves draft.

## 4 Intentional Design Decisions

The following choices are part of the approved operating model for the initial internal rollout. They are documented here because automated review tools may identify them without the application context.

### Public delivery of operational images

The bucket contains only non-sensitive inventory and operational images. Upload, replacement, association, and deletion remain authenticated and authorized. Storage enforces file type and size. Personal, confidential, or regulated images are outside the intended use. If that use changes, the bucket will move to private delivery.

### Shared approved-program calendar

Organization-wide visibility of approved programs is required for cross-team scheduling. Access still requires authentication. Draft and rejected requests are not included, comments are not returned in the calendar, and detailed request actions remain subject to request-level authorization.

### Domain allowlist and existing sessions

Allowlist changes take effect at the application API boundary. Existing Supabase sessions are not globally revoked solely by a domain configuration change. Row Level Security continues to limit data access, and an Admin can delete an individual authentication identity when immediate revocation is required.

### Empty domain allowlist

When no domain is listed, the allowlist places no restriction of its own. That state does not open the app to the public: sign-in uses a Google OAuth client whose consent screen is set to Internal, so Google itself accepts only accounts of the organisation's Google Workspace. The allowlist is a second, application-level restriction on top of that, and an Admin can use it to narrow access to specific domains. The empty state exists so a new installation can be set up without locking the first Admin out.

### Members added before they have an organisation email

Most users self-register on their first Google sign-in. An Admin can also add a member who has no organisation email yet (Users page, "Add member") so they can be rostered, because rosters and requests point at profiles, which point at authentication identities. The identity is created already banned in Supabase Auth (`ban_duration`) and its profile is flagged `sign_in_blocked`, so the member cannot sign in with any Google account, whatever the domain allowlist says (including when the allowlist is empty and access is open). It exists only to be referenced.

An Admin can later set the member's work email, which is the only case where an email is changed through the app: it is refused for anyone who is not `sign_in_blocked`, and Admins cannot change the email of a member who has signed in. When the new address passes the domain allowlist, the ban is lifted and the flag cleared, so the member's first Google sign-in links to the same identity and keeps their roster shifts, requests and role. If it does not pass the allowlist, the member stays banned. Users cannot set `sign_in_blocked` themselves: the profile protection trigger rejects direct changes to it, like role and email. Deleting a member without history (shifts, requests, comments) removes the identity, as for any user.

### Viewer role reads every request

The Viewer role exists for oversight: it can read every program and inventory request, with its comments and participant email addresses, so that people outside the approval chain can follow the work. It cannot create, edit, transition, delete, comment on or upload for any request. The restriction is enforced in the API and in Row Level Security, including direct Data API writes, and Admins decide who holds the role.

### Database error text in API responses

When a database or constraint error occurs, the API returns its message to the signed-in caller in the 400 response (and logs it on the server). The messages carry no secrets, keys or personal data from other users; they name constraints or tables and tell the user what to correct, such as a duplicate name or an item that is still in use. Callers are authenticated, allowed-domain users, and unauthenticated callers receive only a generic 401.

### Inventory catalogue readable by every signed-in user

The Inventory pages (item types and labels) are shown to Admins, Approvers and Viewers only. The catalogue itself (names, brands, models, locations and stock levels of item types) stays readable by every signed-in user through the API and Row Level Security, because anyone requesting items must be able to choose from it. Hiding the pages is a presentation choice; the data is operational reference data, not personal or confidential. Creating, changing and deleting item types and labels remains Admin-only.

### Hidden views are presentation only

An Admin can hide the Program requests, Inventory requests, Calendar, Roster, Inventory types, Inventory labels and Blocks views from the menu and home screen (Other settings, stored in `home_content.hidden_views`). This is a display preference, not access control: the API never reads it, a hidden view's pages still open from a link, and access stays governed by authentication, Row Level Security and the request policy. Only Admins can change it, and the other pages for Admins and Approvers (Users, Departments, Other settings) cannot be hidden, so the setting cannot lock an Admin out of Other settings.

## 5 Secrets and Deployment Controls

- The browser receives only the Supabase publishable key, which does not bypass authentication or Row Level Security.
- Service-role credentials, database passwords, OAuth secrets, and deployment credentials are stored in provider or CI/CD secret storage.
- Development and production share one Supabase project (the free plan allows two, and this is a small internal app), so local development reads and writes live data. The API's CORS policy accepts `SETU_APP_ORIGIN` plus the optional `SETU_EXTRA_ORIGINS` (for example `http://localhost:47193`); CORS is not an authorization boundary, so every request still needs a valid token and passes the same checks. Migrations are tested against an isolated PostgreSQL (PGlite) in `npm test` before merging, and a weekly encrypted backup is described in `docs/database-backups.md`.
- Each production change has a recorded Git commit, CI run, migration run, and deployment result.
- The Progressive Web App caches only same-origin static assets; API responses and operational images remain network-first.
- Production is served through HTTPS with HSTS enabled.
- Every response carries a Content-Security-Policy that allows scripts only from the app's own origin (plus one hashed inline theme script), blocks plugins and framing, and limits network and image connections to the app and Supabase. `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` are also set.
- Google sign-in uses the PKCE flow, so the redirect back to the app carries a one-time code that only the originating browser can exchange, not an access token.

## 6 Verification Completed

The reviewed release passed the following checks before production rollout:

| Verification area                                         | Result |
| --------------------------------------------------------- | ------ |
| Automated authorization and behavior tests                | Passed |
| Frontend and backend type checking                        | Passed |
| Formatting and production builds                          | Passed |
| Database migration execution in isolated PostgreSQL       | Passed |
| Unauthorized upload and image ownership tests             | Passed |
| Direct browser-role transaction-function denial           | Passed |
| Inventory capacity, schedule conflict, and rollback tests | Passed |
| Post-merge GitHub CI                                      | Passed |
| Supabase deployment                                       | Passed |
| Vercel production deployment and HTTPS availability       | Passed |

## 7 Rollout Recommendation

Setu is ready for a limited internal rollout. The initial user group should follow the documented use of the application, particularly the requirement that uploaded images contain no confidential, personal, or regulated information.

A new security review should be requested if the application begins storing sensitive information, is opened to external users, materially expands its authorization model, or introduces new third-party integrations.
