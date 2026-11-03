# Configuration

How to configure, expose, update and stop the Docker stack. Run every command from the repository root. The quick start is in the [README](../README.md).

The stack reads its settings from `.env.docker`. Create it with `python scripts/generate-secrets.py`: the script copies `.env.docker.example`, fills the three secrets, restricts the file permissions and never overwrites an existing file. `.env.docker` is ignored by git; do not commit it.

After editing `.env.docker`, apply the change with:

```bash
docker compose --env-file .env.docker up -d
```

Compose recreates only the services whose settings changed. If a secret is missing or still an example value, the backend refuses to start; the reason is in `docker compose --env-file .env.docker logs backend`.

## Variables in `.env.docker`

| Variable | Purpose | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django secret (sessions, CSRF). At least 32 characters. | Generated |
| `FIELD_ENCRYPTION_KEYS` | Comma-separated Fernet keys: the first encrypts, all decrypt (key rotation). Losing them makes encrypted data unrecoverable. | Generated |
| `POSTGRES_PASSWORD` | Postgres password. Only applies to a new data volume. | Generated |
| `POSTGRES_DB` | Database name. | `crm` |
| `POSTGRES_USER` | Database user. | `crm` |
| `DB_CONTAINER_NAME` | Name of the Postgres container. | `crm-db` |
| `PGDATA_VOLUME` | Name of the Postgres data volume. | `crm_pgdata` |
| `APP_PORT` | Host port of the proxy. Published on `127.0.0.1` unless you change the mapping. Avoid 8000, 4321, 8010 and 4338 (development ports). | `8080` |
| `SITE_ADDRESS` | Address Caddy serves. `:80` is plain HTTP; a domain name gets automatic TLS. | `:80` |
| `USE_HTTPS` | `True` when served over TLS: `Secure` cookies and HSTS. | `False` |
| `ALLOWED_HOSTS` | Hosts Django accepts, comma-separated. Keep `backend`: the frontend calls the API with that host. | `localhost,127.0.0.1,backend` |
| `CSRF_TRUSTED_ORIGINS` | Origins you open the app from (scheme, host, port), comma-separated. | `http://127.0.0.1:8080,http://localhost:8080` |
| `MCP_PUBLIC_URL` | URL of the MCP endpoint shown in Settings > Integrations. Empty means the origin you opened the app from plus `/mcp/`. Commented out in the example file. | empty |
| `ALLOW_REGISTRATION` | `true` (also `1`, `yes`, `on`) allows new accounts after the first one. Commented out in the example file. | `False` |
| `SESSION_COOKIE_AGE` | Session length in seconds. | `1209600` (14 days) |
| `UVICORN_WORKERS` | Number of uvicorn processes in the backend. | `2` |
| `IMAGE_TAG` | Tag of the images built locally (`crm-backend:<tag>`, `crm-frontend:<tag>`). | `local` |

`PGDATA_VOLUME` and `DB_CONTAINER_NAME` default to the names used by the development database (`crm_pgdata`, `crm-db`). If that volume already exists on your machine, the stack reuses it, and its Postgres password is the one it was created with (`changeme` in development), not `POSTGRES_PASSWORD`. For a clean install on a machine where you also develop, set `PGDATA_VOLUME=crm_docker_pgdata` and `DB_CONTAINER_NAME=crm-docker-db` in `.env.docker` before the first `up`.

### Backend variables outside `.env.docker`

`docker-compose.yml` passes a fixed set of variables to the backend container. These are set there and need no action: `DEBUG=False`, `TRUST_PROXY_SSL_HEADER=True`, `CACHE_URL=filecache:///tmp/crm_cache` (rate-limit counters shared between workers), `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD`.

`backend/crm_backend/settings.py` reads a few more that matter for a deployment. To use them in Docker, add them to the `backend` service `environment` block in `docker-compose.yml`; in local development, put them in `backend/.env`.

| Variable | Purpose | Default |
|---|---|---|
| `LOGIN_RATE_LIMIT_ATTEMPTS` | Failed logins allowed per IP and email in the window (then HTTP 429). | `5` |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | Length of that window. | `900` |
| `LOGIN_RATE_LIMIT_IP_ATTEMPTS` | Failed logins allowed per IP, any email. | `30` |
| `LOG_LEVEL` | Root log level. | `INFO` |
| `MCP_HTTP_URL` | Old alias of `MCP_PUBLIC_URL`, read only if `MCP_PUBLIC_URL` is empty. | empty |
| `RUN_MIGRATIONS` | Set to `0` to skip `migrate` when the container starts. | `1` |

## Expose on your network or a domain

By default the proxy listens on `127.0.0.1` only: nobody else can reach the app. Only the `proxy` service publishes a port; Postgres, backend and frontend stay on an internal network.

### Another local port

Set `APP_PORT` (for example `9090`) and make `CSRF_TRUSTED_ORIGINS` match (`http://127.0.0.1:9090,http://localhost:9090`).

### Your local network (HTTP)

Use this to open the app from a phone or another computer, and to connect AI agents running on other devices.

1. In `docker-compose.yml`, service `proxy`, change the port mapping from `"127.0.0.1:${APP_PORT:-8080}:80"` to `"0.0.0.0:${APP_PORT:-8080}:80"`.
2. In `.env.docker`, add the host or IP you will use (for example `192.168.1.20`) to both lists:

   ```env
   ALLOWED_HOSTS=localhost,127.0.0.1,backend,192.168.1.20
   CSRF_TRUSTED_ORIGINS=http://127.0.0.1:8080,http://localhost:8080,http://192.168.1.20:8080
   ```

3. Apply it: `docker compose --env-file .env.docker up -d`.
4. Open `http://192.168.1.20:8080` from the other device. Allow the port in the host firewall if needed.

The app has no TLS in this mode, so passwords and tokens travel unencrypted on your network. Use it only on a network you trust, or use a domain with TLS.

### A domain with automatic TLS

1. Point the DNS record of your domain (for example `crm.example.com`) to the server, and make sure ports 80 and 443 reach it.
2. In `.env.docker`:

   ```env
   SITE_ADDRESS=crm.example.com
   USE_HTTPS=True
   ALLOWED_HOSTS=crm.example.com,backend
   CSRF_TRUSTED_ORIGINS=https://crm.example.com
   ```

   `MCP_PUBLIC_URL` is optional here: the UI already uses the origin you opened. Set `MCP_PUBLIC_URL=https://crm.example.com/mcp/` only if agents must use a different URL.
3. In `docker-compose.yml`, service `proxy`, replace the port mapping with:

   ```yaml
   ports:
     - "80:80"
     - "443:443"
   ```

4. Apply it: `docker compose --env-file .env.docker up -d`.

Caddy requests and renews the certificate by itself and sends HSTS. The proxy routes `/api/*`, `/admin/*`, `/static/*`, `/media/*` and `/mcp` to the backend and everything else to the frontend (`deploy/Caddyfile`).

## Accounts and admin

- The first account is created at `/register/`. After that, registration is closed until you set `ALLOW_REGISTRATION=true`.
- Create an admin user for `/admin/`:

  ```bash
  docker compose --env-file .env.docker exec backend python manage.py createsuperuser
  ```

- Logs (the backend keeps no access log, because search URLs contain people's names):

  ```bash
  docker compose --env-file .env.docker logs -f backend
  ```

## Update

Back up first (see [backup.md](ops/backup.md)), then:

```bash
git pull
docker compose --env-file .env.docker up -d --build
```

The backend applies database migrations on start.

## Stop

Stop the stack and keep your data:

```bash
docker compose --env-file .env.docker down
```

Start it again with `docker compose --env-file .env.docker up -d`.

## Delete all data

```bash
docker compose --env-file .env.docker down -v
```

> **Warning:** `down -v` also deletes the volumes: the Postgres database (`PGDATA_VOLUME`, `crm_pgdata` by default), the uploaded files (`crm_media`) and Caddy's certificates. It cannot be undone. If you kept the default volume names and also use this machine for development, it deletes the development database too. Take a backup and store a copy of `FIELD_ENCRYPTION_KEYS` before running it.

## Related docs

- [Backups](ops/backup.md) and [encryption key rotation](ops/encryption.md).
- [MCP for AI agents](architecture/mcp.md).
- [Local development](development.md).
