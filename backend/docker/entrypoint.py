"""
Entrypoint of the backend container (pure Python: no shell, no line-ending problems).

1. Waits for Postgres to accept connections (DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD).
2. Applies migrations (RUN_MIGRATIONS=0 to skip).
3. Replaces the process with uvicorn serving crm_backend.asgi:application
   (Django + /mcp/), or with the command received if one was passed
   (e.g. `docker compose run --rm backend python manage.py createsuperuser`).

If the configuration is insecure (DEBUG=False without DJANGO_SECRET_KEY or without valid
FIELD_ENCRYPTION_KEYS) settings.py raises ImproperlyConfigured: `migrate` fails,
the container exits with the reason in the logs and the server does NOT start.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time


def log(message: str) -> None:
    print(f"[entrypoint] {message}", flush=True)


def wait_for_db(timeout: int = 90) -> None:
    import psycopg

    params = {
        "host": os.environ.get("DB_HOST", ""),
        "port": os.environ.get("DB_PORT", "5432"),
        "dbname": os.environ.get("DB_NAME", ""),
        "user": os.environ.get("DB_USER", ""),
        "password": os.environ.get("DB_PASSWORD", ""),
        "connect_timeout": 3,
    }
    deadline = time.monotonic() + timeout
    attempt = 0
    while True:
        attempt += 1
        try:
            psycopg.connect(**params).close()
            log(f"Postgres ready (attempt {attempt}).")
            return
        except psycopg.OperationalError as exc:
            if time.monotonic() > deadline:
                log(f"Postgres not responding after {timeout}s: {str(exc).strip()[:200]}")
                sys.exit(1)
            time.sleep(2)


def main() -> None:
    if not os.environ.get("DB_HOST"):
        log("DB_HOST is missing: the backend requires Postgres.")
        sys.exit(1)

    wait_for_db()

    if os.environ.get("RUN_MIGRATIONS", "1") not in ("0", "false", "False"):
        log("Applying migrations...")
        result = subprocess.run([sys.executable, "manage.py", "migrate", "--noinput"])
        if result.returncode != 0:
            log("migrate failed; the server is not started.")
            sys.exit(result.returncode)

    if len(sys.argv) > 1:
        os.execvp(sys.argv[1], sys.argv[1:])

    workers = os.environ.get("UVICORN_WORKERS", "2")
    command = [
        sys.executable, "-m", "uvicorn", "crm_backend.asgi:application",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--workers", workers,
        "--proxy-headers",
        # The backend is not published: only the proxy reaches it over the internal network.
        "--forwarded-allow-ips", os.environ.get("FORWARDED_ALLOW_IPS", "*"),
        # No access log: search URLs carry people's names in the query.
        "--no-access-log",
        "--timeout-keep-alive", "15",
    ]
    log(f"Starting uvicorn ({workers} workers).")
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
