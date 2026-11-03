# Development

Local development setup, tests and repository layout. For running the finished stack, see the [README](../README.md) and [configuration](configuration.md).

In development only the database runs in Docker. The backend (Django under uvicorn) and the frontend (Astro dev server) run on your machine.

Requirements: Docker with Compose v2, Python 3.10 or newer (the Docker image uses 3.12), Node 20 or newer and pnpm (the frontend image pins pnpm 10.20.0; pnpm 11 needs Node 22 or newer).

## 1. Database

`docker-compose.override.yml` is loaded automatically by `docker compose` and publishes Postgres 16 on loopback only, `127.0.0.1:5433`:

```bash
docker compose up -d db
docker compose ps
```

Development credentials: database `crm`, user `crm`, password `changeme`. If port 5433 is taken, change the first number in the override file and `DB_PORT` in `backend/.env`. To run without the published port, use `docker compose -f docker-compose.yml ...`.

The development database uses the container `crm-db` and the volume `crm_pgdata`, the same defaults as the production stack (see [configuration](configuration.md)).

## 2. Backend

Create the virtual environment, install dependencies and configure `backend/.env` (PowerShell; on Linux or macOS use `.venv/bin/python` and `cp`):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

Edit `backend/.env`:

- `FIELD_ENCRYPTION_KEY`: a Fernet key. Generate one from the repo root with `python scripts/generate-secrets.py --new-encryption-key` (it prints a key and writes nothing).
- `SECRET_KEY`: with `DEBUG=True` a development key is used if you leave it unset; `DEBUG=False` refuses to start without a real one.
- `DB_*` already match the development database (`127.0.0.1`, `5433`, `crm`, `crm`, `changeme`).
- `CORS_ALLOWED_ORIGINS`: the origin of the frontend dev server. It is also the default for `CSRF_TRUSTED_ORIGINS`. For the ports below use `http://localhost:4338,http://127.0.0.1:4338`.

Apply migrations and start the server on port 8010. Run this from the repo root:

```bash
backend/.venv/Scripts/python.exe backend/manage.py migrate
backend/.venv/Scripts/python.exe -m uvicorn crm_backend.asgi:application --host 127.0.0.1 --port 8010 --app-dir backend
```

Use uvicorn rather than `manage.py runserver`: the MCP endpoint `/mcp/` is an ASGI app and answers 501 under `runserver`. Check that `http://127.0.0.1:8010/api/health/` responds.

## 3. Frontend

```bash
cd frontend
pnpm install
```

Point the dev server at the backend with `API_INTERNAL_URL`, either in `frontend/.env` (template: `frontend/.env.example`) or in your shell, then start Astro on port 4338:

```bash
# frontend/.env
API_INTERNAL_URL=http://127.0.0.1:8010
```

```bash
pnpm exec astro dev --host 127.0.0.1 --port 4338
```

Open http://127.0.0.1:4338. Astro proxies `/api`, `/media` and `/mcp` to `API_INTERNAL_URL`, so the browser always talks to one origin and the session cookie works. `PUBLIC_API_URL` is only for production or cross-origin builds and is normally left unset in development.

The defaults without those settings are backend `http://127.0.0.1:8000` and frontend `http://127.0.0.1:4321` (`pnpm dev`), if you prefer them and those ports are free.

## 4. Demo data

`seed_demo` creates a demo user with tags, people, interactions, notes and reminders. It only runs with `DEBUG=True`, is idempotent, and `--reset` deletes the demo user and recreates everything:

```powershell
cd backend
.venv\Scripts\python.exe manage.py seed_demo
```

It prints the credentials it created. The defaults are `demo@simplecrm.test` and `demo-crm-2026`; choose others with `--email` and `--password`.

## 5. Tests

```powershell
# Backend: uses the development Postgres; Django creates and drops test_crm
cd backend
.venv\Scripts\python.exe manage.py test
.venv\Scripts\python.exe manage.py test crm_mcp      # a single app

# Frontend: type checking with astro check
cd frontend
pnpm typecheck
```

Contacts import and export tests are in `backend/crm/tests_importexport.py`, with fixtures in `backend/crm/fixtures/importexport/`. The MCP tests are described in [architecture/mcp.md](architecture/mcp.md).

## Repository layout

```
.
├── backend/                     # Django API
│   ├── crm_backend/             # settings, urls, asgi
│   ├── accounts/                # user (email login) and authentication
│   ├── crm/                     # domain: people, dates, reminders, organizations, notes,
│   │                            #   importexport.py (vCard / Google CSV), seed_demo
│   ├── crm_attachment/          # encrypted attachments
│   ├── crm_mcp/                 # MCP server and API tokens
│   ├── docker/entrypoint.py     # waits for the DB, migrates, starts uvicorn
│   ├── scripts/smoke_test.py    # end-to-end script (expects the backend on port 8000)
│   └── Dockerfile
├── frontend/                    # Astro SSR + React islands
│   ├── src/                     # pages, components, i18n (es/en), lib, types
│   └── Dockerfile
├── deploy/Caddyfile             # reverse proxy and security headers
├── scripts/generate-secrets.py  # creates .env.docker
├── docker-compose.yml           # full stack
├── docker-compose.override.yml  # development: Postgres on 127.0.0.1:5433
├── .env.docker.example          # template for the stack variables
└── docs/                        # architecture, design, brand, ops, configuration
```

More documentation:

- Operations: [ops/backup.md](ops/backup.md), [ops/encryption.md](ops/encryption.md).
- MCP: [architecture/mcp.md](architecture/mcp.md).
- Architecture and specs: [architecture/](architecture/) (`db-plan-v1.md`, `frontend-plan-v1.md`, `plan-v2.md`, `spec-v3.md` to `spec-v6.md`).
- Design: [design/style-spec-v2.md](design/style-spec-v2.md), [design/style-spec-v2.1.md](design/style-spec-v2.1.md), [design/themes.md](design/themes.md).
- Brand and logo: [brand/kit/README.md](brand/kit/README.md).
- Project status: [TODO.md](TODO.md).
