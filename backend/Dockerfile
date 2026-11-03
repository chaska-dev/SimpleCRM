# syntax=docker/dockerfile:1
#
# Django + DRF + MCP backend (ASGI with uvicorn). Build from the repo root with
# docker compose (context ./backend). Multi-stage image, non-root user (app, uid 10001).

# --------------------------------------------------------------------------- build
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# --------------------------------------------------------------------------- runtime
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    DJANGO_SETTINGS_MODULE=crm_backend.settings

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=app:app . /app

# Writable directories: media (crm_media volume) and collected static files.
RUN mkdir -p /app/media /app/staticfiles \
    && chown -R app:app /app/media /app/staticfiles

USER app

# collectstatic only needs to import settings: dummy values, ONLY for this step
# (they are not kept in the image nor used at runtime).
RUN DEBUG=True DB_HOST=build DB_PORT=5432 DB_NAME=build DB_USER=build DB_PASSWORD=build \
    python manage.py collectstatic --noinput

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=4).status == 200 else 1)"]

# Waits for Postgres, applies migrations and starts uvicorn (Django + /mcp/).
ENTRYPOINT ["python", "/app/docker/entrypoint.py"]
