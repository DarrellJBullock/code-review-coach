# PR Review Coach

AI-powered GitHub PR review tool.

## Local Development

### Prerequisites

- Node 24
- Docker (with Docker Compose)

### Setup

1. Copy the environment file and fill in real values:

   ```bash
   cp .env.example .env
   ```

2. Start Postgres and Redis:

   ```bash
   docker compose up -d
   ```

3. Install dependencies from the repo root (this is an npm workspaces monorepo):

   ```bash
   npm install
   ```

### Running the apps

The Next.js and NestJS apps run on the host (not in Docker) for fast iteration.
Postgres and Redis must be running (see above) before starting them.

```bash
npm run dev:web     # Next.js frontend — http://localhost:3000
npm run dev:api     # NestJS API — http://localhost:4000
npm run dev:worker  # NestJS BullMQ worker
```
