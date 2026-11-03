# Spec v4 — Idiomas reales, tema oscuro por defecto, bienvenida, Docker y logo

Fecha: 2026-11-02
Estilo: `docs/design/style-spec-v2.md` + `style-spec-v2.1.md`. Reglas comunes de
`spec-v3.md` (sin commits, sin reiniciar servidores ajenos, sin emojis, paridad i18n,
owner scoping, migraciones con nombre descriptivo).

Tres fases en paralelo, con archivos separados:
- **E** (idiomas, tema, bienvenida): frontend completo salvo lo listado en F y G, y
  `backend/accounts/`.
- **F** (Docker y cifrado): archivos Docker nuevos, `backend/crm_backend/`,
  `backend/crm/fields.py`, comandos de gestion nuevos, `.gitignore`, `.dockerignore`,
  `README.md`, `docs/ops/`.
- **G** (logo): solo `docs/brand/` y el scratchpad. La integracion del logo en la app es un
  paso posterior, despues de que el usuario elija concepto.

---

## Fase E — Idiomas, tema oscuro por defecto y bienvenida

### E1. Diagnostico actual (por que el ingles no funciona)
- SSR lee el idioma de la cookie `preferred_lang`, pero nadie la escribe.
- Las islas React leen `localStorage.preferred_lang` en el `useState` inicial: el HTML del
  servidor sale en un idioma y la isla hidrata en otro (texto mezclado y error de
  hidratacion).
- `GeneralTab` manda `preferred_lang` a `PATCH /api/auth/me/`, pero `User` no tiene ese
  campo: se ignora.
- `LangSwitcher` no esta montado en ninguna parte.
- Quedan textos fijos fuera de i18n (`aria-label="Close"` en `Modal.tsx` y
  `ToastContainer.tsx`, y otros a encontrar).
- Fechas: `utils/format.ts` recibe `lang` opcional; hay llamadas sin pasarlo.

### E2. Fuente unica de verdad del idioma
1. Backend: `User.preferred_lang` CharField(5) choices `es`/`en`, default `es`.
2. Cookie `preferred_lang` (path `/`, `SameSite=Lax`, 1 anio, no httpOnly). Es lo que lee
   el SSR.
3. Al hacer login (respuesta de `/api/auth/login/`) y en `GET /api/auth/me/`, el backend
   setea la cookie con el valor del usuario. El frontend tambien la escribe al cambiar
   idioma.
4. `Layout.astro` renderiza `<html lang={lang}>`. `useTranslation()` toma el valor inicial de
   `document.documentElement.lang` (en SSR, del prop/valor del servidor), nunca de
   localStorage. Asi SSR e hidratacion coinciden. Eliminar `localStorage.preferred_lang`
   como fuente (se puede leer una vez para migrar al usuario, luego borrar la clave).
5. Cambiar idioma: `PATCH /api/auth/me/ {preferred_lang}` + cookie +
   `location.reload()` (aceptable solo para idioma, porque cambia todo el SSR).
6. Montar el cambio de idioma en el topbar: boton compacto `ES | EN` (SegmentedControl
   chico) a la izquierda del avatar. Y en `/login/` y `/register/`, esquina superior
   derecha, cambiando solo la cookie.
7. Paginas sin sesion: idioma por cookie; si no hay cookie, por `Accept-Language` (`en*` ->
   `en`, resto `es`).

### E3. Barrido de textos
- Buscar en `frontend/src` toda cadena visible fuera de `t()`: texto JSX, `placeholder`,
  `title`, `aria-label`, `alt`, mensajes de `throw`/toast, opciones de `<select>`,
  `document.title`, textos en `.astro`. Moverlas a i18n.
- Todas las llamadas a `formatDate`, `formatDateTime`, `formatRelative`, `formatTime`
  reciben `lang`. `Intl` usa `es-CL` y `en-US`.
- Errores del backend que se muestran al usuario: si vienen en espanol fijo, mapear por
  codigo/campo a claves i18n en el frontend.
- Script de verificacion en el scratchpad que recorre `frontend/src` y lista literales
  sospechosos; debe quedar en 0 (con lista de excepciones justificadas: nombres propios,
  `America/Santiago`, formatos).
- Prueba en navegador: recorrer todas las paginas en `en` y en `es` y confirmar que no
  queda texto del otro idioma.

### E4. Tema oscuro por defecto
- `DEFAULT_THEME = "dark"` en `themes.ts`; `NoFOUC.astro` usa `dark` cuando no hay valor.
- Backend: `User.preferred_theme` (`dark`/`light`, default `dark`) y
  `User.preferred_accent` (hex `#rrggbb`, default `#db2777`, validado con regex).
- Cookies `preferred_theme` y `preferred_accent` (mismo criterio que idioma) para que el SSR
  pueda renderizar `<html data-theme=...>` y la variable de acento inline, y NoFOUC quede
  solo como respaldo. localStorage deja de ser la fuente.
- `ThemeSwitcher` y la seccion de acento en Ajustes guardan en backend + cookie y aplican al
  instante (sin recargar).
- Revisar en tema oscuro todas las paginas: contraste de texto `fg-muted`, bordes,
  badges de estado, tablero, calendario, modales, inputs, selects nativos
  (`color-scheme: dark`).

### E5. Bienvenida en el primer inicio de sesion
- Backend: `User.onboarding_completed` bool default False. `PATCH /api/auth/me/` lo
  acepta.
- Si un usuario logueado tiene `onboarding_completed=false`, cualquier pagina de la app
  redirige (SSR) a `/welcome/`. `/welcome/` redirige a `/dashboard/` si ya esta completo.
- `/welcome/` (layout de auth, centrado, `max-w-lg`): titulo "Personaliza tu espacio",
  tres pasos en una sola pantalla:
  1. Idioma: `ES` / `EN` (cambia el texto de la pagina al instante en cliente, sin recargar;
     `/welcome/` carga ambos diccionarios).
  2. Tema: dos tarjetas seleccionables "Oscuro" (preseleccionada) y "Claro", cada una con
     una mini vista previa (sidebar + card + boton) dibujada con los tokens del tema.
     Al elegir, se aplica a la pagina en vivo.
  3. Color de acento: las 8 muestras + color propio; se aplica en vivo.
  Boton primario "Empezar" (guarda todo con un PATCH, setea cookies, va a `/dashboard/`) y
  link "Omitir" (guarda solo `onboarding_completed=true` con los defaults).
- Accesible: radios reales (`role="radiogroup"`), foco visible, navegable con teclado.
- `seed_demo` deja al usuario demo con `onboarding_completed=false` para poder verlo.

### E6. Verificacion
`manage.py check`, `makemigrations --check`, tests de API en el scratchpad (cookies en login
y me, validacion de hex y choices, onboarding), `astro check`, paridad i18n, script de
literales en 0, y recorrido en navegador en `es` y `en`, oscuro y claro, incluyendo
`/welcome/`.

---

## Fase F — Docker y proteccion de datos

### F1. Archivos
- `backend/Dockerfile`: `python:3.12-slim` multi-stage; usuario no root (`app`, uid 10001);
  `pip install --no-cache-dir -r requirements.txt`; `collectstatic`; entrypoint que espera
  a Postgres, corre `migrate` y arranca `uvicorn crm_backend.asgi:application --host
  0.0.0.0 --port 8000 --workers 2 --proxy-headers` (sirve Django y `/mcp/`). Healthcheck a
  `/api/health/`.
- `frontend/Dockerfile`: `node:20-alpine` multi-stage con pnpm (corepack, version del
  `packageManager` o la del lockfile), `pnpm install --frozen-lockfile`, `pnpm build`,
  runtime solo con `dist/` y deps de produccion, `node dist/server/entry.mjs`, usuario no
  root, `HOST=0.0.0.0 PORT=4321`. `API_INTERNAL_URL=http://backend:8000`.
- `deploy/Caddyfile` + servicio `proxy` (`caddy:2-alpine`): unica entrada publica.
  `/api/*`, `/admin/*`, `/static/*`, `/media/*`, `/mcp*` -> `backend:8000`; todo lo demas
  -> `frontend:4321`. Headers de seguridad: `X-Content-Type-Options nosniff`,
  `X-Frame-Options DENY`, `Referrer-Policy strict-origin-when-cross-origin`,
  `Permissions-Policy` restrictiva, y `Strict-Transport-Security` solo si hay dominio con
  TLS. Variable `SITE_ADDRESS` (default `:80`; con un dominio real Caddy obtiene TLS
  automatico).
- `docker-compose.yml` ampliado (mantener el servicio `db`, el nombre `crm-db` y el volumen
  `crm_pgdata` para no perder los datos de desarrollo):
  - `db`: Postgres 16, `POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256`, sin puerto
    publicado por defecto. Para desarrollo local, publicar `127.0.0.1:5433:5432` (solo
    loopback, nunca `0.0.0.0`).
  - `backend`, `frontend`, `proxy` con `depends_on` + healthchecks, red interna, `restart:
    unless-stopped`. Solo `proxy` publica puerto: `127.0.0.1:${APP_PORT:-8080}:80`
    (cambiable a `0.0.0.0` documentado). No usar 8000, 4321, 8010, 4338.
  - Volumen `crm_media` para archivos subidos (montado solo en backend).
  - `env_file: .env.docker` (no commiteado). Commitear `.env.docker.example`.
  - El flujo actual de desarrollo (`docker compose up -d db` + runserver en 8010 +
    astro dev en 4338) debe seguir funcionando igual.
- `.dockerignore` en backend y frontend (`.venv`, `node_modules`, `media`, `.env*`, `dist`,
  `.astro`, `__pycache__`).
- `scripts/generate-secrets.py` (solo stdlib + cryptography opcional): genera
  `DJANGO_SECRET_KEY`, `FIELD_ENCRYPTION_KEY` (Fernet), `POSTGRES_PASSWORD` y escribe
  `.env.docker` si no existe (nunca sobreescribe; permisos restringidos cuando el SO lo
  permite).

### F2. Cifrado y proteccion
- `crm/fields.py`: soportar rotacion con `MultiFernet`. Nueva variable
  `FIELD_ENCRYPTION_KEYS` (lista separada por comas; la primera cifra, todas descifran).
  `FIELD_ENCRYPTION_KEY` sigue funcionando como lista de una. Aplica a campos y archivos.
- Comando `manage.py rotate_encryption_key`: recifra todos los campos `*_enc` y los
  archivos de `Attachment` con la clave primaria actual, por lotes, en transaccion por
  lote, con `--dry-run` y conteos.
- Comando `manage.py check_encryption`: verifica que hay clave, que la clave es valida, que
  una muestra de filas descifra, y que ningun campo `*_enc` guarda texto plano. Falla con
  codigo distinto de 0 si algo esta mal.
- Arranque: si `DEBUG=False` y falta clave o `SECRET_KEY`, o `SECRET_KEY` es el valor de
  ejemplo, el proceso no arranca (ImproperlyConfigured).
- `settings.py` en modo produccion (por env): `DEBUG=False`, `ALLOWED_HOSTS`,
  `CSRF_TRUSTED_ORIGINS`, `SECURE_PROXY_SSL_HEADER`, `SESSION_COOKIE_SECURE` y
  `CSRF_COOKIE_SECURE` controlados por `USE_HTTPS`, `SESSION_COOKIE_HTTPONLY=True`,
  `SECURE_CONTENT_TYPE_NOSNIFF`, `X_FRAME_OPTIONS="DENY"`, `SESSION_COOKIE_AGE`
  configurable, `DATA_UPLOAD_MAX_MEMORY_SIZE` acorde a adjuntos, logging a stdout sin datos
  sensibles. `CONN_MAX_AGE` razonable.
- `/media/` deja de ser publico: vista protegida en Django que exige sesion y solo entrega
  archivos del propio usuario (`sidebar_icons/user_<id>`, `avatars/user_<id>`,
  `org_logos/org_<id>` si la org es del usuario). Los adjuntos cifrados siguen saliendo solo
  por `/api/attachments/{id}/download|thumb/`. Funciona igual en dev (runserver) y en
  Docker. Headers `Cache-Control: private`.
- Login: limitar intentos (por IP + email, 5 por 15 minutos, con cache de Django) y
  responder 429.
- Backups: `docs/ops/backup.md` con `pg_dump` desde el contenedor y la advertencia de que
  sin `FIELD_ENCRYPTION_KEYS` el backup es ilegible (guardar la clave aparte).

### F3. Repo
- `.gitignore`: el patron `lib/` ignora `frontend/src/lib/`. Cambiar a `/backend/lib/` (o
  agregar `!frontend/src/lib/`) y dejar `frontend/src/lib/` listo para commitear (no
  commitear; solo que `git status` lo muestre).
- Borrar archivos basura trackeados: `-w`, `.tmp-tc.err.deleted3`, `.tmp-tc.log.deleted3`,
  `frontend/.test-media-was-here.ts` (`git rm`, sin commitear).
- `README.md`: seccion "Docker" (generar secretos, `docker compose up -d --build`, abrir
  `http://127.0.0.1:8080`, crear usuario, backups, rotar clave, MCP por HTTP en `/mcp/`).

### F4. Verificacion
- `docker compose config` valido.
- Construir las imagenes y levantar el stack completo en un proyecto compose separado para
  no tocar el de desarrollo: `docker compose -p crm-test --env-file <scratchpad>/.env.test
  up -d --build` con `APP_PORT` libre (por ejemplo 8090) y la DB SIN puerto publicado y con
  volumen propio del proyecto `crm-test`. Probar: health, registro/login, crear persona,
  nota cifrada (verificar en la DB que la columna esta cifrada), subir adjunto, `/media/`
  ajeno da 403/404, `/mcp/` responde 401 sin token, headers de seguridad presentes.
  Luego `docker compose -p crm-test down -v` y borrar las imagenes de prueba si se crearon
  con tag propio. No tocar el contenedor `crm-db` de desarrollo ni su volumen.
- Tests: `manage.py test` completo pasa; tests nuevos para `MultiFernet`/rotacion,
  `check_encryption`, media protegida y limite de login.

---

## Fase G — Logo (skill logo-design)

- Clonar `https://github.com/kaankiziltug/logo-design-skill` en un directorio nuevo y vacio
  del scratchpad. Leer `skills/logo-design/SKILL.md` y sus `references/` y seguir su
  proceso. Antes de ejecutar cualquier script, leer su codigo. Ejecutar con
  `python -I` desde fuera del directorio del repo pasando rutas como argumentos. No instalar
  nada.
- Brief (supuestos; el usuario los puede corregir):
  - Nombre: "Simple CRM" (la app permite renombrarla, el simbolo debe funcionar solo).
  - Que es: gestor personal de relaciones: personas, cumpleanos, recordatorios, reuniones,
    instituciones, con datos cifrados y agentes de IA opcionales.
  - Audiencia: personas que quieren cuidar sus relaciones personales y profesionales.
  - Adjetivos: cercano, ordenado, confiable, sereno, privado.
  - Evitar: clichés de CRM y contactos (silueta de persona, libreta, burbuja de chat,
    apreton de manos, candado literal), estilo generico de IA, gradientes.
  - Debe funcionar: favicon 16 px, sidebar 24 px, icono de app, tema oscuro y claro,
    un solo color.
  - Color: el simbolo se usa en un solo color que hereda el acento de la app
    (`currentColor`); color de presentacion: rosa `#db2777` sobre `#0b0b0e` y sobre
    blanco.
- Entregable de esta fase (checkpoint de la skill): 3 conceptos distintos, en negro, con
  simbolo y lockup horizontal, auditados con `svg_audit.py`, y una hoja de conceptos en
  escala de grises (`concept_sheet.py`) en `docs/brand/concepts/` (SVG + PNG). Una linea
  por concepto con la idea y una recomendacion. Detenerse ahi: el kit completo se hace
  solo despues de que el usuario elija.
