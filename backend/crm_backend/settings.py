"""
Django settings for crm_backend project.

Stack: Django 5.2 + DRF + Postgres 16 (mandatory, no SQLite fallback) +
       Django sessions (httpOnly cookie) + CSRF + Fernet encryption over
       sensitive fields (including binary attachments).
Frontend: Astro standalone in ../frontend (port 4321 by default).
DB dev: docker compose up -d db (Postgres 16 alpine).
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import environ

from .config_checks import validate_production_config

# ---------------------------------------------------------------------------
# Paths and env
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, []),
)

# Reads .env if it exists (not required in prod: in Docker everything comes through environment variables)
environ.Env.read_env(BASE_DIR / ".env")

# DEBUG defaults to False: with nothing configured the process behaves like production.
DEBUG = env("DEBUG")

# DJANGO_SECRET_KEY (Docker / scripts/generate-secrets.py) or SECRET_KEY (dev .env).
# A development value exists only in DEBUG; with DEBUG=False the process does not start
# if it is missing or is an example value (validate_production_config, further below).
SECRET_KEY = env("DJANGO_SECRET_KEY", default="") or env("SECRET_KEY", default="")
if not SECRET_KEY and DEBUG:
    SECRET_KEY = "insecure-dev-key-change-me"

ALLOWED_HOSTS = env("ALLOWED_HOSTS")

# HTTPS: Secure cookies, HSTS and scheme detection behind the proxy (Caddy).
USE_HTTPS = env.bool("USE_HTTPS", default=False)

# ---------------------------------------------------------------------------
# Apps
# ---------------------------------------------------------------------------

INSTALLED_APPS = [
    # Django core
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "corsheaders",
    # Local
    "accounts.apps.AccountsConfig",
    "crm.apps.CrmConfig",
    "crm_attachment.apps.CrmAttachmentConfig",
    "crm_mcp.apps.CrmMcpConfig",
]

# django-extensions is development tooling only: loaded if installed.
if importlib.util.find_spec("django_extensions") is not None:
    INSTALLED_APPS.append("django_extensions")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # before CommonMiddleware
    # Login attempt limit (429). Before session/CSRF: blocking spends no resources.
    "crm_backend.ratelimit.LoginRateLimitMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "crm_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "crm_backend.wsgi.application"
ASGI_APPLICATION = "crm_backend.asgi.application"

# ---------------------------------------------------------------------------
# DB — Postgres 16 mandatory. No SQLite fallback.
# In dev: docker compose up -d db (running on localhost:5432).
# In prod: the same env vars pointing to the corresponding cluster.
# ---------------------------------------------------------------------------

_MISSING = [k for k in ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
            if not env(k, default="")]

if _MISSING:
    raise RuntimeError(
        f"Incomplete Postgres config. Missing: {', '.join(_MISSING)}. "
        "Start the service with `docker compose up -d db` and fill in .env "
        "with DB_HOST=localhost DB_PORT=5432 DB_NAME=crm DB_USER=crm DB_PASSWORD=changeme."
    )

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "HOST": env("DB_HOST"),
        "PORT": env("DB_PORT"),
        "NAME": env("DB_NAME"),
        "USER": env("DB_USER"),
        "PASSWORD": env("DB_PASSWORD"),
        # Simple pool for personal use — Django opens a single connection per worker.
        # CONN_HEALTH_CHECKS discards dropped connections (Postgres restart).
        "CONN_MAX_AGE": env.int("CONN_MAX_AGE", default=60),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {
            # Retry at startup if the Postgres container has not finished booting yet.
            "connect_timeout": 10,
        },
    }
}

# ---------------------------------------------------------------------------
# Auth — strong password hashing by default
# ---------------------------------------------------------------------------

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------

LANGUAGE_CODE = "es-cl"
TIME_ZONE = "America/Santiago"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static / media
# ---------------------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# DRF — Django sessions + CSRF as the main auth
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",  # for attachment uploads
    ],
}

# ---------------------------------------------------------------------------
# Sessions and CSRF — httpOnly cookie + SameSite. Secure controlled by USE_HTTPS.
# ---------------------------------------------------------------------------

# Session lifetime in seconds (default 14 days).
SESSION_COOKIE_AGE = env.int("SESSION_COOKIE_AGE", default=60 * 60 * 24 * 14)
SESSION_SAVE_EVERY_REQUEST = False
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = USE_HTTPS

CSRF_COOKIE_HTTPONLY = False  # JS needs to read it to send it in the X-CSRFToken header
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = USE_HTTPS
# Trusted origins for CSRF (scheme + host + port). If not set, CORS_ALLOWED_ORIGINS
# is used (previous behavior).
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=env("CORS_ALLOWED_ORIGINS"))

# Behind a proxy that terminates TLS (Caddy) the scheme arrives in X-Forwarded-Proto.
# Only enable if the backend is NOT directly reachable from outside the proxy.
if env.bool("TRUST_PROXY_SSL_HEADER", default=USE_HTTPS):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# ---------------------------------------------------------------------------
# CORS — explicit origins only, with credentials
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# ---------------------------------------------------------------------------
# Encryption — cryptography.fernet (MultiFernet for key rotation).
# Protected fields: Note.body, Interaction.body, Reminder.message,
# Person.how_we_met, Organization.notes, Attachment.file. Same keys for everything.
#
# FIELD_ENCRYPTION_KEYS: CSV list; the FIRST one encrypts, ALL of them decrypt (rotation).
# FIELD_ENCRYPTION_KEY: a single key (compatibility); equivalent to a list of one.
# In dev it is not strictly required (ImproperlyConfigured when used without a key).
# In prod (DEBUG=False) it is mandatory: startup is blocked.
# ---------------------------------------------------------------------------

FIELD_ENCRYPTION_KEYS = [
    k.strip() for k in env.list("FIELD_ENCRYPTION_KEYS", default=[]) if k.strip()
]
FIELD_ENCRYPTION_KEY = env("FIELD_ENCRYPTION_KEY", default="")

# Fail-closed: with DEBUG=False it does not start without a secure SECRET_KEY and valid encryption keys.
validate_production_config(
    DEBUG,
    SECRET_KEY,
    FIELD_ENCRYPTION_KEYS + ([FIELD_ENCRYPTION_KEY] if FIELD_ENCRYPTION_KEY else []),
)

# ---------------------------------------------------------------------------
# Attachments — validation policy and quota
# ---------------------------------------------------------------------------

# Accepted MIME types. Conservative whitelist: nothing executable, no scripts.
# Common formats (pdf, office, images, audio, video) are allowed.
ATTACHMENT_ALLOWED_MIMES = [
    # Text
    "text/plain",
    "text/markdown",
    "application/pdf",
    # Office (modern OOXML format)
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",     # .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",            # .xlsx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",    # .pptx
    # Office (legacy .doc/.xls/.ppt usually map to octet-stream from the browser;
    # we accept them by extension if they come from the same owner — see serializer)
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    # Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    # Audio / video ("listen to this" reminders, video calls, etc.)
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "video/mp4",
    "video/ogg",
    "video/webm",
]

# Maximum size per file (25 MB)
ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024

# Total quota per user (500 MB). Validated in serializer pre_save (sum of the owner's
# size_bytes + new file).
ATTACHMENT_USER_QUOTA_BYTES = 500 * 1024 * 1024

# Directory where the encrypted files live under MEDIA_ROOT.
ATTACHMENT_UPLOAD_SUBDIR = "attachments"

# ---------------------------------------------------------------------------
# MCP — public URL of the Streamable HTTP endpoint shown by the UI (Settings >
# Integrations). Empty = the UI uses the origin from which you open the app + "/mcp/".
# MCP_HTTP_URL is read as an old alias if MCP_PUBLIC_URL is not set. The endpoint
# requires an ASGI server (uvicorn), see docs/architecture/mcp.md.
# ---------------------------------------------------------------------------

MCP_PUBLIC_URL = (
    env("MCP_PUBLIC_URL", default="") or env("MCP_HTTP_URL", default="")
).strip()

# ---------------------------------------------------------------------------
# Cache — rate limit counters (login and MCP). Default: process memory.
# With several workers (Docker) CACHE_URL=filecache:///tmp/crm_cache is used so the
# limit is shared between workers. Decrypted content is never cached.
# ---------------------------------------------------------------------------

CACHES = {"default": env.cache("CACHE_URL", default="locmemcache://crm-default")}

# Login: maximum FAILED attempts per window, per IP + email (HTTP 429 when exceeded).
LOGIN_RATE_LIMIT_ATTEMPTS = env.int("LOGIN_RATE_LIMIT_ATTEMPTS", default=5)
LOGIN_RATE_LIMIT_WINDOW_SECONDS = env.int("LOGIN_RATE_LIMIT_WINDOW_SECONDS", default=15 * 60)
# Additional cap per IP (any email) so rotating emails does not bypass the limit.
LOGIN_RATE_LIMIT_IP_ATTEMPTS = env.int("LOGIN_RATE_LIMIT_IP_ATTEMPTS", default=30)

# ---------------------------------------------------------------------------
# Uploads — DATA_UPLOAD_MAX_MEMORY_SIZE limits the non-file body; it is aligned
# with the maximum attachment size. Large files go to temporary disk.
# ---------------------------------------------------------------------------

DATA_UPLOAD_MAX_MEMORY_SIZE = env.int(
    "DATA_UPLOAD_MAX_MEMORY_SIZE", default=ATTACHMENT_MAX_BYTES + 1024 * 1024
)
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024

# ---------------------------------------------------------------------------
# Security headers — always (harmless in dev).
# ---------------------------------------------------------------------------

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

if USE_HTTPS:
    # HSTS only with real HTTPS (browsers ignore it over http).
    SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 30)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False)
    SECURE_HSTS_PRELOAD = False

# ---------------------------------------------------------------------------
# Logging — to stdout (Docker collects it). No request bodies or field values:
# django.request only logs method/path/status.
# ---------------------------------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
    "loggers": {
        "django": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
