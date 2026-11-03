# Frontend Plan v1 — SimpleCRM (PRM)

**Estado:** Planeamiento cerrado — pendiente de aprobación para implementar.
**Stack frontend:** Astro 5 + React 18 (islas) + Tailwind v3.
**Backend compartido:** Django 5.2 + DRF + Postgres 16 (ver `db-plan-v1.md`).
**i18n:** 2 idiomas — `es` (Español general) + `en` (Inglés).
**Theming:** 2 temas intercambiables (paletas definidas en `../design/themes.md`).
**Routing:** Astro routes per página, React islands para interactividad.

> **Nota de scope:** este plan es funcional (qué hace cada página, qué datos
> muestra, qué endpoints consume). El estilo visual (brutalist, soft, glass,
> etc.) queda abierto y se aplica sobre esta capa de componentes. Cambiar
> el tema visual no requiere reescribir páginas.

> **Nota de proceso:** Josue aún no decidió el estilo visual final. Por
> eso las paletas concretas de los 2 temas viven en
> `docs/design/themes.md` como archivo separado. Cuando estén, este plan
> no cambia — solo se completan los valores en el archivo de diseño.

---

## 1. Goal

Tres problemas concretos del front:

1. **Operar el CRM:** ver personas, agregar contactos, registrar interacciones, marcar recordatorios como hechos.
2. **No perder la pista:** la app debe decirte "hoy vence Marce, hace 47 días que no hablás con ella, y el cumple de Cote es en 3 días" — visible de un vistazo.
3. **Memoria privada pero accesible:** notas cifradas, adjuntos cifrados (servidos vía `/api/attachments/{id}/download/`), pero el UX no debe revelar que está cifrado (es transparente).

Lo que **NO** entra en v1: PWA offline, notificaciones push, compartición con otras personas, OCR/transcripción, multi-user.

---

## 2. Decisiones locked-in

| # | Decisión | Razón |
|---|---|---|
| D1 | **Idiomas v1:** `es` (Español general) + `en` (Inglés) | Cobertura razonable sin sobre-traducir. Default: `es` (mercado principal) |
| D2 | **Theming:** 2 temas intercambiables: Neobrutalist **Light** + Neobrutalist **Dark**. Paletas concretas en `docs/design/themes.md` (con imagen canónica `palette-neobrutalist.png`) | Estilo neobrutalist: bordes duros, sombras sin blur, tipografía pesada (Inter + Archivo Black), acento amarillo. Inversion de border entre modos |
| D3 | **Backend enum keys en inglés**, front traduce via `frontend/src/i18n/{es,en}.json` | La info vive una sola manera (keys estables en DB). Traducir = agregar JSON, no tocar DB |
| D4 | **Routing:** Astro routes per página + React islands para interactividad | Mantiene el patrón del proyecto. SSR-friendly para futuras mejoras SEO |
| D5 | **Preferencias de UI** (lang, theme, timezone) **persistidas en localStorage** + opcionalmente sincronizadas a `User.preferred_lang/theme/timezone` (backend) | localStorage es instantáneo y zero-backend. Sync a backend es enhancement para v1.5 |
| D6 | **Layout común** (`AppShell` con `TopBar` + `SideNav` + `MainContent` + `ToastContainer`) para todas las páginas autenticadas | Consistencia + DRY. Login/Register/404 usan layouts dedicados |
| D7 | **Tailwind v3** con un set reducido de tokens semánticos (bg, surface, fg, accent, etc.) **mapeados 1-a-1 a las CSS variables del tema activo** | Permite que cambiar tema solo cambie variables CSS, no requiera recompilar Tailwind |
| D8 | **Backend enum `_display` fields removidos** del API; solo se envía el key (e.g. `kind: "call"`) | Front traduce. Elimina acoplamiento de idioma en backend |
| D9 | **2 vistas para `/persons`:** Grid (default) + List (toggle) | Grid para revisar de un vistazo; List para triage / bulk ops |
| D10 | **Tabs en el detalle de persona:** Contact / Interactions / Notes / Dates & Reminders / Adjuntos | Mantiene el detail limpio. Cada tab es casi-página |
| D11 | **Solo 1 instancia de dev de Django corriendo** + Vite proxy `/api/*` → `127.0.0.1:8000` | Es lo que ya existe; mantenemos |
| D12 | **Búsqueda global en topbar** busca en: nombre de persona, nick, tag, attachments (title/description) | Es la única "búsqueda" v1 — búsqueda full-text en notas cifradas es v2 |
| D13 | **Calendar** dedicado (`/calendar`) **NO incluido en v1** | Nice-to-have. Si entra, es vista FullCalendar / react-big-calendar con ImportantDates + upcoming reminders |
| D14 | **404 / error pages** dedicadas con link a Home | Para casos de persona borrada, link viejo, etc. |
| D15 | **Person.profile_photo** y **User.avatar** OneToOne al modelo `Attachment`. Permite reemplazar y mantener consistencia con el resto del sistema (cifrado + quota + MIME whitelist) | First-class "foto de perfil" para personas y para el usuario. Sin un campo ad-hoc ImageField: reusa todo lo que ya está cifrado |
| D16 | **Tipografía stack cerrada** — Archivo Black (display) + Inter (body) + JetBrains Mono (code). Detalles en `docs/design/themes.md` | Cambios de fuente pasan por editar un solo archivo; ningún componente se acopla a una familia específica |

---

## 3. Global architecture

### 3.1 Routing & rendering

```
frontend/src/pages/
├── index.astro                      # → redirect /dashboard/ si autenticado, /login si no
├── login.astro                      # pantalla completa sin shell
├── register.astro                   # pantalla completa sin shell
├── 404.astro
├── dashboard.astro                  # widgets: overdue, due_soon, upcoming birthdays, today's reminders
├── persons/
│   ├── index.astro                  # grid (default) — query ?view=list para list
│   ├── [id].astro                   # detalle de persona (5 tabs)
│   └── new.astro                    # crear persona (modal o página completa)
├── tags/
│   └── index.astro                  # tag manager
├── reminders/
│   └── index.astro                  # lista plana de reminders, filtros
└── settings/
    └── index.astro                  # tabs: General / Defaults / Storage / Encryption / Account
```

Cada página Astro es server-rendered o static. Islas React agregan interactividad donde hace falta (búsqueda, formularios, modales, calendar view).

### 3.2 i18n

**Estructura de archivos:**

```
frontend/src/i18n/
├── index.ts              # getTranslation(lang), useTranslation hook
├── es.json
└── en.json
```

**Shape de los JSON:**

```jsonc
{
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "edit": "Editar",
    "loading": "Cargando...",
    "no_results": "Sin resultados"
  },
  "person": {
    "title_singular": "Persona",
    "title_plural": "Personas",
    "fields": {
      "first_name": "Nombre",
      "last_name": "Apellido",
      "nick_name": "Apodo",
      "company": "Empresa",
      "role": "Rol",
      "how_we_met": "Cómo nos conocimos",
      "relationship_strength": "Cercanía",
      "cadence_days": "Cadencia (días)"
    }
  },
  "enums": {
    "person.kinds": {
      "birthday": "Cumpleaños",
      "custom":   "Personalizado"
    },
    "interaction.kinds": {
      "call": "Llamada",
      "message": "Mensaje",
      "email": "Email",
      "meeting_in_person": "Encuentro presencial",
      "video_call": "Videollamada",
      "gift": "Regalo",
      "note_shared": "Nota compartida",
      "other": "Otro"
    },
    "contact.types": {
      "personal_phone": "Celular personal",
      "personal_email": "Correo personal",
      "work_phone": "Celular trabajo",
      "work_email": "Correo trabajo",
      "whatsapp": "WhatsApp",
      "telegram": "Telegram",
      "instagram": "Instagram",
      "linkedin": "LinkedIn",
      "discord": "Discord",
      "other": "Otro"
    },
    "cadence_status": {
      "no_cadence": "Sin cadencia",
      "unknown":   "Nunca contactada",
      "ok":        "Al día",
      "due_soon":  "Por vencer",
      "overdue":   "Vencida"
    },
    "note.categories": {
      "general":   "General",
      "followup":  "Pendiente",
      "gift_idea": "Idea regalo",
      "important": "Importante"
    },
    "reminder.recurrence": {
      "none":    "Sin recurrencia",
      "yearly":  "Anual",
      "monthly": "Mensual",
      "weekly":  "Semanal"
    }
  },
  "messages": {
    "person_deleted": "Persona eliminada",
    "interaction_logged": "Interacción registrada",
    "reminder_completed": "Recordatorio completado",
    "attachment_encrypted_at_rest": "Archivo cifrado en disco"
  }
}
```

**Persistencia:**
- Default: `es`.
- Cambio: switcher en topbar (`<LangSwitcher />`).
- Persistido en `localStorage.preferred_lang`.
- Opcional sync a `User.preferred_lang` (backend) — agregado si se implementa más adelante.

**Backend API: cambios para D8**

Antes:
```json
{"kind": "call", "kind_display": "Llamada"}
```

Después:
```json
{"kind": "call"}
```

El `_display` se elimina. Front usa el key para indexar `i18n/enums.interaction.kinds[kind]`.

### 3.3 Theming

**Estructura:**

```
docs/design/themes.md              # ← fuente de verdad manual, editado por Josue
frontend/src/styles/
├── tokens.ts                      # shape TypeScript con valores default
├── themes.ts                      # mapea THEMES dict, sync desde themes.md
└── global.css                     # :root[data-theme="a"] { --color-bg: ...; }
```

**CSS approach:**

```css
:root[data-theme="light"] {
  --color-bg: #F5F0E8;
  --color-surface: #FFFFFF;
  --color-fg: #0A0A0A;
  --color-accent: #FF3800;
  /* ... */
}
:root[data-theme="dark"] {
  --color-bg: #0A0A0A;
  /* ... */
}

.bg { background-color: var(--color-bg); }
.fg { color: var(--color-fg); }
/* etc. — solo tokens semánticos, NO colores hardcoded */
```

**Tailwind config:**

```js
// tailwind.config.mjs
export default {
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        fg: 'var(--color-fg)',
        'fg-muted': 'var(--color-fg-muted)',
        accent: 'var(--color-accent)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        border: 'var(--color-border)',
      }
    }
  }
}
```

**Toggle:**

```tsx
const ThemeSwitcher = () => {
  const { theme, setTheme, label } = useTheme();
  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      {theme === 'light' ? 'Oscuro' : 'Claro'}
    </button>
  );
};
```

**Default:** `light`. Persistido en `localStorage.preferred_theme`.

**Tema IDs:** `light` y `dark`. Labels en UI según idioma:
- es: "Claro" / "Oscuro"
- en: "Light" / "Dark"

Paletas concretas en `docs/design/themes.md` (Neobrutalist Light + Neobrutalist Dark).

### 3.4 Backend API contract

| Endpoint | Cambio v1 |
|---|---|
| `GET /api/persons/` | sin cambios estructurales; remover `cadence_status_display` si existiera (computed in front via i18n map). Mantener `kind_display` para ContactInfo tipo? NO — eliminar `_display` también |
| `POST /api/persons/` | sin cambios |
| `GET /api/persons/{id}/` | acepta `?lang=es|en` como override; por defecto usa `Accept-Language` del request |
| `GET /api/dashboard/` | sin cambios — devuelve keys estables, front traduce |
| `GET /api/attachments/{id}/download/` | `Content-Type` y `Content-Disposition` se setean en backend con filenames en ASCII; si el front necesita Unicode fancy, aplica RFC 5987 (ya está hecho) |

**Validación:** backend ya devuelve keys estables (`kind: "call"`, `cadence_status: "overdue"`). Solo hace falta limpiar los `_display` redundantes.

### 3.5 Estado de la app

- **API data:** TanStack Query (React Query) por isla. Cache 60s; invalidación manual al mutar.
- **Preferencias de UI:** localStorage + Context API de React (theme, lang).
- **Cross-island state:** Zustand si hace falta (poco probable para v1).

### 3.6 Error & toast

- `ToastContainer` global. Tipos: success / error / warning / info.
- Errores de API → toast automático + log a consola (no detail al usuario más allá del mensaje corto del backend).
- Errores 401 → redirect a `/login`.

---

## 4. Page-by-page specs

### 4.1 `/login` y `/register`

- **URL:** `/login`, `/register`
- **Layout:** dedicated, sin shell (full-screen).
- **i18n:** sí — labels traducidos.
- **Theme:** sigue el tema actual.
- **Datos:** POST `/api/auth/login/`, `GET /api/auth/registration-status/`, POST `/api/auth/register/`.
- **Tras éxito:** redirect a `/dashboard`.
- **Register-once:**
  - Es CRM **personal**, un solo usuario. El registro solo aplica la primera vez.
  - Backend: `POST /api/auth/register/` rechaza con 403 si ya existe ≥1 usuario (env `ALLOW_REGISTRATION=true` para reabrir, default `false`).
  - Endpoint público `GET /api/auth/registration-status/` devuelve `{can_register: bool, users_count: int}`.
  - Front: `/login` muestra "Crear cuenta" solo si `can_register=true`. `/register` ocultado del nav si `false`. Al autenticar el primer usuario, mensaje de "Bienvenida, [name]".
- **Empty state:** N/A.
- **Edge cases:**
  - Credenciales inválidas → mensaje genérico traducido.
  - Email ya registrado → mensaje específico.
  - Network error → mensaje "intentá de nuevo".
  - Registro cerrado (ya hay usuario) → redirigir a `/login`.

### 4.2 `/dashboard` (home para autenticados)

- **URL:** `/dashboard`
- **Auth:** requerido.
- **Layout:** `AppShell` con sidebar. Header de bienvenida ("Hola, [first_name]").
- **Widgets (5 secciones):**
  1. **Vencidos** — persons con `cadence_status=overdue`, ordenadas por días vencidos desc. Click → persona.
  2. **Por vencer** — `cadence_status=due_soon`, ordenadas por días restantes asc.
  3. **Próximos eventos** — ImportantDates con `days_until_next <= 30`, ordenado asc. Muestra edad si es birthday.
  4. **Recordatorios pendientes** — Reminders con `completed=False` y `remind_at >= now`, ordenados asc, top 10.
  5. **Nunca contactadas** — persons con `cadence_status=unknown` (cadence set pero sin interacciones).
- **Empty state:** "Sin nada urgente. Cuando agregues personas y registres interacciones, esta pantalla te recordará qué sigue." + CTA "Agregar primera persona".
- **Acciones rápidas:** input "Llamar a alguien" → buscar persona → modal de "registrar interacción rápida".
- **Endpoints:** `GET /api/dashboard/`, `POST /api/persons/{id}/mark-contacted/`.

### 4.3 `/persons` (lista, default Grid)

- **URL:** `/persons` — Grid por default. `?view=list` para List.
- **Auth:** requerido.
- **Toggle de vista:** en top-right del listado. Icon button Grid | Icon button List. Persiste en localStorage (`persons_view`).
- **Layout:** `AppShell`. Header "Personas (count)". Toolbar con search + filtros + sort.
- **Search:** input top — busca por `first_name`, `last_name`, `nick_name`. Debounce 200ms.
- **Filtros:**
  - Por tag (dropdown con tags existentes).
  - Por cadence_status (multi-select: overdue / due_soon / unknown / ok / no_cadence).
  - Botón "limpiar filtros" cuando hay alguno activo.
- **Sort:** dropdown con: `name asc`, `last_contacted_at desc` (más olvidado primero), `relationship_strength desc`.
- **Grid view:**
  - Card per person.
  - Card content: avatar / initials fallback, name, nick, tags (chips), cadence status badge, relationship stars (1-5), "+N días" o "hace N días".
  - Hover: card eleva (shadow up) + muestra botones (call / email / mark contacted).
  - Click card → `/persons/{id}`.
- **List view:**
  - Table con columnas: avatar, name, tags, cadence_status, last_contacted, relationship.
  - Quick action per row: icon "mark contacted" / "edit" / "more".
- **CTA:** floating "+" button → `/persons/new`.
- **Empty state:**
  - Sin personas: ilustración + "Agregá tu primera persona" + botón.
  - Sin resultados de filtro: "Ninguna persona coincide con los filtros."
- **Endpoints:** `GET /api/persons/?search=&tag=&cadence_status=`, `GET /api/tags/`.

### 4.4 `/persons/{id}` (detalle)

- **URL:** `/persons/{id}`
- **Auth:** requerido. IsOwner scoping via backend (404 si no es owner).
- **Layout:** `AppShell`. Header con persona. Tabs debajo.
- **Header:**
  - **Profile photo** — imagen circular o cuadrada según tema (Neobrutalist dice cuadrada con borde). Fuente: `Person.profile_photo` (OneToOne a Attachment). Si no hay: placeholder con iniciales.
  - Name (first + last).
  - Nick (si está).
  - Tags chips.
  - Cadence badge (color según status: verde=ok, amarillo=due_soon, rojo=overdue, gris=unknown).
  - Relationship stars (editable on click).
  - Action buttons: "Marcar contactada hoy" (primary), "Editar" (secondary), "Más ⋮" (delete).
- **Tabs (5):**

#### Tab 1: Contacto
- Lista de ContactInfo (type | value | label | edit inline | delete).
- Botón "Agregar contacto".
- Campo "Cómo nos conocimos" (encriptado, decrypted on view — texto largo editable).
- **Foto de perfil:** display grande con botones "Cambiar foto" (file picker, abre picker, sube via `POST /api/me/avatar/`-equivalente para persona) y "Quitar foto". Storage: el attachment es OneToOne contra `Person`, cifrado en disco. Cambiarla = reemplazar (DELETE + POST).

#### Tab 2: Interacciones
- Timeline desc.
- Cada item: icono kind + fecha + canal + body (encriptado, decrypted on expand).
- "Contó como contacto" checkbox por interaction.
- Botón "Registrar interaction" (modal rápido).
- Filtro: por kind, por fecha.
- "+ Ver más" si hay >20.
- Cada interaction puede tener archivos adjuntos (Attachment vía GenericRelation).

#### Tab 3: Notas
- Lista de notes con category chip + body (encriptado, decrypted on expand).
- Filtro por category.
- Botón "Nueva nota" (modal con textarea + category selector).
- Notas pueden tener attachments.

#### Tab 4: Fechas & Recordatorios
- Sub-sección "Fechas importantes":
  - Cards list por ImportantDate con icon/photo, title, próxima ocurrencia, edad (si birthday).
  - Botón "Nueva fecha".
- Sub-sección "Recordatorios":
  - Lista plana, orden por remind_at asc. Muestra completed, persona relacionada.
  - Filtro: upcoming / completed / all.
  - Botón "Nuevo recordatorio" (modal).

#### Tab 5: Adjuntos
- Galería de archivos agrupados por entidad dueña:
  - Adjuntos de la persona misma (foto perfil, how_we_met img, etc.).
  - Adjuntos de notes.
  - Adjuntos de important dates (foto del casamiento, etc.).
  - Adjuntos de interactions.
- Tile por adjunto: preview (imagen thumbnail) o icono + nombre + tamaño. Click → modal con preview full + download.
- Botón "Subir adjunto" (modal con selector de subject_type = persona/nota/... o auto=persona).

- **Endpoints:**
  - `GET /api/persons/{id}/`
  - `GET /api/persons/{id}/contacts-info/`
  - `GET /api/persons/{id}/interactions/`
  - `GET /api/persons/{id}/notes/`
  - `GET /api/persons/{id}/important-dates/`
  - `GET /api/persons/{id}/important-dates/upcoming/?days=30`
  - `GET /api/reminders/?person_id={id}`
  - `GET /api/attachments/?subject_type=crm.person&subject_id={id}`
  - `POST /api/persons/{id}/mark-contacted/`
  - `DELETE /api/persons/{id}/` (with confirm modal)

### 4.5 `/persons/new`

- **URL:** `/persons/new`
- **Layout:** `AppShell` simple o modal full-page sobre `/persons` (decisión: modal full-page).
- **Form:**
  - First name (req), last name, nick name, company, role, relationship_strength, cadence_days, how_we_met (textarea).
  - Contact info: 10 inputs pre-rellenados con `CONTACT_TYPE_SUGGESTIONS` (vacíos). User completa/borra.
  - Tags: chip multi-select (create-on-the-fly si no existe).
- **Submit:** POST `/api/persons/` + POST `/api/persons/{new_id}/contacts-info/` por cada filled contact.
- **Tras éxito:** redirect a `/persons/{new_id}`.

### 4.6 `/tags`

- **URL:** `/tags`
- **Auth:** requerido.
- **Layout:** `AppShell`. Grid de cards.
- **Card per tag:** color preview grande, nombre, count "N personas".
- **Acciones:** click → edit (name + color picker inline), eliminar (confirm).
- **Botón:** "+ Nuevo tag".
- **Empty state:** "No tenés tags. Creá uno para empezar a organizar personas."
- **Endpoints:** `GET /api/tags/`, `POST /api/tags/`, `PATCH /api/tags/{id}/`, `DELETE /api/tags/{id}/`.

### 4.7 `/reminders` (lista plana)

- **URL:** `/reminders`
- **Auth:** requerido.
- **Layout:** `AppShell`. Lista.
- **Filtros tabs:** "Pendientes" / "Completados" / "Todos".
- **Filtros extra:** por person_id (dropdown), por recur.
- **Item:** título, fecha/hora, persona (avatar+name), recur badge.
- **Quick action:** tildar "completado" inline.
- **Empty state por tab:** mensaje específico.
- **Botón:** "+ Nuevo reminder" (modal).

### 4.8 `/settings`

- **URL:** `/settings`
- **Auth:** requerido.
- **Layout:** `AppShell` con **tabs internos** (no confundir con persona detail tabs).
- **Tabs internos:**

#### Settings · General
- **Idioma:** dropdown (es, en). Default es. Persiste localStorage + (opcional) backend.
- **Tema:** "Claro" vs "Oscuro" con preview mini (paletas Neobrutalist en `docs/design/themes.md`). Default `light`. Persiste en localStorage.
- **Zona horaria:** display only (read from `Intl.DateTimeFormat().resolvedOptions().timeZone`). Backend set a `America/Santiago` por default, requiere escape si querés cambiar.

#### Settings · Defaults
- **Cadencia default** (días para nuevas personas): number input, default 30.
- **Color default para tags nuevos:** color picker, default `#7c3aed`.
- **Relationship_strength default (1-5):** default 3.

#### Settings · Storage
- **Quota:** barra visual (`{used} / {max} MB`). Datos: sum de `size_bytes` por owner / 500 MB.
- Detalle: lista de adjuntos ordenados por size desc.
- "Limpiar adjuntos grandes" — filtro + delete.

#### Settings · Encryption
- **Key fingerprint:** muestra los últimos 4 chars del hash SHA256 de `FIELD_ENCRYPTION_KEY` (en backend). NUNCA el key completo. Sirve para confirmar "estoy usando la misma key que la última vez".
- Botón "Copiar fingerprint".
- Advertencia: "si perdiste la key, los datos son irrecuperables".

#### Settings · Account

**Identidad visible:**
- **Nombre** (first_name) — input editable, default: el first_name actual.
- **Apellido** (last_name) — input editable, default: el last_name actual.
- **Email** — display read-only por ahora; edición con confirmación vía mail es v1.5.
- **Avatar / Foto de perfil (PFP)** — display cuadrado grande:
  - Si no hay avatar: placeholder con iniciales (mismo componente `<Avatar />`).
  - Si hay avatar: muestra la imagen (thumbnail servido por el mismo `EncryptedFileSystemStorage`).
  - Botones: "Cambiar foto" (abre file picker), "Quitar".
  - Storage: el avatar es un `Attachment` más del sistema (encryption + quota + MIME whitelist). Subject_type = `accounts.user` (custom).
  - Limit: 1 avatar por usuario (OneToOne en backend). Cambiarlo = reemplazar.
- Botón "Guardar cambios" para nombre (avatar se guarda al upload).

**Seguridad:**
- **Cambiar contraseña**: form con `current_password`, `new_password`, `new_password_confirm`. Validación: nueva ≥10 caracteres (mismo `MinLengthValidator` del backend). Tras éxito, mensaje "Contraseña actualizada" + opcional re-login.
- **Sesiones activas**: lista de dispositivos/IPs con `last_activity` (Django `django_session` table). Botón "Cerrar otras sesiones" (logout todas menos la actual).
- **Logout** (botón general, también disponible en user menu del topbar).
- **Delete account**: modal de confirmación doble — usuario debe escribir `ELIMINAR` literal. CASCADE todo (persons, notes, reminders, interactions, attachments, contact info, important dates).

**Endpoints:**
- `GET /api/auth/me/` — datos actuales.
- `PATCH /api/auth/me/` con `{first_name, last_name}` — devuelve el user actualizado.
- `POST /api/auth/change-password/` con `{current_password, new_password}` — 204 No Content si OK.
- `POST /api/me/avatar/` (multipart, single file) → devuelve `Attachment` row.
- `DELETE /api/me/avatar/` → borra el attachment atado al user.
- `GET /api/auth/sessions/` — lista de sesiones activas.
- `POST /api/auth/sessions/revoke-others/` — mata todas las sesiones menos la actual.
- `DELETE /api/auth/me/` con `{confirm: "ELIMINAR"}` → CASCADE deletes todo lo del user.

#### Settings · Data (v2)
- Export DB (JSON / vCard).
- Import.
- Mensaje "Disponible en v2".

### 4.9 `/404`

- **URL:** `/404` (también captura cualquier ruta no existente).
- **Layout:** friendly full-screen.
- **Contenido:** "404 — no encontramos esa página" + link a `/dashboard`.
- **Caso de uso:** cuando se intenta acceder a `/persons/{id}` de una persona borrada o no propia → redirect a `/404`.

### 4.10 Páginas adicionales (futuro, NO v1)

- `/calendar` — vista calendario de ImportantDates + Reminders (D13 excluido v1).
- `/search` — universal search con facets.
- `/onboarding` — flujo first-run si no hay personas.
- `/help` — atajos de teclado, faq.

---

## 5. Componentes (librería reusable)

Lista consolidada de componentes que se necesitan. Cada uno se referencia
desde al menos una página arriba.

### Primitivos
- `<Button variant=primary|secondary|danger|ghost size=sm|md|lg>`
- `<IconButton>` (icon-only, accesible, con aria-label)
- `<Avatar person=... size=xs|sm|md|lg>` (initials fallback)
- `<Tag color />` (color block chip)
- `<Card />`, `<Stack gap=... direction=row|col />`
- `<FormField label error hint children>`
- `<Modal title onClose>` (con backdrop click + esc)
- `<ConfirmDialog title body onConfirm onCancel danger>`
- `<Toast type=duration=ms>` + `<ToastContainer />`
- `<Skeleton />` (loader state)
- `<EmptyState icon title body cta>`
- `<DatePicker />`, `<TimePicker />` (input + popup)
- `<ColorPicker />`
- `<Tabs tabs=[] active onChange>` y `<TabPanel />`
- `<SearchBar debounce=200 onChange>` (controlled)
- `<FilterDropdown />`, `<SortMenu />`
- `<Pill />` (small chip para filter active)

### Dominio
- `<PersonCard variant=grid|list person onClick />` — la card principal
- `<PersonHeader person actions />` — header del detail page
- `<CadenceBadge status />` — overdue/due_soon/ok/unknown/no_cadence
- `<RelationshipStars value readonly editable />`
- `<ContactInfoItem info editable />`
- `<InteractionItem interaction editable />`
- `<ImportantDateCard date editable onClick />`
- `<ReminderItem reminder onComplete onEdit />`
- `<AttachmentTile attachment onDownload />`
- `<TagPicker selected onChange allowCreate />`
- `<MarkContactedModal person onSuccess />`

### Util
- `<ThemeSwitcher />` (botón toggle arriba)
- `<LangSwitcher />` (dropdown es/en)
- `<ErrorBoundary />`
- `<RequireAuth />` (redirect a /login si no autenticado)
- `<GlobalToast />` (singleton)

### Hooks
- `useTheme()` — lee/escribe localStorage + DOM
- `useTranslation()` — devuelve `t(key)` para el lang actual
- `usePersons(filters)` — TanStack Query
- `usePerson(id)` — TanStack Query
- `useAttachments(subjectType, subjectId)` — TanStack Query
- `useDashboard()` — TanStack Query

---

## 6. Defaults asumidos (corregibles antes de implementar)

- Default language: `es`.
- Default theme: `light` (Neobrutalist Light).
- Para `cadence_status` "ok", threshold: dentro de la ventana; "due_soon": próximos 3 días; "overdue": pasado. Default 3 días, configurable.
- Search input debounce 200ms.
- Quota de adjuntos por usuario: 500 MB (server-side ya está). Front muestra used / max en `Settings · Storage`.
- No arrastrar-y-soltar (drag & drop) para upload en v1 — solo file picker. Drag&drop es v2.
- Pagination en `/persons`: 50 por página. v1 puede obviarlo si hay < 100 personas.
- Tabs in `PersonDetail` se preservan en URL (`?tab=interactions`) para deep-linking.
- Toast max 3 visibles; auto-dismiss 5s; errores persisten hasta close.
- Logout siempre disponible en el user menu (top-right), no solo en Settings.
- Settings tabs son tabs internas (mismo URL `/settings`, query `?tab=general`).

---

## 7. Open / unknown (a decidir después)

- [x] **Paletas concretas de los 2 temas.** RESUELTO 2026-09-24 — Neobrutalist Light + Dark definidas en `docs/design/themes.md` con valores completos.
- [x] **Tipografía stack** — RESUELTO 2026-09-24: Archivo Black (display) + Inter (body/UI) + JetBrains Mono (código). Documentado en `docs/design/themes.md` como sección "Tipografía — stack canónica".
- [x] **Componente Avatar** — RESUELTO 2026-09-24: `Person.profile_photo` OneToOne a `Attachment` (D24) + simétrico `User.avatar` (frontend-plan §10.1). El componente Avatar lee la URL firmada del thumbnail cuando existe; si no, muestra iniciales del primer + último nombre.
- **Calendar view en v1 o no.** Mi default: NO en v1 (D13). Si entra, hay que elegir lib (FullCalendar, react-big-calendar, custom).
- **Onboarding flow** — necesario si la primera impresión está vacía. Default: `/dashboard` muestra empty state guidance; onboarding dedicado es v2.
- **Image lazy-loading vs eager** en galleries. Default: lazy (performance).
- **Export / Import vCard** — v2 según db-plan.
- **Markdown rendering en Note body** — por ahora plain text. Si querés markdown, agregar marked.js / remark en v2.
- **Mensaje del `key fingerprint`:** ¿se muestra siempre o solo bajo "Show details"? Default: visible en Settings siempre (no es sensible).

---

## 8. Cómo se aprueba este plan

1. Leer este doc (10-15 min) + `docs/design/themes.md`.
2. Señalar disenso o补充 en §6 (defaults) y §7 (open items).
3. Una vez firmado, implementar como UN PR grande (similar al de schema v1) con:
   - Setup i18n: `frontend/src/i18n/` con `es.json` + `en.json` + `index.ts`
   - Setup themes: `frontend/src/styles/themes.ts` + `tokens.ts` + `global.css` con CSS vars
   - Setup tailwind config con tokens
   - Setup del shell: `<AppShell>`, `<TopBar>`, `<SideNav>`, `<ToastContainer>`
   - Componentes primitivos primero (~10)
   - Componentes de dominio después (~10)
   - Pages en el orden:
     - Login / Register / 404 (sin shell)
     - AppShell + Settings (necesita theme + lang funcionando)
     - Dashboard
     - Persons list (Grid + List toggle)
     - Person detail (los 5 tabs)
     - Tags manager
     - Reminders list
     - Settings · Storage quota
   - Remoción final de `_display` fields en serializers del backend (1 PR chico o incluido en este)
4. **Una vez aprobado, NO se commitea automáticamente.** Se muestra el diff, se revisa, y vos decidís cuándo cae.

---

## 9. Relación con el db-plan-v1

- Este plan **asume** el schema del `db-plan-v1.md`. Sin ese schema aprobado, este plan no se ejecuta.
- Cambios cosméticos al schema (renombrar un enum, agregar un campo de UI) deberían actualizar AMBOS documentos. Si no se mantiene en sync, los dos se desactualizan.
- Cambios estructurales al schema (ej. agregar una tabla nueva) requieren update al db-plan primero; este plan se ajusta después.

## 10. Cambios al backend para soportar este plan (resumen)

Cambios chicos + medianos, contenidos a serializers y endpoints adicionales:

### 10.1 Modelo `accounts.User` — campos nuevos

```python
class User(AbstractUser):
    # ... campos existentes (first_name, last_name, email, password) ...
    preferred_lang = models.CharField(max_length=5, default="es", choices=[
        ("es", "Español"), ("en", "Inglés"),
    ])
    preferred_theme = models.CharField(max_length=10, default="light", choices=[
        ("light", "Claro"), ("dark", "Oscuro"),
    ])
    avatar = models.OneToOneField(
        "crm_attachment.Attachment",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="+",  # reverse from Attachment no necesario
        help_text="PFP del usuario. Reusa el Attachment system (encrypted + quota).",
    )
    # timezone opcional — TimeZoneField o CharField(50) default='America/Santiago'
```

`first_name` y `last_name` ya vienen en `AbstractUser` (Django default). Solo se exponen en endpoints para edit.

### 10.2 Endpoints nuevos

- `POST /api/auth/register/` — ahora rechaza con `403 {"detail":"registration_closed"}` si ya existe ≥1 user (env `ALLOW_REGISTRATION=true` lo reabre para testing).
- `GET /api/auth/registration-status/` → `{can_register: bool, users_count: int}` — público, sin auth. Usado por `/login` para mostrar/ocultar "Crear cuenta".
- `PATCH /api/auth/me/` (Auth required) con `{first_name, last_name}` → devuelve user actualizado. Email change: defer a v1.5 (requeriría confirmación por correo).
- `POST /api/auth/change-password/` con `{current_password, new_password, new_password_confirm}` → 204 No Content si OK. Valida password actual antes de cambiar.
- `GET /api/auth/sessions/` → lista de sesiones activas del user (`django_session` con filtro por `_auth_user_id`). Devuelve `{key, ip, user_agent, last_activity, is_current}`.
- `POST /api/auth/sessions/revoke-others/` → mata todas las sesiones menos la actual (borra las filas de `django_session` excepto la actual).
- `DELETE /api/auth/me/` con `{confirm: "ELIMINAR"}` → CASCADE: borra user + todo lo suyo (persons, notes, etc.). Solo si el confirm string matchea.
- `POST /api/me/avatar/` (multipart) → crea una fila en `crm_attachment_attachment` con subject_type=`accounts.user`, subject_id=user.id (el OneToOne inverse lo apunta). Devuelve la row de Attachment.
- `DELETE /api/me/avatar/` → borra el avatar actual (el attachment row + el file en disco cifrado).
- `POST /api/persons/{id}/profile-photo/` (multipart) → set/cambia `Person.profile_photo`. Si ya hay uno, lo borra + crea uno nuevo (reemplazo atómico).
- `DELETE /api/persons/{id}/profile-photo/` → desasocia el attachment actual (no borra la fila del attachment; queda como row regular en la galería de la persona, accessible vía Tab Adjuntos).
- `GET /api/me/preferences/` → `{preferred_lang, preferred_theme, timezone}`.
- `PATCH /api/me/preferences/` con `{preferred_lang?, preferred_theme?, timezone?}` → partial update.
- `GET /api/me/storage-usage/` → `{used_bytes, quota_bytes, percentage, by_attachment: [{title, size_bytes, created_at}, ...]}`.
- `GET /api/me/encryption-fingerprint/` → últimos 4 chars de SHA256(FIELD_ENCRYPTION_KEY). NUNCA devuelve el key completo. Útil para que el usuario confirme que está usando la misma key de siempre tras un cambio de `.env`.

### 10.3 Remoción de `_display` fields

Quitar campos *_display de los serializers. Mantener solo los keys estables (`kind`, `type`, `cadence_status`, `category`):
- `PersonSerializer` (no tiene `_display`)
- `ContactInfoSerializer.type_display` → quitar
- `ImportantDateSerializer` (no tiene `_display`)
- `InteractionSerializer.kind_display` → quitar
- `NoteSerializer.category_display` → quitar
- `ReminderSerializer` (no tiene `_display`)

El frontend traduce via `i18n/enums.<key>.json` (D3 del frontend-plan).

### 10.4 `_display` removidos en serializers ya no se envían.

### 10.5 Organización del PR

Estos cambios se pueden hacer en el mismo PR grande o en un PR aparte. Mi recomendación: **PR aparte** para mantener los diffs enfocados en "infra" vs "feature":

- PR-A (infra): `accounts.User` campos nuevos + endpoints nuevos (sin tocar serializers existentes).
- PR-B (frontend): i18n maps + componentes + páginas + remoción de `_display`.

Si querés un solo PR para entregar todo junto, funciona igual — solo el diff es más grande.
