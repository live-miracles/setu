# Repository Instructions

## Project scope and constraints

- This repository contains a small internal web app that must work in Chrome on desktop and mobile devices.
- Support an installable mobile experience, such as a Progressive Web App (PWA), where appropriate.
- Chrome is the only required browser target; do not add cross-browser compatibility work unless explicitly requested.
- Use only free tiers for third-party services and infrastructure, including services such as Vercel and Supabase. Design and implement with their free-tier limits, quotas, storage, execution time, and usage constraints in mind.
- Keep the implementation simple and appropriate for a small internal app. Reuse standard blocks, forms, tables, and components provided by the selected UI libraries instead of introducing custom CSS or bespoke styling rules unless there is a clear, documented need.
- Design for up to 500 total users, up to 5 concurrent users, and up to 100,000 records in major tabular data sets such as sessions, comments, and requests.

## Engineering principles

- Keep changes focused and reviewable. Avoid unrelated refactors, speculative abstractions, and unnecessary dependencies.
- Before implementing non-trivial work, inspect the relevant code, documentation, and current repository state; state important assumptions when they affect the design.
- For libraries, frameworks, APIs, or third-party services, consult current official documentation before relying on API syntax or service behavior.
- Prefer simple, maintainable architecture that fits a small internal app. Introduce additional layers, infrastructure, or abstractions only when they solve a demonstrated need.
- Before making UI changes, inspect similar screens, flows, and components already used in the app and follow their established patterns so the UI remains uniform.
- When a UI or logic pattern is meaningfully repeated, consider extracting it into a reusable component or shared helper; avoid abstractions for one-off or merely similar code.

## Effort and verification

- Match implementation and verification effort to the change's risk and scope.
- For small, isolated changes, run focused checks and tests for the affected area.
- For changes to app logic, add or update tests when the behavior is meaningful, likely to regress, or easy to verify deterministically. Full test-driven development is optional; useful coverage is required.
- For changes involving authentication, persistence, integrations, deployment, shared state, or mobile/installable behavior, broaden verification to the relevant integration, end-to-end, or full test checks when available.
- For substantial or high-risk changes, consider an independent review and document any remaining limitations or blockers.

## Privacy and identifiers

- Do not commit personal information or private project identifiers to the codebase, including real names, email addresses, phone numbers, usernames, customer information, account IDs, project IDs, organization IDs, or similar identifiers.
- Use clearly fictional placeholders or environment variables instead, and check changed files for accidental personal data or project-specific identifiers before committing.
- Treat credentials such as `SUPABASE_ACCESS_TOKEN` as secrets: provide them through environment variables, CI/CD secret storage, or the relevant provider's secret manager. Never commit, print, copy, or include their values in source files, documentation, logs, or issue reports.

## Validation before commits

- Always run the repository's formatting and format-check commands before committing, and fix any reported issues.
- For substantial changes, also run the complete test suite before committing.
