# Spec v3 — Fixes, tablero de recordatorios, instituciones, perfil y MCP

Fecha: 2026-11-02
Estado: aprobado para implementar por fases. Estilo: aplica `docs/design/style-spec-v2.md`
y `style-spec-v2.1.md` (escala tipografica, controles, color, patrones). Cada fase la
implementa un agente distinto; las fases B, C y D son secuenciales porque comparten
migraciones e i18n.

## Reglas comunes a todas las fases

- Rama `feat/modern-crm-style`. No commitear, no stash, no cambiar de rama.
- No detener ni reiniciar procesos ni servidores. Corren: backend en 8010 (sin autoreload:
  despues de cambios de backend, avisar en el reporte que hay que reiniciarlo; no
  reiniciarlo), frontend en 4338 con recarga en caliente, Postgres en 5433. No tocar 8000
  ni 4321.
- No tocar `.gitignore`. No crear archivos nuevos en
  `frontend/src/lib/` (esta fuera de git); usar `frontend/src/utils/` o `components/`.
- Sin emojis. Comentarios en espanol como el resto del codigo. i18n: toda cadena visible en
  `es.json` y `en.json` con paridad de claves.
- Migraciones: `manage.py makemigrations` con nombre descriptivo, y `manage.py migrate`
  contra la DB de desarrollo (5433) estan permitidos. Nunca borrar datos existentes.
- Backend: owner scoping en todo queryset nuevo (como `PersonViewSet`). Validar en
  serializers. Campos de texto libre sensibles con `EncryptedTextField`.
- Verificacion minima de cada fase: `manage.py check`, `makemigrations --check` sin cambios
  pendientes al final, `astro check` 0 errores, paridad i18n, y una prueba manual con el
  panel del navegador en `http://localhost:4338` (sesion demo iniciada; no cerrar sesion).
  Si la fase cambia backend, la prueba en navegador queda para despues del reinicio y se
  verifica la API con el test client de Django (`manage.py shell -c` o un script en el
  scratchpad, no en el repo).

---

## Fase A — Arreglos rapidos (solo frontend)

Archivos permitidos: `components/persons/PersonsListView.tsx`,
`components/persons/PersonCard.tsx`, `components/dashboard/*`,
`components/settings/SettingsView.tsx`, `pages/settings/index.astro`.

A1. "Marcar contactada" no debe recargar ni mostrar skeleton.
- Hoy `PersonsListView` llama `refetch()` despues del POST, y el estado de carga reemplaza
  la grilla (salto visual). Tambien revisar el flujo del dashboard (`QuickLogModal`,
  `DashboardView`, cards de persona).
- Nuevo comportamiento: actualizacion optimista local. Al hacer click, poner en esa sola
  persona `last_contacted_at = ahora` y recalcular `cadence_status` en cliente (misma regla
  que `Person.cadence_status` en `backend/crm/models.py`: overdue / due_soon a 3 dias /
  ok / unknown / no_cadence). Luego POST. Si falla, revertir esa persona y mostrar toast de
  error. Si funciona, opcionalmente `GET /api/persons/{id}/` y reemplazar solo ese item.
- Nunca llamar `refetch()` de la lista completa ni activar `loading` por esta accion.
  El boton de esa tarjeta muestra estado ocupado (deshabilitado + spinner `size-4`) solo
  mientras dura la peticion.
- El dashboard: mismo criterio; reemplazar solo los datos de esa persona en el estado.

A2. Ajustes centrado.
- Hoy el titulo y las tabs ocupan todo el ancho de `max-w-6xl` y la card es `max-w-2xl`
  alineada a la izquierda, por eso se ve torcido.
- Envolver toda la pagina de Ajustes (titulo, tabs y card) en
  `mx-auto w-full max-w-3xl`. La card ocupa el 100% de ese contenedor (quitar
  `max-w-2xl`). Las tabs quedan alineadas con el borde de la card.

---

## Fase B — Recordatorios tipo tablero, reuniones e instituciones

### B1. Modelo `Reminder` (backend)

Agregar a `crm.Reminder`:
- `status = CharField(max_length=12, choices=[("todo","Pendiente"),("in_progress","En curso"),("done","Hecho")], default="todo", db_index=True)`.
- `kind = CharField(max_length=12, choices=[("task","Tarea"),("call","Llamada"),("meeting","Reunion"),("birthday","Cumpleanos"),("other","Otro")], default="task")`.
- `location = CharField(max_length=200, blank=True, default="")` (para reuniones).
- `participants = ManyToManyField(Person, blank=True, related_name="meeting_reminders")`
  (personas extra ademas de `person`; owner validado en el serializer).
- Migracion de datos: `completed=True` pasa a `status="done"`; el resto `todo`.
- Sincronia: `status == "done"` si y solo si `completed == True`. Implementar en
  `Reminder.save()` (si cambia `status` se ajusta `completed` y al reves, priorizando el
  campo que vino en el update). La accion `POST /complete/` sigue igual y deja
  `status="done"`. El signal existente que reacciona a `completed` no se toca.
- Serializer: expone `status`, `kind`, `location`, `participants` (ids, escritura) y
  `participants_detail` (id, display_name, solo lectura). Filtros nuevos en el queryset:
  `?status=`, `?kind=`.
- Indice nuevo `(owner, status, remind_at)`.

### B2. Tablero (frontend)

- En `/reminders/`, en la cabecera de la pagina, un `SegmentedControl` "Lista | Tablero"
  (iconos `List` y `Columns3`), recordado en localStorage `reminders_view` (con try/catch).
- Vista Tablero: tres columnas "Pendiente", "En curso", "Hecho", cada una
  `rounded-lg bg-secondary p-2`, titulo `text-sm font-semibold` + conteo
  `text-xs text-fg-muted tabular-nums`.
- Tarjetas: `neo-card px-3 py-2.5` (unica excepcion permitida a la regla de padding de
  v2.1). Contenido: titulo `text-sm font-medium`; linea meta `text-xs text-fg-muted` con
  icono de tipo `size-3.5` (`CheckSquare` tarea, `Phone` llamada, `Users` reunion, `Cake`
  cumpleanos, `Circle` otro), fecha relativa y lugar si es reunion; persona y participantes
  con `Avatar` tamano `size-6` (agregar ese tamano al componente si no existe), maximo 3
  avatares superpuestos y "+N".
- Mover: drag and drop nativo HTML5 (sin dependencias). Al soltar: actualizacion optimista,
  luego `PATCH /api/reminders/{id}/ {status}`; si va a "Hecho" usar `POST /complete/`; si
  sale de "Hecho" enviar `PATCH {status, completed:false}`. Si falla, revertir y toast.
- Accesibilidad: cada tarjeta tiene un `.btn-icon` `MoreHorizontal` con menu "Mover a ..."
  con las otras dos columnas. Columna destino resaltada durante el arrastre con
  `ring-2 ring-ring`.
- El filtro por persona aplica a ambas vistas. "Hecho" muestra los ultimos 20 completados.
- Movil: columnas en fila con scroll horizontal y `snap-x`; cada columna `min-w-72`.
  Desde `md`: grilla de 3 columnas iguales.
- Formulario de recordatorio: agregar selector de tipo, y si tipo = reunion, campo lugar y
  selector multiple de participantes. Vista lista: mostrar icono de tipo y lugar en meta.

### B3. Instituciones (backend)

Nuevos modelos en `crm/models.py`:

`Organization`
- `owner` FK user CASCADE, `name` CharField(150), `kind` CharField(20) choices
  `university, school, company, government, health, community, other` (default `other`).
- `logo` ImageField `upload_to` estable `org_logos/org_<id>.<ext>` (mismo patron que
  `sidebar_icon`, validar png/jpg/jpeg/webp, max 1 MB; al reemplazar borrar el anterior).
- `address` CharField(255), `city` CharField(100), `country` CharField(100),
  `latitude`/`longitude` DecimalField(9,6) null.
- `phone` CharField(50), `email` EmailField, `website` URLField — todos blank.
- `notes_enc` EncryptedTextField blank.
- `tags` M2M `Tag` blank.
- `attachments` GenericRelation a `Attachment` (fotos y documentos, mismo patron que Person).
- `created_at`, `updated_at`. Unique (owner, name). Orden por name.

`PersonOrganization`
- `person` FK CASCADE (related_name `memberships`), `organization` FK CASCADE
  (related_name `memberships`), `role` CharField(120) blank (ej. "Estudiante", "Profesor"),
  `is_current` bool default True, `start_year`/`end_year` PositiveSmallInteger null.
- Unique (person, organization, role).

API:
- `GET/POST /api/organizations/`, `GET/PATCH/DELETE /api/organizations/{id}/`
  (PATCH multipart para logo; `logo=null` lo borra). Filtros `?search=` (name, city),
  `?kind=`, `?tag=`. Lista con `member_count` anotado.
- `GET/POST /api/organizations/{id}/members/`, `PATCH/DELETE
  /api/organizations/{id}/members/{membership_id}/`. POST con `person_id`, `role`,
  `is_current`, years. Validar que la persona sea del mismo owner.
- `PersonSerializer` agrega `organizations` de solo lectura:
  `[{membership_id, organization_id, name, kind, role, is_current}]`.
- Adjuntos: permitir `subject_type=crm.organization` en `crm_attachment` (revisar la
  validacion de subject types y el chequeo de ownership del objeto).
- Admin registrado para ambos modelos.

### B4. Instituciones (frontend)

- Nav: item "Instituciones" (icono `Building2`) justo despues de "Personas".
- `/organizations/`: cabecera con conteo y boton "Nueva institucion"; barra de filtros
  (busqueda, tipo); grilla de cards: logo (`size-10 rounded-md object-cover`) o iniciales
  con `Avatar` cuadrado (`rounded-md`), nombre, tipo, ciudad, "N personas".
- `/organizations/new/` y modal de edicion: nombre, tipo, logo con preview previo a guardar
  (`URL.createObjectURL`, liberar con `revokeObjectURL`), direccion, ciudad, pais, telefono,
  email, sitio web, notas, tags.
- `/organizations/[id]/`: cabecera (logo `size-16 rounded-lg`, nombre `text-xl`, tipo y
  ciudad en meta; acciones Editar y menu Mas con Eliminar via dialogo de confirmacion).
  Tabs:
  1. Informacion: direccion con link "Abrir en mapa"
     (`https://www.google.com/maps/search/?api=1&query=<direccion codificada>`,
     `target="_blank" rel="noopener noreferrer"`), telefono (`tel:`), email (`mailto:`),
     sitio web, notas, tags. Campos vacios no se muestran.
  2. Personas: lista dividida con `Avatar`, nombre (link a la persona), rol, actual/pasado;
     boton "Agregar persona" con selector de persona + rol; acciones de fila editar/borrar.
  3. Fotos y archivos: reutilizar el patron de `AttachmentsTab` con
     `subject_type=organization` (grilla de imagenes con thumbnails + lista de documentos).
- Detalle de persona: en la linea meta de la cabecera mostrar la institucion actual
  principal ("Estudiante · Universidad de Chile"); en la tab Contacto, seccion
  "Instituciones" con las membresias y "Agregar a institucion".
- Busqueda del topbar: no es parte de esta fase.
- Los tags siguen siendo etiquetas simples (sin imagenes ni direccion); la informacion de
  lugares vive en Instituciones.

---

## Fase C — Marca de la app y foto de usuario

### C1. Backend
- `accounts.User.avatar` ImageField `upload_to` `avatars/user_<id>.<ext>`, png/jpg/jpeg/webp,
  max 2 MB; al reemplazar borrar el anterior; `avatar=null` lo borra. Mismo patron que
  `sidebar_icon` en `accounts/serializers.py`.
- Exponer `avatar` en `MeSerializer` y aceptar en `PATCH /api/auth/me/` (multipart).

### C2. Frontend
- Ajustes > General: mover la seccion de marca ("Nombre de la app" + "Icono") al primer
  lugar, con titulo "Marca". Preview en vivo: al escribir el nombre o elegir icono, una
  mini vista del encabezado del sidebar (icono `size-6 rounded-md` + nombre
  `text-sm font-semibold`) se actualiza antes de guardar. Guardar sin `location.reload()`:
  actualizar el sidebar en el DOM (evento `crm:branding-updated` que escucha `SideNav`, o
  equivalente) y `document.title`.
- `<title>` de todas las paginas: `<Pagina> · <sidebar_name o "Simple CRM">`. Resolver en
  `AppShell.astro` con el `user` que ya recibe.
- Ajustes > Cuenta: seccion "Foto de perfil": `Avatar size-16` actual; boton "Cambiar
  foto" abre selector de archivo; al elegir, preview inmediato en el circulo (sin subir);
  aparecen "Guardar" y "Cancelar"; "Quitar foto" si existe. Validar tipo y tamano en
  cliente con mensaje claro. Al guardar, actualizar el `Avatar` del topbar sin recargar
  (mismo patron de evento, `crm:user-updated`).
- `Avatar`: si recibe `src`, muestra la imagen `object-cover rounded-full`; si la imagen
  falla, cae a iniciales.

---

## Fase D — MCP para agentes de IA

Implementa la seccion 4 de `docs/architecture/plan-v2.md` con estas decisiones cerradas:

D1. Dependencia: agregar `mcp` (SDK oficial de Python) a `backend/requirements.txt` con
version fijada (ultima 1.x o 2.x compatible con Python 3.10 que se pueda instalar en
`backend/.venv`). Unica dependencia nueva permitida.

D2. Capa de servicios: `backend/crm/services.py` con funciones puras de dominio que reciben
`user` y datos validados: buscar/obtener/crear/actualizar persona (con chequeo de
duplicados por nombre), agregar contacto, agregar cumpleanos/fecha, crear/completar/mover
recordatorio (incluye reuniones con lugar y participantes), registrar interaccion, agregar
nota, etiquetar, crear/buscar institucion y agregar persona a institucion, listar proximos
y contactos vencidos. Las vistas REST existentes no se reescriben en esta fase; MCP usa
los servicios, y los servicios reutilizan serializers para validar.

D3. Modelos nuevos (app nueva `crm_mcp`):
- `ApiToken`: owner, name, `token_hash` (sha256 del token), `prefix` (8 chars visibles),
  scopes (JSONField lista: `read`, `write`), created_at, last_used_at, expires_at null,
  revoked_at null. Token generado con `secrets.token_urlsafe(32)` y prefijo `crm_`;
  se muestra una sola vez.
- `AgentAction`: owner, token FK SET_NULL, tool_name, arguments (JSON, con campos de texto
  largo truncados a 200 chars), status (`ok`/`error`), target_type, target_id null,
  error_message, created_at. Indice (owner, -created_at).
- `accounts.User.mcp_enabled` bool default False (migracion en accounts).
- Campo `created_via` CharField(10) choices `ui`/`mcp`/`import` default `ui` en Person,
  Reminder, ImportantDate, Note, Interaction, Organization.

D4. Servidor MCP:
- `crm_mcp/server.py` con el SDK (FastMCP o equivalente) registrando tools, resources y
  prompt de la seccion 4.3 de plan-v2, mas: `search_organizations`, `create_organization`,
  `add_person_to_organization`, `move_reminder(reminder_id, status)`.
  `schedule_meeting` crea un Reminder `kind=meeting` con `location`, `person` = primer
  participante y `participants` = el resto.
- Sin tools de borrado.
- Transporte stdio: `manage.py mcp_serve --token <token>` (resuelve el usuario por token).
- Transporte HTTP: endpoint `/mcp/` (Streamable HTTP) montado en ASGI
  (`crm_backend/asgi.py`), auth `Authorization: Bearer <token>`. Rechazar si el usuario
  tiene `mcp_enabled=False`, token revocado o vencido. Scope `write` requerido para tools
  de escritura. Limite 60 llamadas/min por token (cache de Django). Documentar como
  correrlo con `uvicorn` o `daphne` si hace falta (agregar el servidor ASGI a requirements
  solo si es imprescindible y decirlo en el reporte).
- Cada tool de escritura registra `AgentAction` y marca `created_via="mcp"`.
- Fechas sin zona: zona del usuario (si no existe campo, `settings.TIME_ZONE`).
- Duplicados: `create_person` devuelve candidatos si hay coincidencia por nombre y solo
  crea con `force=true`.

D5. API REST para la UI:
- `GET/POST /api/mcp/tokens/` (POST devuelve el token completo una sola vez),
  `POST /api/mcp/tokens/{id}/revoke/`, `PATCH /api/auth/me/` acepta `mcp_enabled`.
- `GET /api/mcp/actions/?limit=&tool=` y `POST /api/mcp/actions/{id}/undo/` que deshace
  creaciones (borra el objeto creado si sigue existiendo y es del owner). Solo creaciones.

D6. Frontend:
- Ajustes: nueva tab "Integraciones": interruptor "Permitir acceso de agentes de IA (MCP)",
  lista de tokens (nombre, prefijo, scopes, ultimo uso, revocar), crear token (nombre +
  scopes) con dialogo que muestra el token una vez con boton copiar, y bloque de
  configuracion lista para copiar para Claude Desktop (stdio, con la ruta real del
  proyecto y el comando `mcp_serve`) y para clientes HTTP (`http://127.0.0.1:8010/mcp/`).
- Pagina `/activity/` (item de nav "Actividad de IA", icono `Bot`, visible solo si
  `mcp_enabled`): lista dividida de `AgentAction` con herramienta, objeto (link), estado,
  fecha relativa, y boton deshacer en creaciones.
- Marca discreta "IA" (`text-xs text-fg-muted` con icono `Bot size-3.5`) en cards y
  detalle de objetos con `created_via="mcp"`.

D7. Pruebas:
- `backend/crm_mcp/tests.py` con `django.test.TestCase`: token valido/revocado/sin scope,
  `mcp_enabled=False` rechaza, cada tool de escritura crea objeto + AgentAction,
  `create_person` con duplicado devuelve candidatos, undo borra la creacion, owner
  scoping (un token de otro usuario no ve datos ajenos). Correr con `manage.py test
  crm_mcp`.
- Prueba de humo stdio: script en el scratchpad que lanza `mcp_serve` con un token de
  prueba usando el cliente del SDK, lista tools y crea una persona de prueba, y luego la
  borra via undo.
- Documentar en `docs/architecture/mcp.md`: como activar, crear token, configurar Claude
  Desktop (stdio) y un cliente HTTP, lista de tools con argumentos.
