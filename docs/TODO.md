# TODO / Skeleton maestro — SimpleCRM

> Roadmap operativa: lo que está planeado en
> [`db-plan-v1.md`](./architecture/db-plan-v1.md) + [`frontend-plan-v1.md`](./architecture/frontend-plan-v1.md)
> vs lo que está implementado hoy en el repo.
>
> **Última revisión:** 2026-09-24
> **Mantenedor:** Josue + Mavis (sesión raíz)

## Cómo leer este doc

- [x] **implementado y verificado** (existe en código, no es stub)
- [~] **parcial / placeholder** (existe UI con copy "próximamente", o endpoint en views pero sin wiring)
- [ ] **pendiente** (no existe, o el plan lo marca como fuera de scope y conviene confirmarlo)
- Cada item referencia la decisión/§ del plan al que aplica (ej. `D24`, `§4.2`, `§10.2`)
- El orden sugerido de ataque es **PR-A infra → PR-B frontend → PR-C cleanup**.
  Ver `frontend-plan-v1.md` §10.5 para la lógica.

---

## Backend · `accounts`

### Modelo `accounts.User`

- [~] **Email login** — implementado (`USERNAME_FIELD = "email"`).
- [ ] `preferred_lang: CharField(max_length=5, default="es")` — `frontend-plan §10.1`
- [ ] `preferred_theme: CharField(max_length=10, default="light")` — `frontend-plan §10.1`
- [ ] `timezone: CharField(50, default="America/Santiago")` — `frontend-plan §10.1`
- [ ] `avatar: OneToOneField(Attachment, SET_NULL, null=True)` — `frontend-plan §10.1`
- [ ] Migración `0003_user_ui_fields` que agrega los 4 campos de arriba — `db-plan-v1.md` §3.1 / `frontend-plan §10.1`

### Endpoints (`backend/accounts/urls.py`)

- [x] `GET /api/auth/csrf/`
- [x] `POST /api/auth/register/`
- [x] `POST /api/auth/login/`
- [x] `POST /api/auth/logout/`
- [x] `GET /api/auth/me/`
- [ ] **`PATCH /api/auth/me/`** con `{first_name, last_name}` — `frontend-plan §10.2`. El front
  (`AccountTab.tsx:45`) ya lo llama y maneja `405/400` como "endpoint no existe".
- [ ] **`POST /api/auth/change-password/`** con `{current_password, new_password, new_password_confirm}` → 204 — `frontend-plan §10.2`
- [ ] **`GET /api/auth/sessions/`** → lista `django_session` del user — `frontend-plan §10.2`
- [ ] **`POST /api/auth/sessions/revoke-others/`** → mata todas menos la actual — `frontend-plan §10.2`
- [ ] **`DELETE /api/auth/me/`** con `{confirm: "ELIMINAR"}` → CASCADE total — `frontend-plan §10.2`. La UI hoy muestra `delete_pending`.
- [ ] **`GET /api/auth/registration-status/`** → `{can_register, users_count}`, público — `frontend-plan §4.1`

### Reglas de negocio auth

- [ ] **Register-once**: `RegisterView` rechaza con 403 si ya existe ≥1 user, salvo env `ALLOW_REGISTRATION=true` — `frontend-plan §4.1 D-regla`. Hoy el registro está siempre abierto.
- [ ] Validar `new_password ≥ 10` en change-password (consistente con `AUTH_PASSWORD_VALIDATORS` en settings)

---

## Backend · `crm` (modelos)

| Modelo | Estado | Notas |
|---|---|---|
| `Tag` | [x] | owner + UniqueConstraint(owner, name) |
| `Person` | [~] | Falta `profile_photo` (D24) — el Attachment OneToOne está en el plan pero no en el modelo ni en migración |
| `ContactInfo` | [x] | `type` libre con choices en `CONTACT_TYPES` |
| `ImportantDate` | [x] | kind reducido a `{birthday, custom}` + `birth_year` + `icon`/`icon_image`/`attachment` |
| `Reminder` | [x] | recur={none,yearly,monthly,weekly} + lead_minutes + message_enc |
| `Interaction` | [x] | counts_as_contact + body_enc |
| `Note` | [x] | category + body_enc |
| [ ] `Organization` + `PersonOrganization` | v2 (D4) |

### Detalles a cerrar en `Person`

- [ ] **`profile_photo: OneToOneField(Attachment, on_delete=SET_NULL, null=True)`** — `db-plan D24`
  - Requiere crear el field + migración `0003_person_profile_photo`
  - Lógica de "reemplazar = borrar fila anterior y crear nueva" (no se hace sola con OneToOne, hay que codearla)
- [ ] Endpoint **`POST /api/persons/{id}/profile-photo/`** (multipart) — `frontend-plan §10.2`
- [ ] Endpoint **`DELETE /api/persons/{id}/profile-photo/`** (desasocia, no borra la fila del attachment) — `frontend-plan §10.2`

---

## Backend · `crm` (vistas / urls)

### `PersonViewSet` (`backend/crm/views.py`)

- [x] CRUD + `mark-contacted` + `timeline`
- [x] Filtros: `search`, `tag`, `cadence_status`
- [~] `cadence_status` se filtra en código Python sobre `qs` (loop), no en SQL — sirve pero no escala. Considerar annotate con `Case/When` o propiedad en `Person` consumida por `qs.filter(cadence_status=...)`.

### `ReminderViewSet`

- [x] CRUD + `complete` action
- [~] **D12 (Reminder yearly → auto-Interaction)**: el signal `auto_create_interaction_on_reminder_complete` existe en `signals.py:62`, pero NO clona el Reminder al próximo año tras completarlo (el comentario en `signals.py:103` dice "se hace al próximo año" pero no veo el código que lo clone). Verificar y agregar `clone_next_occurrence()` si falta.

### `DashboardViewSet`

- [x] overdue / due_soon / unknown / upcoming_dates / upcoming_reminders
- [~] Recorre `persons` y `important_dates` en Python. OK para uso personal, pero documentar la cota.

### Endpoints nuevos a agregar en `crm_backend/urls.py`

- [ ] `GET /api/me/preferences/` — `{preferred_lang, preferred_theme, timezone}` — `frontend-plan §10.2`
- [ ] `PATCH /api/me/preferences/` — partial update — `frontend-plan §10.2`
- [ ] `GET /api/me/storage-usage/` — `{used_bytes, quota_bytes, percentage, by_attachment[]}` — `frontend-plan §10.2`
- [ ] `GET /api/me/encryption-fingerprint/` — últimos 4 chars de SHA256(FIELD_ENCRYPTION_KEY). **Nunca** el key completo — `frontend-plan §10.2`
- [ ] `POST /api/me/avatar/` (multipart) → crea Attachment + setea `user.avatar` — `frontend-plan §10.2`
- [ ] `DELETE /api/me/avatar/` → borra attachment + null en `user.avatar` — `frontend-plan §10.2`

---

## Backend · `crm_attachment`

- [x] Modelo `Attachment` con `GenericForeignKey` (Person/Note/Interaction/ImportantDate)
- [x] ViewSet con `download` + `thumb` (Pillow, cache implícito por Django)
- [x] Serializer valida MIME whitelist + tamaño + quota + owner-match del subject
- [~] `EncryptedFileField` + `EncryptedFileSystemStorage` en `backend/crm/fields.py` — verificar que el path `media/attachments/{owner_id}/{year}/{month}/{uuid}.bin` cumple §4.4 del plan
- [~] Thumbnails on-demand sin persistencia (D-implícito §4.4) — implementado pero sin cache decorator (`@cache_page`) que el plan menciona. Agregar si hace falta.
- [~] Quota check en serializer: `used + new_size > quota`. Correcto, pero `used` se calcula en cada upload. Para escala personal OK.

---

## Backend · cleanup de serializers

`frontend-plan §10.3` pide **eliminar los campos `_display`** (front traduce via `i18n/enums.*`).

Hoy el código todavía los envía:

- [ ] `ContactInfoSerializer.type_display` → quitar (sólo `type`)
- [ ] `InteractionSerializer.kind_display` → quitar (sólo `kind`)
- [ ] `NoteSerializer.category_display` → quitar (sólo `category`)
- [ ] `ImportantDateSerializer` no tiene `_display`, no tocar
- [ ] `ReminderSerializer` no tiene `_display`, no tocar
- [ ] `PersonSerializer` no tiene `_display`, no tocar
- [ ] Front: actualizar componentes que todavía consumen `*_display` (grep `\.type_display|\.kind_display|\.category_display` en `frontend/src/`)

---

## Backend · signals (cadencia)

- [x] `update_last_contacted_on_save` (D5/D8/D15/D16)
- [x] `update_last_contacted_on_delete`
- [~] `auto_create_interaction_on_reminder_complete` (D12) — ver nota en `ReminderViewSet` arriba; falta verificar el clone anual.

---

## Frontend · i18n

- [x] `es.json` bastante completo (~460 líneas, cubre shell, person, contact_info, interaction, note, date, reminder, tag, enums, settings, attachment, dashboard, view, errors, auth)
- [ ] **Auditar `en.json`** — verificar paridad 1:1 con `es.json`. Probablemente faltan varias keys que están en `es.json` y no en `en.json`. Diff con `Compare-Object (Get-Content es.json -Raw).Split("`n") (Get-Content en.json -Raw).Split("`n")` o un script Python.
- [ ] Keys pendientes si faltan:
  - `auth.register_closed`, `auth.wrong_credentials` (existen en es.json)
  - `settings.defaults.field_how_we_met*` (existen en es.json)
  - `settings.encryption.key_prefix_label` y `key_prefix_unavailable`
- [ ] **Plan §3.2** define estructura canónica — usarla como checklist de paridad

---

## Frontend · theming

- [x] `tokens.ts` + `themes.ts` + `global.css` con CSS vars
- [x] `ThemeSwitcher` (toggle claro/oscuro) en shell
- [x] `NoFOUC.astro` para evitar flash
- [x] 2 temas: `light` + `dark` (Neobrutalist)
- [~] `localStorage.preferred_theme` funciona, **pero la sync a backend no existe** (`GeneralTab.tsx` muestra `theme_offline`). Conectar a `PATCH /api/me/preferences/` cuando ese endpoint exista.
- [~] Idem para `lang` — `localStorage.preferred_lang` anda, sync a backend pendiente.

---

## Frontend · shell / navigation

- [x] `AppShell`, `TopBar`, `SideNav`, `ToastContainer`
- [x] Search bar en topbar — **stub**: hoy sólo hace echo local. Hay que wirearlo a `GET /api/persons/?search=` y posiblemente `/api/attachments/?search=` cuando esté la búsqueda global de `frontend-plan §3.4 D12`.

---

## Frontend · pages (estado por URL del plan)

| Página | Estado | Notas |
|---|---|---|
| `/` (index) | [x] | Redirect a `/dashboard` o `/login` |
| `/login` | [x] | |
| `/register` | [x] | |
| `/404` | [x] | |
| `/dashboard` | [x] | 5 widgets + QuickLogBar + QuickLogModal |
| `/persons/` (grid/list) | [x] | Grid default + List toggle en `PersonsListView` |
| `/persons/new` | [x] | `PersonCreateForm` con secciones (basics, tags, contacts) |
| `/persons/[id]` | [~] | 5 tabs (Contacto, Interacciones, Notas, Fechas y recordatorios, Adjuntos). **Falta**: `ProfilePhoto` (componente existe pero el i18n dice "coming_soon") — wiring al endpoint de `Person.profile_photo` cuando exista |
| `/tags` | [x] | `TagsView` con create/edit/delete + person_count |
| `/reminders` | [x] | Tabs Pendientes/Completados/Todos + filtros |
| `/settings` | [x] | 5 tabs internos (General, Defaults, Storage, Encryption, Account) |
| `/contacts` | [x] | Sólo redirect 301 → `/persons/` (legacy del rename Contact→Person) |

### Por completar dentro de páginas existentes

- [~] **Settings · Account**: PATCH `/api/auth/me/`, change-password, sessions list, revoke-others, DELETE me, avatar upload — todos los endpoints faltan en backend
- [~] **Settings · Storage**: el endpoint `/api/attachments/usage/` está mencionado en `StorageTab.tsx:6` pero no existe. Hoy lista adjuntos vía `/api/attachments/?limit=10` y calcula uso local — funciona pero el plan pide endpoint dedicado.
- [~] **Settings · Encryption**: muestra `key_prefix_unavailable`. Cuando exista `/api/me/encryption-fingerprint/` se conecta.
- [~] **Settings · Defaults**: explícitamente "coming_soon" (sólo localStorage). El plan lo marca como persistido por usuario.
- [~] **Settings · General**: language/theme persisten local; sync a backend pendiente.

### Páginas v2 (fuera de scope v1)

- [ ] `/calendar` — FullCalendar o similar. D13 lo excluye de v1.
- [ ] `/search` — universal search con facets (D12 ya cubre búsqueda topbar; página dedicada es nice-to-have)
- [ ] `/onboarding` — primer uso, default a empty state en dashboard (decisión confirmada en §7)
- [ ] `/help` — atajos + FAQ

---

## Frontend · componentes

`frontend-plan §5` lista ~30 componentes. Mapeo rápido:

### Primitivos (revisar contra `frontend/src/components/`)

- [x] `Button`, `Modal`, `ConfirmDialog`, `EmptyState`, `Tabs`, `FormField`
- [~] `Toast` + `ToastContainer` — existe `ToastContainer.tsx`; verificar que se monta una sola vez
- [~] `Skeleton` — usado en algunos componentes (confirmar cobertura)
- [ ] `IconButton`, `Avatar` (con fallback de iniciales), `Tag` chip, `Card`, `Stack`, `DatePicker`, `TimePicker`, `ColorPicker`, `SearchBar`, `FilterDropdown`, `SortMenu`, `Pill` — verificar existencia caso por caso
- [ ] `RelationshipStars` (`Stars.tsx` existe) — confirmar edit-in-place

### Dominio

- [x] `PersonCard` (grid + list variants)
- [x] `PersonDetailView` con header + tabs
- [x] `CadenceBadge`, `ContactTab`, `InteractionsTab`, `NotesTab`, `DatesTab`, `AttachmentsTab`
- [x] `ReminderRow`, `ReminderFormModal`
- [x] `QuickLogBar` + `QuickLogModal` en dashboard
- [~] `ProfilePhoto` — UI existe, backend falta

### Hooks

- [~] `useTheme`, `useTranslation` — verificar implementación (probablemente localStorage directo)
- [ ] **`usePersons(filters)`, `usePerson(id)`, `useAttachments`, `useDashboard`** con TanStack Query (D3.5)
  - **Hoy no veo `@tanstack/react-query` en `package.json`** — el plan dice "TanStack Query por isla" pero la implementación actual parece usar `fetch` directo + state local. Decidir: o se agrega la dep + se migran los `useEffect(fetch…)`, o se documenta como excepción justificada.

---

## Frontend · infra / deps

- [ ] **`@tanstack/react-query`** si se adopta la decisión de §3.5
- [~] **Búsqueda full-text cifrada**: explícitamente v2 (`db-plan D10`, `frontend-plan §7`).
- [ ] **Markdown en Note body**: por ahora plain text, v2 (`frontend-plan §7`).
- [~] **i18n date/time**: `Intl.DateTimeFormat()` debería usarse en componentes que muestran fechas — verificar que no quedan `toLocaleDateString('es-CL')` hardcoded.

---

## Tests

- [x] `backend/scripts/smoke_test.py` — E2E: registro → CRUD → encriptación → CASCADE
- [ ] **pytest + DRF APIClient** — `backend/crm/tests/`, `backend/crm_attachment/tests/`, `backend/accounts/tests/`. Cero tests unitarios hoy.
  - Cobertura mínima sugerida:
    - `crm/models.py` — `cadence_status` property (4 paths), `days_until_next` (birthday + custom + recurrence)
    - `crm/signals.py` — `update_last_contacted_on_save` y `_on_delete`, `auto_create_interaction_on_reminder_complete`
    - `crm_attachment/serializers.py` — quota overflow, MIME whitelist, owner-match
    - `crm/views.py` — `mark_contacted` crea Interaction + signal dispara, `cadence_status` filter
- [ ] **Vitest + @testing-library** — `frontend/src/**/__tests__/`. Cero tests hoy.
  - Cobertura mínima:
    - `RemindersView` tabs filtering
    - `QuickLogModal` flow completo
    - `ContactTab` add/edit/delete
    - i18n: `useTranslation` resuelve keys faltantes a fallback (no rompe)

---

## Dev infra

- [x] `docker-compose.yml` con servicio `db` Postgres 16
- [x] `backend/.env.example` documenta vars
- [x] `backend/scripts/smoke_test.py`
- [~] `backend/db.sqlite3` commiteado al `.gitignore`? Verificar — los settings rechazan arrancar sin Postgres, así que el `.sqlite3` debería ser artefacto legacy.
- [~] **CI**: no veo `.github/workflows/`, `.gitlab-ci.yml`, ni nada. Decidir si se quiere CI ahora o más adelante.
- [ ] **Backups de `media/`** — `db-plan §4.4` dice que la encriptación a nivel filesystem (LUKS/eCryptfs/ZFS) es **fuera de scope Django** y queda a criterio del admin. Documentar la expectativa en el README.

---

## v2 / fuera de scope (ver `db-plan-v1.md` y `frontend-plan-v1.md` §7)

Esto **NO** se hace en v1 — listarlo para no perderlo:

- [ ] `Organization` + `PersonOrganization` (D4)
- [ ] Búsqueda full-text sobre notas cifradas (D10) — opciones: SIV, índice separado, outsource. Ver draft §4.5.
- [ ] Soft-delete / papelera (D17)
- [ ] Onboarding flow dedicado (`frontend-plan §7`)
- [ ] Calendar view (`/calendar`, D13)
- [ ] Universal search page (`/search`)
- [ ] Markdown en Note body (`frontend-plan §7`)
- [ ] Export/Import DB (JSON/vCard) (`frontend-plan §4.8 Settings · Data`)
- [ ] OCR / transcripción de attachments (excluido en `db-plan §1` y `frontend-plan §1`)
- [ ] Notificaciones push, PWA offline (excluido en `frontend-plan §1`)
- [ ] Compartición con otras personas (excluido en `frontend-plan §1`)
- [ ] Multi-tenant, multi-user (excluido en `db-plan §1`)
- [ ] Drag & drop para upload (excluido en `frontend-plan §6`)

---

## Open items heredados de `frontend-plan §7`

Marcar [x] cuando se cierren:

- [x] Paletas concretas de los 2 temas (resuelto 2026-09-24, `docs/design/themes.md`)
- [x] Tipografía stack (resuelto 2026-09-24)
- [x] Componente Avatar (resuelto 2026-09-24 vía D24)
- [ ] Calendar view en v1 o no — default NO (D13). Confirmar antes de cerrar v1.
- [ ] Mensaje del `key fingerprint`: siempre visible o bajo "Show details" — default visible.

---

## Sugerencia de PRs (de `frontend-plan §10.5`)

Orden recomendado si vas a tirar todo a la vez:

1. **PR-A infra (backend)** — sin tocar serializers existentes:
   - `accounts.User` campos nuevos (`preferred_lang`, `preferred_theme`, `timezone`, `avatar`) + migración `0003`
   - `Person.profile_photo` + migración `0003_person_profile_photo`
   - Endpoints nuevos: `change-password`, `sessions`, `revoke-others`, `DELETE me`, `PATCH me`, `registration-status`
   - Endpoints `/me/*` (preferences, storage-usage, encryption-fingerprint, avatar)
   - Endpoints `/persons/{id}/profile-photo/`
   - Register-once (env `ALLOW_REGISTRATION`)

2. **PR-B frontend (cleanup)** — depende de PR-A:
   - Wirear endpoints nuevos a las tabs de Settings
   - Quitar `*_display` de serializers (PR-C chico o incluido acá)
   - Búsqueda global topbar wireada
   - i18n `en.json` paridad 1:1

3. **PR-C cleanup (backend + frontend juntos)**:
   - Remover `_display` de serializers
   - Front: dejar de leerlos
   - Remover `contacts/index.astro` (legacy redirect) o dejarlo — si deja de molestar no urge

4. **PR-D tests** — independiente, paralelizable:
   - pytest + DRF APIClient en backend
   - Vitest + @testing-library en frontend

---

## Cómo mantener este doc

- Tildar items a medida que se cierren (cambiar [ ]/[~] a [x] con fecha)
- Si aparece algo nuevo que **no** está en los planes, agregarlo con tag `[ad-hoc]` y abrir issue / PR para sumarlo al plan correspondiente
- Si un item del plan se descarta, moverlo a "v2 / fuera de scope" con la razón
