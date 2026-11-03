# Plan v2 — SimpleCRM

Fecha: 2026-11-01
Estado: borrador para aprobar. No hay codigo escrito todavia.
Stack confirmado: Django 5.2 + DRF (backend), Astro 5 + islas React 18 (frontend), Postgres 16.

Este documento cubre cuatro cosas:

1. Diagnostico de por que fallan paginas hoy.
2. Cambio de estilo a uno sencillo, sin emojis.
3. Resumen del estado actual de la base de datos y cambios propuestos.
4. Servidor MCP opcional para que agentes de IA agreguen personas, recordatorios,
   cumpleanos, reuniones, notas, etc.

Al final hay un orden de fases y un desglose de tareas pensado para repartir entre agentes.

---

## 1. Diagnostico: por que fallan paginas

Verificado el 2026-11-01. `manage.py check` sin errores, `makemigrations --check` sin
cambios pendientes, `astro check` con 0 errores en 78 archivos. El codigo compila; los
fallos vienen del entorno, de endpoints que faltan y de archivos fuera de git.

### 1.1 Entorno (bloquea todas las paginas)

| Problema | Evidencia | Efecto |
|---|---|---|
| Puerto 8000 ocupado por otro proyecto Django | pid 14840, Python310 global, `manage.py runserver 8000`. Responde con URLconf `django_crud_api.urls` y rutas `api/v1/` | Todo `/api/*` del CRM devuelve 404. `meSSR` devuelve null y cada pagina protegida redirige a `/login/`. El login tambien falla. |
| Puerto 4321 ocupado por otro proyecto Astro | pid 19288, `GitHub\Pokev2\web` astro dev | Abrir `http://127.0.0.1:4321` muestra Pokev2, no el CRM. El CRM arranca en otro puerto o falla. |
| Docker Desktop apagado | `docker compose ps` no conecta al daemon; Postgres en `localhost:5433` da timeout | Aunque Django del CRM arranque, cualquier consulta a la DB da error 500. |

Accion: detener los otros dos servidores (o mover el CRM a puertos propios, por ejemplo
8010 y 4330, y actualizar proxy de Vite y `PUBLIC_API_URL`), levantar Docker y
`docker compose up -d db`.

### 1.2 Repositorio (rompe cualquier clon nuevo)

- `.gitignore` raiz tiene `lib/` (plantilla Python). Eso ignora `frontend/src/lib/`, que
  contiene `api.ts`, `auth.ts`, `auth-server.ts`, `media.ts`, `toaster.ts`. Ninguno esta en
  git. Un clon limpio no compila y todas las paginas fallan.
  Accion: cambiar a `/backend/lib/` o agregar `!frontend/src/lib/` y commitear la carpeta.
- Archivos basura trackeados: `-w`, `.tmp-tc.err.deleted3`, `.tmp-tc.log.deleted3`,
  `frontend/.test-media-was-here.ts`. Borrar.
- Falta `frontend/.env` (hay fallback a `127.0.0.1:8000`, funciona pero conviene crearlo).

### 1.3 Endpoints que el frontend llama y el backend no tiene

| Llamada del frontend | Donde | Estado backend | Sintoma |
|---|---|---|---|
| `GET /api/auth/registration-status/` | `pages/register.astro` | No existe | Registro siempre muestra "cerrado". |
| `GET/PATCH /api/auth/me/preferences/` | `settings/DefaultsTab.tsx` | No existe | Pestana Defaults de Settings falla. |
| `GET /api/attachments/usage/` | `settings/StorageTab.tsx` | No existe | Pestana Storage falla. |
| `Person.profile_photo` + `POST/DELETE /api/persons/{id}/profile-photo/` | `PersonCard`, `ContactTab`, `ProfilePhoto` | Campo y endpoints no existen | Fotos de perfil nunca aparecen. |
| change-password, sessions, delete account | Settings > Account | No existen (ver `docs/TODO.md`) | Botones sin efecto o error. |

### 1.4 Detalles menores

- `pages/dashboard.astro` usa `http://127.0.0.1:8000` fijo en vez de `getApiBase()`. Si
  cambia el puerto, el dashboard SSR queda vacio.
- `PersonViewSet` filtra `cadence_status` cargando todo el queryset en memoria. Aceptable
  para uso personal, anotar para despues.

Pendiente de verificar: no se navego cada pagina en el navegador porque la DB esta caida.
Tras arreglar 1.1, hacer un recorrido completo (login, dashboard, persons, detalle con sus
6 pestanas, reminders, tags, favorites, settings con sus 5 pestanas).

---

## 2. Estilo sencillo, sin emojis

### 2.1 Estado actual

Tema neobrutalista: bordes de 3px negros, sombras duras sin blur, amarillo `#ffe500` y
naranja `#ff3800`, titulos en Archivo Black en mayusculas. Uso en `frontend/src`:

- `neo-card` 68 veces, `border-thick` 65, `shadow-neobrutal*` 30, `font-display` 67,
  `uppercase` 149.
- 90 emojis en 21 archivos. Los que mas tienen: `DatesTab.tsx`, `helpers.ts`,
  `PersonCreateForm.tsx` (10 cada uno), `AttachmentsTab.tsx` (8), `settings.py` (10, en
  comentarios). Tambien `ImportantDate.icon` tiene default con un emoji de calendario en el modelo.

La arquitectura de tokens es buena: `themes.ts` genera CSS vars en `global.css`. El cambio
se hace sobre todo en tokens y en unas pocas clases utilitarias.

### 2.2 Direccion propuesta

- Fondo blanco / gris muy claro, texto gris casi negro, un solo color de acento
  (azul o verde sobrio). Dark mode equivalente en grises.
- Bordes de 1px gris claro, radio 6-8px, sombra suave o ninguna.
- Una sola fuente (Inter). Titulos en tamano normal, sin mayusculas forzadas.
- Iconos con `lucide-react` (ya es dependencia) en lugar de emojis.
- Estados de cadencia como etiquetas pequenas con color tenue, no bloques saturados.

### 2.3 Como hacerlo sin reescribir todo

1. Redefinir tokens en `themes.ts` y `global.css` (colores, bordes, sombras, fuentes).
2. Redefinir las clases compuestas (`neo-card`, `border-thick`, `shadow-neobrutal*`,
   `font-display`) en `global.css` / `tailwind.config.mjs` para que apunten al estilo nuevo.
   Asi la mayoria de componentes cambia sin tocarlos.
3. Barrido de `uppercase` en titulos y botones.
4. Reemplazar emojis por iconos lucide. Crear un mapa unico `icon key -> componente`
   (por ejemplo `birthday -> Cake`, `meeting -> Users`, `call -> Phone`).
5. Backend: `ImportantDate.icon` pasa de emoji a clave de icono (`"calendar"`). Migracion
   de datos que convierte los emojis existentes a claves.
6. Actualizar `docs/design/themes.md` y reemplazar la imagen de paleta.

---

## 3. Base de datos

### 3.1 Estado actual (Postgres 16, 3 apps)

Todo esta aislado por usuario (`owner`). Campos `*_enc` cifrados con Fernet
(`crm/fields.py`), misma clave `FIELD_ENCRYPTION_KEY`.

| Tabla | Campos clave | Relaciones | Notas |
|---|---|---|---|
| `accounts.User` | email (login), sidebar_name, sidebar_icon | — | Faltan preferred_lang, preferred_theme, timezone, avatar. |
| `crm.Tag` | name, color | owner | Unico por (owner, name). |
| `crm.Person` | first/last/nick_name, company, role, how_we_met_enc, favorite, cadence_days, last_contacted_at | owner, M2M tags, attachments | Falta profile_photo. cadence_status es propiedad calculada. |
| `crm.ContactInfo` | type (12 opciones), value, label | person | Telefono, email, redes. |
| `crm.ImportantDate` | kind (birthday/custom), birth_year, title, description, icon, icon_image, date, recurrence (none/yearly) | person, attachment opcional | Cumpleanos y fechas propias. |
| `crm.Reminder` | title, remind_at, recur (none/yearly/monthly/weekly), lead_minutes, message_enc, completed | owner, person opcional | Solo se guarda; no hay envio de avisos. |
| `crm.Interaction` | kind (call, message, email, meeting_in_person, video_call, gift, note_shared, other), occurred_at, channel, body_enc, counts_as_contact | person | Eventos pasados. Signal actualiza last_contacted_at. |
| `crm.Note` | body_enc, category (general, followup, gift_idea, important) | person | |
| `crm_attachment.Attachment` | title, description, file (cifrado), mime_type, size_bytes | owner, GenericFK a cualquier modelo | |

Migraciones: accounts 0002, crm 0003, crm_attachment 0001. Sin drift.

### 3.2 Huecos frente a lo que se pide

- Reuniones futuras: hoy no hay modelo. Interaction es solo pasado y tiene una sola
  persona. Reminder tiene una sola persona y no tiene duracion ni lugar.
- No hay registro de acciones hechas por agentes.
- No hay tokens de acceso para integraciones.
- Los recordatorios no notifican.

### 3.3 Cambios propuestos

1. `User`: agregar preferred_lang, preferred_theme, timezone, `mcp_enabled` (bool,
   default false).
2. `Person.profile_photo`: OneToOne a Attachment, SET_NULL (ya estaba en db-plan D24).
3. `ImportantDate.icon`: clave de icono en vez de emoji (ver 2.3).
4. Nuevo `Event` (reuniones y citas futuras):
   owner, title, kind (meeting, call, video_call, social, other), starts_at, ends_at,
   location, description_enc, status (planned, done, cancelled), created_via (ui, mcp).
5. Nuevo `EventAttendee`: event, person. Permite varias personas por reunion.
6. `Reminder.event`: FK opcional a Event, para "avisame 1 hora antes de la reunion".
7. Al marcar un Event como `done`, se crea una Interaction por asistente (opcional,
   confirmado por el usuario) para alimentar la cadencia.
8. Nuevo `ApiToken` (para MCP): owner, name, token_hash, scopes (lista), created_at,
   last_used_at, expires_at, revoked_at. Solo se guarda el hash.
9. Nuevo `AgentAction` (auditoria): owner, token, tool_name, arguments_redacted (json),
   result_status, target_type, target_id, created_at. Sirve para ver y deshacer lo que hizo
   un agente.
10. Campo `created_via` (ui, mcp, import) en Person, Reminder, ImportantDate, Note,
    Interaction, Event. Permite filtrar "lo que agrego la IA".

Organization y PersonOrganization siguen en v3 (db-plan D4).

---

## 4. MCP para agentes de IA (opcional por usuario)

### 4.1 Objetivo

Que el usuario, si quiere, conecte un agente (Claude Desktop, Claude Code u otro cliente
MCP) a su CRM y le diga cosas como "agrega a Ana, cumple el 3 de mayo, la conoci en la
conferencia" o "recordame llamar a Pedro el viernes", y el agente cree los registros.

### 4.2 Decisiones

- Opt-in. Apagado por defecto. Se activa en Settings > Integraciones, que genera un token.
- Vive dentro del proyecto Django como app nueva `crm_mcp`, usando el SDK oficial `mcp`
  de Python. Accede al ORM directamente, asi el cifrado y la validacion son los mismos.
- Dos transportes:
  - Streamable HTTP en `/mcp/` (ASGI) para clientes remotos. Auth por header
    `Authorization: Bearer <token>`.
  - stdio via `manage.py mcp_serve --token <token>` para uso local con Claude Desktop.
- Capa de servicios compartida: mover la logica de negocio de `crm/views.py` a
  `crm/services.py`. REST y MCP llaman a las mismas funciones. Evita duplicar reglas
  (owner scoping, signals de cadencia, cifrado).
- Scopes por token: `read`, `write`, `delete`. Default al crear: `read` + `write`.
- Sin herramientas de borrado en la primera version. Borrar queda para la UI.
- Cada llamada de escritura se registra en `AgentAction`.
- Limite de tasa por token (por ejemplo 60 llamadas por minuto).

### 4.3 Herramientas (tools)

Lectura:
- `search_persons(query, tag?, favorite?)` — busca por nombre, apodo, empresa.
- `get_person(person_id)` — ficha con contactos, fechas, ultimas interacciones y notas.
- `list_upcoming(days=30)` — cumpleanos, fechas, recordatorios y reuniones proximas.
- `list_overdue_contacts()` — personas con cadencia vencida.
- `list_tags()`.

Escritura:
- `create_person(first_name, last_name?, nick_name?, company?, role?, how_we_met?, tags?)`
  Antes de crear, busca duplicados por nombre y devuelve candidatos si hay coincidencia;
  el agente debe confirmar con `force=true`.
- `update_person(person_id, campos...)`.
- `add_contact_info(person_id, type, value, label?)`.
- `add_birthday(person_id, month, day, year?)` — crea ImportantDate kind=birthday y,
  opcionalmente, un Reminder anual.
- `add_important_date(person_id, title, date, recurrence)`.
- `create_reminder(title, remind_at, person_id?, recur?, lead_minutes?, message?)`.
- `complete_reminder(reminder_id)`.
- `schedule_meeting(title, starts_at, ends_at?, person_ids, location?, remind_before_minutes?)`.
- `log_interaction(person_id, kind, occurred_at, body?, counts_as_contact)`.
- `add_note(person_id, body, category?)`.
- `tag_person(person_id, tag_names)` — crea tags que no existan.

Recursos (resources):
- `crm://person/{id}` — ficha en texto.
- `crm://upcoming` — agenda proxima.

Prompts:
- `weekly_review` — resumen de la semana: cumpleanos, contactos vencidos, reuniones.

### 4.4 Reglas de seguridad

- Las fechas sin zona se interpretan en `User.timezone`.
- Las respuestas de las tools no devuelven campos cifrados completos de otras personas
  salvo que se pidan por id (`get_person`).
- Texto que viene del agente se guarda como dato, nunca se ejecuta ni se interpreta.
- Token mostrado una sola vez al crearlo. Revocable desde la UI.
- La UI muestra un historial "Acciones de IA" con boton para deshacer creaciones.

### 4.5 Frontend para MCP

- Settings > Integraciones (isla React): activar MCP, crear/revocar tokens, elegir scopes,
  copiar configuracion lista para Claude Desktop.
- Pagina `/activity/`: lista de `AgentAction` con filtros y deshacer.
- Marca discreta "agregado por IA" en tarjetas con `created_via=mcp`.

---

## 5. Frontend (Astro + islas React)

Se mantiene la estructura actual: paginas `.astro` con SSR que validan sesion y cargan
datos, islas React con `client:load` para lo interactivo. Cambios:

- Nueva pagina `/calendar/` o ampliar dashboard con reuniones (Event).
- Formulario de reunion con selector multiple de personas.
- Settings > Integraciones y `/activity/` (seccion 4.5).
- Centralizar la URL del backend en `getApiBase()` (arreglar dashboard).
- Estilo nuevo (seccion 2).

---

## 6. Avisos de recordatorios (fase posterior)

Hoy los recordatorios no avisan. Opcion simple recomendada: comando
`manage.py send_due_reminders` ejecutado cada minuto por el programador del sistema o por
`django-q2`, que envia email (y luego web push). Avanza `remind_at` en los recurrentes.
No bloquea el MCP; se puede hacer despues.

---

## 7. Fases

| Fase | Contenido | Depende de |
|---|---|---|
| F0 | Arreglar entorno y repo (1.1, 1.2, 1.4). Recorrido manual de paginas. | — |
| F1 | Endpoints faltantes (1.3) + campos User y profile_photo. | F0 |
| F2 | Estilo sencillo y fuera emojis (seccion 2). | F0 |
| F3 | Capa `crm/services.py` y tests de servicios. | F0 |
| F4 | Modelos Event, EventAttendee, Reminder.event, created_via + API REST + UI. | F3 |
| F5 | ApiToken, AgentAction, app `crm_mcp` con tools, transportes HTTP y stdio. | F3, F4 |
| F6 | UI de Integraciones y Actividad. | F5 |
| F7 | Envio de avisos de recordatorios. | F4 |

F1, F2 y F3 pueden ir en paralelo despues de F0 (tocan archivos distintos: F1 backend
accounts/attachments, F2 frontend estilos, F3 backend crm).

## 8. Desglose para repartir entre agentes

- Agente backend A: F1 (accounts, crm_attachment, profile_photo).
- Agente frontend: F2 (tokens, clases, emojis a lucide) y despues F6.
- Agente backend B: F3, luego F4 (modelos y API de Event).
- Agente MCP: F5 (app `crm_mcp`, tools, auth por token, auditoria).
- Agente revisor/tests: smoke test ampliado (`backend/scripts/smoke_test.py`), tests de
  tools MCP con un cliente MCP de prueba, recorrido de paginas en navegador.

## 9. Preguntas abiertas

1. Color de acento para el estilo nuevo: azul, verde u otro.
2. MCP remoto (HTTP expuesto) o solo local (stdio) en la primera version.
3. Reuniones: modelo Event nuevo (propuesto) o extender Reminder.
4. Los avisos de recordatorios: email, web push o ambos.
5. Puertos: liberar 8000/4321 o mover el CRM a puertos propios.
