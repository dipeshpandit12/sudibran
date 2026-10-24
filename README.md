# Sudibran

Sudibran is a security and audit layer for AI-initiated financial actions. This repository is a monorepo containing the complete web application and backend.

| Folder | Contains |
|---|---|
| [`frontend/`](frontend/) | Next.js dashboard, payments UI, policies and audit trail |
| [`backend/`](backend/) | FastAPI gate, Droid planner, policy engine, audit chain and sponsor integrations |

## Run locally

Docker requirement: Docker Desktop with Docker Compose.

### One command with Docker

Start the frontend and all seven backend services together:

```bash
./run-all.sh
```

The command builds and starts Next.js, FastAPI, Postgres, OPA, the MCP proxy, broker, parser and raw agent, waits for the frontend and backend health endpoints, and prints their URLs. It reads sponsor credentials from `backend/.env` when that file exists.

If either local environment file is missing, the launcher prints the exact setup command and continues with safe defaults:

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Review the new files and add your local settings. Both `.env` files are ignored by Git and must not be committed.

```bash
./run-all.sh status   # container health
./run-all.sh logs     # follow every service
./run-all.sh down     # stop; keep database volume
```

The all-Docker stack uses the scripted planner because the subscription-authenticated Factory Droid binary runs on the host and cannot execute inside the Linux image. Use the manual localhost commands below when testing live Droid planning.

### Manual localhost development

Manual development requires Node.js 20.9+, npm, Python 3.12+ and `uv`.

```bash
# Terminal 1 — FastAPI
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Terminal 2 — Next.js
cd frontend
npm install
npm run dev
```

Open:

- Frontend: <http://localhost:3000>
- FastAPI documentation: <http://localhost:8000/docs>
- Backend health: <http://localhost:8000/api/health>

Next.js sends same-origin `/api/*` requests to FastAPI through the rewrite in `frontend/next.config.ts`. The default backend address is `http://127.0.0.1:8000`; set `SUDIBRAN_BACKEND_URL` in `frontend/.env.local` to override it.

For integration configuration, copy `backend/.env.example` to `backend/.env` and follow [`backend/README.md`](backend/README.md). Never commit `.env`, signing keys, local databases or sandbox account state; the repository ignore rules exclude them.

## Verify

```bash
cd backend
uv run pytest
uv run ruff check app tests scripts

cd ../frontend
npm run lint
npx tsc --noEmit
```

See [`frontend/README.md`](frontend/README.md) for the product walkthrough and [`backend/README.md`](backend/README.md) for architecture, API and sponsor-integration details.
