# MCP for AI agents

Implements phase D of `spec-v3.md`; connection flow simplified in `spec-v6.md` (section J).

The CRM exposes a Model Context Protocol (MCP) server so an agent (Claude Code, Claude
Desktop, Cursor, VS Code...) can read and create data: people, dates, reminders, meetings
and organizations. It is optional and off by default.

- SDK: official Python `mcp` package, pinned `mcp==1.30.0` (FastMCP).
- Code: Django app `backend/crm_mcp` (server, auth, models, REST API for the UI) and the
  shared domain layer `backend/crm/services.py`.
- Two transports: Streamable HTTP at `/mcp/` (the normal way) and stdio (same machine only).

## Connect an agent in 3 steps (Settings > Integrations)

1. Turn on "Allow AI agent access (MCP)". While it is off, the rest of the tab is disabled.
2. Under "Connection", copy the server URL and the token. If there is no token yet, press
   "Generate token" (name "AI agent", read + write). "Test connection" sends an MCP
   `initialize` and shows `Connected: simple-crm <version>` or the reason it failed.
3. Under "Set up your client", pick Claude Code, Claude Desktop, Cursor, VS Code or Other and
   paste the block. It is already filled with the URL and the token (copying always inserts
   the real token).

Server URL: `MCP_PUBLIC_URL` if set, otherwise `<origin of the page>/mcp/`, so it works as is
behind Caddy (Docker), behind the Astro dev proxy, or on a LAN address. `MCP_HTTP_URL` is
still read as an old alias. A `localhost`/`127.0.0.1` URL only works on that machine; to
connect another device, open the app through the machine's LAN IP, add that IP to
`ALLOWED_HOSTS` (and `CSRF_TRUSTED_ORIGINS`) and publish the port (see `docs/configuration.md`).

Client blocks (`<URL>` and `<TOKEN>` are filled by the UI):

| Client | Block |
|---|---|
| Claude Code | `claude mcp add --transport http simple-crm <URL> --header "Authorization: Bearer <TOKEN>"` |
| Claude Desktop (`claude_desktop_config.json`) | `{"mcpServers":{"simple-crm":{"command":"npx","args":["-y","mcp-remote","<URL>","--header","Authorization:Bearer <TOKEN>"]}}}`; `--allow-http` is appended when the URL is `http://` and the host is not local. Needs Node.js. |
| Cursor (`~/.cursor/mcp.json`) | `{"mcpServers":{"simple-crm":{"url":"<URL>","headers":{"Authorization":"Bearer <TOKEN>"}}}}` |
| VS Code (`.vscode/mcp.json`) | `{"servers":{"simple-crm":{"type":"http","url":"<URL>","headers":{"Authorization":"Bearer <TOKEN>"}}}}` |
| Other | URL plus header `Authorization: Bearer <TOKEN>` (Streamable HTTP) |

"Advanced: same machine over stdio" appears only when `/api/mcp/config/` returns `stdio`
(staff users, or `DEBUG=True`). It generates the `manage.py mcp_serve` block with the real
paths; stdio needs access to the same database as the backend.

The "AI activity" page (`/activity/`) lists every write with an Undo button on creations.
Access can also be toggled by admin (`User.mcp_enabled`) or `PATCH /api/auth/me/`
with `{"mcp_enabled": true}`.

## HTTP endpoint

`POST /mcp/` (with or without trailing slash) with `Authorization: Bearer crm_...`. It is an
ASGI app mounted in `crm_backend/asgi.py`, so it does NOT work under `manage.py runserver`
(WSGI): there `/mcp/` answers 501 with instructions. Serve the project with uvicorn:

```
backend/.venv/Scripts/python.exe -m uvicorn crm_backend.asgi:application --host 127.0.0.1 --port 8010 --app-dir backend
```

`frontend/astro.config.mjs` proxies `/api`, `/media` and `/mcp` to the same backend. Docker (`backend/Dockerfile`) runs
uvicorn and Caddy routes `/mcp` to it.

Request shape used by the UI's "Test connection" (and any client):

```
POST /mcp/
Authorization: Bearer crm_...
Content-Type: application/json
Accept: application/json, text/event-stream
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26",
 "capabilities":{},"clientInfo":{"name":"simple-crm-ui","version":"1.0.0"}}}
```

Server behaviour:
- Stateless (`stateless_http`): each request authenticates on its own; no sessions.
- JSON responses (`json_response`).
- Status codes: 401 missing, invalid, revoked or expired token; 403 `mcp_enabled` off or
  inactive user; 421 `Host` not allowed; 403 `Origin` not allowed; 501 under `runserver`.
- DNS rebinding protection (SDK): the `Host` must be one of `ALLOWED_HOSTS` (with or without a
  port, LAN IPs included) or the host of `MCP_PUBLIC_URL`. A `*` in `ALLOWED_HOSTS` turns the
  check off, as in Django. `Origin` is accepted only when it is `http(s)://` plus one of those
  hosts (or a `CSRF_TRUSTED_ORIGINS` entry): native MCP clients send none, and the app's own
  browser page sends one when it runs "Test connection". Behind Caddy the original `Host`
  reaches the backend unchanged, so the same rule applies.

## Security

- Token: `crm_` + `secrets.token_urlsafe(32)`. Authentication uses `sha256` only: lookup by
  `prefix` (8 chars, not secret) and `hmac.compare_digest`.
- The full token is also stored encrypted in `ApiToken.token_enc` (Fernet, same keys as notes)
  so Settings can show it again. `GET /api/mcp/tokens/<id>/reveal/` returns it only to the
  owner's session and answers 404 when the token is revoked or has no `token_enc` (tokens
  created before this column existed cannot be revealed; generate a new one). It sends
  `Cache-Control: no-store`. The UI keeps the revealed value in component memory only.
- Rejected when `User.mcp_enabled` is false, or the token is revoked or expired.
- Scope `write` required by write tools; `read` by read tools.
- 60 calls per minute per token (Django cache, fixed window). The default cache is
  per process: with several workers (Docker) `CACHE_URL=filecache://...` makes it shared.
- Strict owner scoping: every `crm/services.py` function filters by the token's user; a
  foreign id is treated as missing.
- No delete tools. Arguments are data: never evaluated, validated by serializers.
- `AgentAction.arguments` truncates text to 200 chars and stores only the length
  (`[N caracteres]`) for encrypted fields (`body`, `message`, `how_we_met`, `notes`).
- Undo (`POST /api/mcp/actions/{id}/undo/`) applies only to creation tools and deletes only
  the object that action created, if it still belongs to the user and has `created_via="mcp"`.
- Dates without a time zone use `settings.TIME_ZONE`; date-only means 09:00.

## Tools

Read (scope `read`):

| Tool | Arguments | Result |
|---|---|---|
| `search_persons` | `query?`, `tag?`, `favorite?` | Summary list (no encrypted fields) |
| `get_person` | `person_id` | Contacts, dates, last interactions, notes, organizations |
| `list_upcoming` | `days=30` | Birthdays and dates, reminders and meetings |
| `list_overdue_contacts` | - | People whose cadence is overdue |
| `list_tags` | - | Existing tags |
| `search_organizations` | `query?`, `kind?` | Organizations |

Write (scope `write`; each call is logged in `AgentAction`; created objects carry
`created_via="mcp"`):

| Tool | Arguments |
|---|---|
| `create_person` | `first_name`, `last_name?`, `nick_name?`, `company?`, `role?`, `how_we_met?`, `tags?`, `force=false` |
| `update_person` | `person_id`, `first_name?`, `last_name?`, `nick_name?`, `company?`, `role?`, `how_we_met?`, `favorite?`, `cadence_days?` |
| `add_contact_info` | `person_id`, `type`, `value`, `label?` |
| `add_birthday` | `person_id`, `month`, `day`, `year?` |
| `add_important_date` | `person_id`, `title`, `date` (YYYY-MM-DD), `recurrence="yearly"` |
| `create_reminder` | `title`, `remind_at`, `person_id?`, `recur="none"`, `lead_minutes=0`, `message?`, `kind="task"` |
| `complete_reminder` | `reminder_id` |
| `move_reminder` | `reminder_id`, `status` (`todo`, `in_progress`, `done`) |
| `schedule_meeting` | `title`, `starts_at`, `person_ids`, `ends_at?`, `location?`, `remind_before_minutes=0` |
| `log_interaction` | `person_id`, `kind`, `counts_as_contact`, `occurred_at?`, `body?`, `channel?` |
| `add_note` | `person_id`, `body`, `category="general"` |
| `tag_person` | `person_id`, `tag_names` |
| `create_organization` | `name`, `kind="other"`, `address?`, `city?`, `country?`, `phone?`, `email?`, `website?`, `notes?` |
| `add_person_to_organization` | `person_id`, `organization_id`, `role?`, `is_current=true`, `start_year?`, `end_year?` |

Notes:
- `create_person` looks for name duplicates (case-insensitive). On a match it returns
  `status: "duplicates"` with candidates and creates nothing; repeat with `force=true` only
  for a different person. `create_organization` returns `status: "exists"` for a known name.
- `schedule_meeting` creates a `Reminder` with `kind="meeting"`; `ends_at` is stored as text
  in the message (the model has no end time).
- `add_birthday` creates an `ImportantDate` of kind `birthday` (yearly); it rejects 29 Feb
  because the dashboard's next-birthday calculation breaks in non-leap years. No reminder is
  created: use `create_reminder` with `recur="yearly"` if wanted.
- `add_contact_info` `type`: `personal_phone`, `personal_email`, `work_phone`, `work_email`,
  `whatsapp`, `telegram`, `instagram`, `facebook`, `x`, `linkedin`, `discord`, `other`.
  `log_interaction` `kind`: `call`, `message`, `email`, `meeting_in_person`, `video_call`,
  `gift`, `note_shared`, `other`.

Resources: `crm://person/{person_id}` (person sheet as text), `crm://upcoming` (next 30 days).
Prompt: `weekly_review` (birthdays, overdue contacts and meetings).

## REST API for the UI

Django session, always scoped to the signed-in user.

- `GET/POST /api/mcp/tokens/`. List rows carry `can_reveal` (token stored, not revoked). The
  POST returns the full `token` once, plus `can_reveal`.
- `GET /api/mcp/tokens/{id}/reveal/` -> `{token}`; 404 if foreign, revoked, or no `token_enc`.
- `POST /api/mcp/tokens/{id}/revoke/`.
- `GET /api/mcp/actions/?limit=&tool=`; `POST /api/mcp/actions/{id}/undo/` (400 if not a
  creation or already undone; 409 if the object is gone or cannot be deleted safely).
- `GET /api/mcp/config/` -> `{"public_url": <MCP_PUBLIC_URL or null>, "stdio": {project_dir,
  python, manage_py}}`; `stdio` only for `is_staff` users or when `DEBUG` is on.
- `PATCH /api/auth/me/` accepts `mcp_enabled`.

## Models

- `crm_mcp.ApiToken`: `owner`, `name`, `token_hash`, `token_enc` (encrypted, optional),
  `prefix`, `scopes`, `created_at`, `last_used_at`, `expires_at`, `revoked_at`.
- `crm_mcp.AgentAction`: `owner`, `token` (SET_NULL), `tool_name`, `arguments`, `status`,
  `target_type`, `target_id`, `error_message`, `created_at`, `undone_at`.
- `accounts.User.mcp_enabled`; `created_via` (`ui`, `mcp`, `import`) on the main models so
  creations can be undone safely.

## Tests

```
cd backend
.venv/Scripts/python.exe manage.py test crm_mcp
```

They cover token auth (valid, invalid, revoked, expired, no scope, MCP off), rate limit, the
HTTP bearer middleware, every write tool, duplicates, undo, the REST API (including
`token_enc` storage, `reveal`, `can_reveal`, config payload and host/origin handling) and
owner isolation.
