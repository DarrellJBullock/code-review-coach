# PR Review Coach

An AI-powered pull request review tool that analyzes a GitHub PR's diff, scores its risk, and explains every finding the way a thoughtful senior engineer would — not a linter. Every finding includes five things: why it matters, what could break, how risky it is, what test would catch it, and what a safer implementation looks like. Nothing is ever posted back to GitHub without an explicit human approval step.

## How it works

1. Log in with GitHub.
2. Pick a repository and an open pull request.
3. Review the diff, optionally toggling Performance / Security / Accessibility focus modes.
4. Click **Run Review** — the PR is queued and Claude (Sonnet 5) generates a risk score plus a set of findings grouped by category.
5. Approve the findings worth surfacing, then explicitly confirm posting them as PR comments on GitHub.
6. Revisit any past review from the history dashboard, filterable by repo, risk level, and date.

## Tech stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: NestJS — an HTTP API process plus a separate BullMQ worker process
- **Database**: PostgreSQL via Prisma
- **Queue**: Redis via BullMQ
- **AI**: Anthropic API (Claude Sonnet 5), structured outputs validated against a shared Zod schema
- **Auth**: GitHub OAuth, session cookies, AES-256-GCM-encrypted access tokens at rest
- **Monorepo**: npm workspaces — `apps/web`, `apps/api`, `packages/shared`

A structural safety guarantee: the BullMQ worker process (which calls Claude and writes findings) never imports the GitHub module, so it is architecturally incapable of posting anything. Posting only happens through an explicit, human-confirmed HTTP request, and the server derives what gets posted entirely from its own database state — never from client-supplied data.

## Prerequisites

- Node.js 24+
- Docker (with Docker Compose)
- A GitHub account
- An Anthropic API key with available credits ([console.anthropic.com](https://console.anthropic.com))

## Setup

### 1. Install dependencies

```bash
npm install
```

This is an npm workspaces monorepo — one install at the root covers `apps/web`, `apps/api`, and `packages/shared`.

### 2. Start Postgres and Redis

```bash
docker compose up -d
```

Postgres is published on host port `5433` and Redis on `6380` (not the defaults) to avoid clashing with other local services. Change the port mappings in `docker-compose.yml` if you'd rather use the defaults — just update `DATABASE_URL`/`REDIS_URL` to match.

### 3. Configure environment variables

```bash
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local   # only NEXT_PUBLIC_* vars are read here, the rest are unused but harmless
```

Fill in `apps/api/.env`:

| Variable | How to get it |
|---|---|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Create a GitHub OAuth App at **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**. Homepage URL: `http://localhost:3000`. Authorization callback URL: `http://localhost:4000/auth/github/callback`. Scopes requested at login: `repo read:user`. |
| `ANTHROPIC_API_KEY` | From the [Anthropic Console](https://console.anthropic.com) under API Keys. Requires billing/credits configured on the account. |
| `SESSION_SECRET` | Any long random string, e.g. `openssl rand -hex 32`. |
| `TOKEN_ENCRYPTION_KEY` | A 32-byte hex string used to encrypt stored GitHub tokens: `openssl rand -hex 32`. |
| `DATABASE_URL` / `REDIS_URL` | Already correct for the default `docker-compose.yml` ports (5433/6380). |
| `GITHUB_WEBHOOK_SECRET` | Not currently used by any code path (no webhook feature is implemented) — safe to leave blank. |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WEB_URL` | Already correct for local dev (`:4000` / `:3000`). |

### 4. Run the database migration

```bash
cd apps/api && npx prisma migrate deploy && cd ../..
```

### 5. Start everything

Three processes, each in its own terminal (or backgrounded):

```bash
npm run dev:api     # NestJS HTTP API — http://localhost:4000
npm run dev:worker  # BullMQ worker — generates reviews, no HTTP listener
npm run dev:web     # Next.js frontend — http://localhost:3000
```

Visit `http://localhost:3000` and log in with GitHub.

## Testing

```bash
cd apps/api && npm test
```

Runs the Jest suite (prompt building, AI response schema validation and retry logic, ownership/authorization checks, GitHub posting logic, review history filtering, token encryption, session auth).

## Project structure

```
apps/
  web/     Next.js frontend
  api/     NestJS API (apps/api/src/main.ts) + BullMQ worker (apps/api/src/worker.main.ts)
packages/
  shared/  Types, enums, and Zod schemas shared between web and api
docker-compose.yml   Postgres + Redis for local dev
```

## Notes

- Nothing is ever posted to GitHub automatically. The posting endpoint only acts on findings already marked `approved` in the database, and requires an explicit confirmation click in the UI immediately before the request is sent.
- The worker process that calls the Anthropic API has no code path to the GitHub API — this is enforced by which NestJS modules it imports, not just by convention.
