# Setu Security Review for Internal Rollout

Prepared for Security Review | 2 October 2026

Setu is a small internal operations application used across teams for inventory requests, program scheduling, approvals, comments, and reference data. This document summarizes the current security controls and the intentional design choices relevant to rollout approval.

**Review conclusion.** No known Critical or High severity issue remains in the reviewed authentication, authorization, image upload, comment, idempotency, inventory, or scheduling paths. The application is suitable for a limited internal rollout.

> Automated scanners and reviewers without background on the app may flag items that are deliberate. Section 4 lists those items and explains why each is not a security risk in this context. If you change one of those areas, update this document in the same change.

## 1 Application Overview

| Area            | Implementation                                                 |
| --------------- | -------------------------------------------------------------- |
| Frontend        | React application hosted on Vercel                             |
| Authentication  | Google OAuth through Supabase Auth                             |
| Application API | Authenticated Supabase Edge Functions                          |
| Database        | Supabase PostgreSQL with Row Level Security                    |
| File storage    | Supabase Storage with server-authorized uploads                |
| Deployment      | GitHub Actions to separate development and production projects |
| Expected scale  | Up to 500 internal users and approximately 5 concurrent users  |

## 2 Authentication and Authorization

All business operations require a valid Supabase access token. The backend validates the token with Supabase Auth before processing the requested operation and checks whether the authenticated email domain is currently permitted.

Authorization is enforced on the backend and in PostgreSQL. Frontend visibility is not used as a security boundary.

| Role     | Authorized access                                                            |
| -------- | ---------------------------------------------------------------------------- |
| Admin    | User roles, domain allowlist, configuration, approvals, and operational data |
| Approver | Request review and approval without admin configuration access               |
| Viewer   | Read-only access to permitted operational data                               |
| User     | Requests owned by or explicitly shared with the user                         |

## 3 Controls in Place

### Identity and data access

- Users cannot change their own role or email through the application or direct Data API access.
- Only Admins can manage the allowed email-domain list and user roles.
- Request data is restricted by ownership, participation, and operational role.
- Comments are limited to request owners, participants, Admins, and Approvers, and authorship must match the authenticated user.
- Idempotency records are scoped to the authenticated user so one user cannot receive another user's cached result.

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
- Concurrent approvals cannot commit conflicting use of the same place.
- Status changes and activity comments commit in one transaction and roll back together on failure.

## 4 Intentional Design Decisions

The following choices are part of the approved operating model for the initial internal rollout. They are documented here because automated review tools may identify them without the application context.

### Public delivery of operational images

The bucket contains only non-sensitive inventory and operational images. Upload, replacement, association, and deletion remain authenticated and authorized. Storage enforces file type and size. Personal, confidential, or regulated images are outside the intended use. If that use changes, the bucket will move to private delivery.

### Shared approved-program calendar

Organization-wide visibility of approved programs is required for cross-team scheduling. Access still requires authentication. Draft and rejected requests are not included, comments are not returned in the calendar, and detailed request actions remain subject to request-level authorization.

### Domain allowlist and existing sessions

Allowlist changes take effect at the application API boundary. Existing Supabase sessions are not globally revoked solely by a domain configuration change. Row Level Security continues to limit data access, and an Admin can delete an individual authentication identity when immediate revocation is required.

## 5 Secrets and Deployment Controls

- The browser receives only the Supabase publishable key, which does not bypass authentication or Row Level Security.
- Service-role credentials, database passwords, OAuth secrets, and deployment credentials are stored in provider or CI/CD secret storage.
- Development and production use separate Supabase projects.
- Each production change has a recorded Git commit, CI run, migration run, and deployment result.
- The Progressive Web App caches only same-origin static assets; API responses and operational images remain network-first.
- Production is served through HTTPS with HSTS enabled.

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
| Development and production Supabase deployment            | Passed |
| Vercel production deployment and HTTPS availability       | Passed |

## 7 Rollout Recommendation

Setu is ready for a limited internal rollout. The initial user group should follow the documented use of the application, particularly the requirement that uploaded images contain no confidential, personal, or regulated information.

A new security review should be requested if the application begins storing sensitive information, is opened to external users, materially expands its authorization model, or introduces new third-party integrations.
