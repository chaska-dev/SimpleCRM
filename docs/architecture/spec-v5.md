# Spec v5 — Registro inicial, dashboard, logo unico y README

Fecha: 2026-11-02
Aplican: style-spec v2 + v2.1, reglas comunes de spec-v3, i18n/tema de spec-v4.

## H1. Registro de la primera cuenta y bienvenida

Hoy `/register/` siempre muestra "registro cerrado" porque falta
`GET /api/auth/registration-status/`, y `POST /api/auth/register/` esta abierto a cualquiera.

- Backend (`accounts`):
  - `GET /api/auth/registration-status/` publico: `{can_register, users_count}`.
    `can_register = users_count == 0 or settings.ALLOW_REGISTRATION` (env
    `ALLOW_REGISTRATION`, default False; leerlo en `accounts` con `getattr(settings, ...)`
    o `os.environ`, sin editar `crm_backend/settings.py`).
  - `POST /api/auth/register/` responde 403 con mensaje claro si `can_register` es falso.
    Validar password con `AUTH_PASSWORD_VALIDATORS`. El usuario nuevo queda con
    `onboarding_completed=False`, idioma inicial = cookie/Accept-Language de la peticion,
    tema `dark`, acento `#db2777`. Login automatico + cookies de preferencias.
  - Tests en `accounts/tests.py`: sin usuarios permite, con usuarios rechaza, con
    `ALLOW_REGISTRATION` permite, onboarding queda en false.
- Frontend:
  - `/register/` con formulario real cuando `can_register`: nombre, email, contrasena,
    confirmar contrasena, con errores de campo via i18n. Logo arriba. Si no se puede
    registrar: mensaje actual + link a login.
  - `/login/`: el link "Crear cuenta" solo aparece si `can_register`.
  - Tras registrar: redirigir a `/welcome/` (idioma, tema, color). El flujo de bienvenida ya
    existe; verificar que funciona igual para una cuenta recien creada.

## H2. Dashboard

Layout desde `lg` (grilla de 3 columnas, `gap-6`):
- Fila 1: Calendario (`lg:col-span-2`) + "Pendientes" (1 columna, misma altura que el
  calendario, scroll interno si hace falta).
- Fila 2: "Favoritas", "Proximas fechas", "Sugerencias para contactar" (1 columna cada una).
- En `md`: 2 columnas; en movil: 1 columna, orden calendario, pendientes, favoritas,
  proximas fechas, sugerencias.
- Mantener la barra "Registrar interaccion..." arriba.

Tarjetas:
1. **Pendientes**: recordatorios con `status` `todo` o `in_progress`, ordenados por
   `remind_at`, vencidos primero (marca "Vencido" en `text-status-overdue-fg`), maximo 8,
   con check para completar (optimista, mismo patron que marcar contactada) y link
   "Ver todos" a `/reminders/`. Estado vacio con boton "Nuevo recordatorio".
2. **Favoritas**: como hoy (ya arreglado el corte de nombres).
3. **Proximas fechas**: cumpleanos y fechas importantes de los proximos 30 dias, con avatar,
   nombre, que es ("Cumple 27", titulo de la fecha) y "en N dias". Maximo 6.
4. **Sugerencias para contactar** (personas que NO estan en favoritas, sin duplicar las de
   otras tarjetas), en este orden de prioridad y con el motivo como texto meta:
   - cadencia vencida ("Vencido hace N dias"),
   - por vencer en 3 dias ("Toca contactar pronto"),
   - contactadas con frecuencia (3 o mas interacciones `counts_as_contact` en 90 dias)
     ("Hablas seguido"),
   - nunca contactadas con cadencia definida ("Aun no hay contacto").
   Maximo 6. Cada fila con accion "Marcar contactada" (optimista).
- Backend: ampliar `GET /api/dashboard/` con `pending_reminders`, `upcoming_dates_30d`
  (si `upcoming_important_dates` ya cubre 30 dias, reutilizarlo) y `suggestions`
  (`[{person, reason, days}]`), calculados en servidor con owner scoping y consultas
  acotadas (sin cargar todas las personas en memoria si hay muchas: usar anotaciones).
  Eliminar del payload los campos que nadie usa (`overdue`, `due_soon`, `never_contacted`
  vacios) solo si el frontend no los lee.
- Si el usuario no tiene datos: cada tarjeta con su estado vacio, nunca tarjetas rotas.

## H3. Logo unico

El usuario ve dos logos distintos: en login y bienvenida sale el simbolo completo (dos
anillos + nucleo) y en el sidebar el recorte chico (un anillo + nucleo). Decision: la app usa
SOLO el recorte chico (`symbol-small`) en todos los tamanos (sidebar, login, registro,
bienvenida, 404, preview de Marca) y el favicon ya es ese mismo. El simbolo completo queda
solo para documentacion y materiales grandes (README). `Logo.tsx` deja de cambiar de
forma segun el tamano. Actualizar `docs/brand/kit/guia-de-uso.md` con una linea: "En la
interfaz de la app se usa siempre el recorte chico."

## I. README.md para GitHub

Reescribir `README.md` (espanol, tuteo) pensado para GitHub:
- Cabecera centrada con el logo: `<picture>` con
  `docs/brand/kit/lockup-horizontal-white.svg` para `prefers-color-scheme: dark` y
  `lockup-horizontal-black.svg` para claro, ancho 360. Debajo una frase: que es Simple CRM.
- Badges simples en texto (sin servicios externos de badges): stack.
- Secciones:
  1. Que es y funcionalidades (personas, contactos, cumpleanos, recordatorios con tablero,
     reuniones, instituciones, notas y adjuntos cifrados, multi idioma es/en, tema oscuro y
     claro con color de acento, agentes de IA via MCP opcional).
  2. Requisitos (Docker Desktop o Docker Engine con Compose v2; para desarrollo: Python 3.10+,
     Node 20+, pnpm).
  3. Instalacion rapida con Docker: clonar, `python scripts/generate-secrets.py`,
     `docker compose --env-file .env.docker up -d --build`, abrir
     `http://127.0.0.1:8080`, crear la primera cuenta en `/register/` (el registro se cierra
     solo despues del primer usuario; `ALLOW_REGISTRATION=true` para abrirlo). Variables de
     `.env.docker` en tabla (nombre, para que, default) sin valores reales.
  4. Exponer en red o dominio con TLS (`SITE_ADDRESS`, `APP_PORT`, `USE_HTTPS`).
  5. Seguridad y cifrado: que se cifra, donde vive la clave, rotacion
     (`rotate_encryption_key`), verificacion (`check_encryption --full`), backups (link a
     `docs/ops/backup.md` y `docs/ops/encryption.md`), advertencia de guardar la clave.
  6. Agentes de IA (MCP): activar en Ajustes > Integraciones, token, config Claude Desktop
     (stdio) y HTTP `/mcp/`, link a `docs/architecture/mcp.md`.
  7. Desarrollo local (db en Docker 127.0.0.1:5433, backend runserver, frontend astro dev,
     `seed_demo` con usuario demo), tests (`manage.py test`, `astro check`).
  8. Actualizar, detener, borrar datos (`down` vs `down -v` con advertencia).
  9. Estructura del repo (arbol corto) y documentacion (links a docs/).
  10. Licencia: si no hay archivo LICENSE, poner "Pendiente de definir" (no inventar una).
- Todos los comandos verificados contra los archivos reales (compose, scripts, comandos de
  gestion). Sin emojis. Sin capturas por ahora.
