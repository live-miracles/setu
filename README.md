<p align="center">
  <img src="design/logo/setu-logo.svg" alt="Setu logo" width="96" height="96" />
</p>

<h1 align="center">Setu</h1>

<p align="center">
  <strong>Studio program scheduling, equipment inventory, approvals and staff rosters<br />in one installable web app that runs entirely on free tiers.</strong>
</p>

<p align="center">
  <a href="https://github.com/live-miracles/setu/actions/workflows/ci.yml"><img src="https://github.com/live-miracles/setu/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/live-miracles/setu/commits/master"><img src="https://img.shields.io/github/last-commit/live-miracles/setu?logo=github" alt="Last commit" /></a>
  <a href="https://github.com/live-miracles/setu/stargazers"><img src="https://img.shields.io/github/stars/live-miracles/setu?style=flat&logo=github" alt="GitHub stars" /></a>
  <img src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22 or newer" />
  <br />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20Edge%20Functions-3FCF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Vercel-static%20frontend-000000?logo=vercel&logoColor=white" alt="Vercel" />
  <br />
  <img src="https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white" alt="Installable PWA" />
  <img src="https://img.shields.io/badge/hosting-free%20tiers-brightgreen" alt="Runs on free tiers" />
  <img src="https://img.shields.io/badge/code%20style-prettier-ff69b4?logo=prettier&logoColor=white" alt="Prettier" />
</p>

Setu (Sanskrit for “bridge”) connects the people who run a studio: the teams that
request equipment and sessions, the approvers who decide on them, and the crew who
turn up. It is a small internal app, built for up to 500 users and 100,000 records,
that works in Chrome on desktop and mobile and installs to the home screen as a PWA.

It is also a compact, working reference for a **React + Supabase + Vercel** app with
Google sign-in, role-based access, Postgres Row Level Security, Edge Functions, and
an in-repo UI kit instead of a component library.

## Features

- **Program requests and calendar.** Request sessions at a place, see a month
  calendar of approved programs, and rely on the app to block clashes (two approved
  programs can't use the same place within an hour of each other).
- **Equipment inventory.** Track types, brands, places, and individually labelled
  items. Print QR labels as a PDF, scan them with the phone camera, and attach
  photos that are compressed in the browser before upload.
- **Approval workflow.** Inventory and program requests share one lifecycle:
  submit, approve, reject, issue, close, cancel, revise, and reopen, enforced by a
  single policy module used by both the app and the API.
- **Comments and email.** Comments on every request, with email
  notifications to participants sent through the Gmail API.
- **Roster scheduling.** Shift types and per-person rosters for the crew.
- **Roles and access control.** `admin`, `approver`, `viewer`, and `user` roles, an
  email-domain allowlist, and Row Level Security in Postgres.
- **Built for phones.** Installable PWA, a bottom dock on mobile, and a
  list-and-detail layout on wide screens.
- **Costs nothing to run.** Fits within the free plans of Supabase and Vercel;
  a scheduled workflow keeps the free project from pausing.

## How it works

```text
Browser → Vercel static app → Supabase Auth
                           ├→ Edge Function: api
                           ├→ Postgres
                           └→ Storage
```

| Layer    | Technology                                                           |
| -------- | -------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Tailwind CSS 4, TanStack Query, React Router   |
| API      | Supabase Edge Function (`supabase/functions/api/`)                   |
| Database | Supabase Postgres with RLS and `pg_cron`                             |
| Auth     | Google OAuth through Supabase Auth                                   |
| Hosting  | Vercel serves the static build; GitHub Actions deploy Supabase       |
| Tests    | `node --test`, migrations run against an in-memory Postgres (PGlite) |

## Quick start

You need Node.js 22+, a Supabase project, and a Google OAuth client.

```bash
git clone https://github.com/live-miracles/setu.git
cd setu
npm install
cp .env.example .env.local   # add your Supabase URL and publishable key
npm run dev                  # http://localhost:47193
```

[Getting started](docs/getting-started.md) walks through the Supabase and Google
OAuth setup, applying the schema, and making yourself an admin.

> Local development and production share one Supabase project, so local work reads
> and writes live data. Use a test account and avoid bulk or destructive changes.

## Documentation

| Guide                                        | What's in it                                                          |
| -------------------------------------------- | --------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md)   | Developer setup, roles, commands, project layout                      |
| [Deployment](docs/deployment.md)             | Free-tier limits, Vercel, automatic deploys, comment email, allowlist |
| [Database backups](docs/database-backups.md) | Encrypted weekly backups on the free plan, and restore steps          |
| [Troubleshooting](docs/troubleshooting.md)   | Fixes for the setup errors people hit most                            |
| [Security review](docs/security-review.md)   | Security controls and intentional design decisions                    |
| [Architecture decisions](docs/adr/)          | Why the app uses its own UI kit instead of Ant Design                 |
| [Domain glossary](CONTEXT.md)                | Terms used in the code: request, party, approver, place, and so on    |

## Contributing and security

Run `npm test`, `npm run typecheck`, and `npm run format:check` before opening a pull
request; the same checks run in CI. Repository conventions are in
[AGENTS.md](AGENTS.md). To report a vulnerability, follow [SECURITY.md](SECURITY.md)
and contact the repository owner privately instead of opening a public issue.
