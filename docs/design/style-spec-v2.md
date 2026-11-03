# Style spec v2 — CRM moderno

Fecha: 2026-11-01
Reemplaza el tema neobrutalista. Este documento es la regla. Si una sugerencia de un skill
de diseno contradice un valor de aqui, gana este documento.

## 0. Limites del trabajo (obligatorio)

- Solo se toca `frontend/` y `docs/design/`. No tocar `backend/`.
- No detener, matar ni reiniciar procesos en los puertos 8000, 4321 ni 5433. Son de otros
  proyectos.
- No cambiar puertos en `astro.config.mjs`, `.env*`, `docker-compose.yml`.
- No correr `pnpm dev` en el puerto por defecto. Para mirar la UI usar
  `pnpm astro dev --port 4337` y detenerlo al terminar.
- No instalar dependencias nuevas. `lucide-react` ya esta.
- No commitear. No tocar `.gitignore`.
- Cero emojis en `frontend/src`, incluidos comentarios y JSON de i18n.

## 1. Semantica de tokens

Se mantienen los nombres de tokens y de clases existentes para no romper componentes.
Cambia su significado:

| Token | Antes | Ahora |
|---|---|---|
| `primary` | amarillo | color de acento de la marca, customizable por el usuario |
| `accent` | naranja (se usaba para error / destructivo) | rojo de peligro. Solo errores, destructivo y asterisco de requerido |
| `secondary`, `muted` | crema / grises | gris de superficie secundaria |
| `border` | negro grueso | gris claro 1px |

Tokens nuevos: `primary-hover`, `primary-soft`, `primary-soft-fg`, `ring`, radios
`--radius-sm|md|lg`.

## 2. Valores

### 2.1 Light (`:root[data-theme="light"]`)

```
--color-bg: #f7f7f8;
--color-surface: #ffffff;
--color-fg: #18181b;
--color-fg-muted: #71717a;
--color-secondary: #f4f4f5;
--color-muted: #f4f4f5;
--color-border: #e4e4e7;
--color-accent: #dc2626;        /* peligro */
--color-accent-fg: #ffffff;

--color-status-ok: #dcfce7;        --color-status-ok-fg: #166534;
--color-status-due-soon: #fef3c7;  --color-status-due-soon-fg: #92400e;
--color-status-overdue: #fee2e2;   --color-status-overdue-fg: #991b1b;
--color-status-unknown: #f4f4f5;   --color-status-unknown-fg: #52525b;

--shadow-none: none;
--shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
--shadow-md: 0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04);
--shadow-lg: 0 10px 30px rgb(0 0 0 / 0.10);
```

### 2.2 Dark (`:root[data-theme="dark"]`)

```
--color-bg: #0b0b0e;
--color-surface: #16161a;
--color-fg: #fafafa;
--color-fg-muted: #a1a1aa;
--color-secondary: #1f1f23;
--color-muted: #1f1f23;
--color-border: #27272a;
--color-accent: #ef4444;
--color-accent-fg: #ffffff;

--color-status-ok: #052e1a;        --color-status-ok-fg: #4ade80;
--color-status-due-soon: #3a2a05;  --color-status-due-soon-fg: #fbbf24;
--color-status-overdue: #3b0d0d;   --color-status-overdue-fg: #f87171;
--color-status-unknown: #27272a;   --color-status-unknown-fg: #a1a1aa;

--shadow-none: none;
--shadow-sm: 0 1px 2px rgb(0 0 0 / 0.4);
--shadow-md: 0 1px 3px rgb(0 0 0 / 0.5);
--shadow-lg: 0 10px 30px rgb(0 0 0 / 0.6);
```

### 2.3 Acento (comun a ambos temas, en `:root`)

```
--accent-base: #db2777;   /* default rosa. Lo pisa el usuario */
--accent-fg: #ffffff;     /* lo calcula JS segun contraste */
--color-primary: var(--accent-base);
--color-primary-fg: var(--accent-fg);
--color-primary-hover: color-mix(in oklch, var(--accent-base) 88%, black);
--color-primary-soft: color-mix(in oklch, var(--accent-base) 12%, var(--color-surface));
--color-primary-soft-fg: color-mix(in oklch, var(--accent-base) 80%, var(--color-fg));
--color-ring: color-mix(in oklch, var(--accent-base) 45%, transparent);
```

`--color-primary-soft` y `--color-primary-soft-fg` dependen de `--color-surface` y
`--color-fg`, asi que deben declararse dentro de cada bloque de tema (light y dark), no solo
en `:root`.

### 2.4 Forma y tipografia (ambos temas)

```
--border-width-thin: 1px;
--border-width-default: 1px;
--border-width-thick: 1px;
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--font-family-sans: "Inter", system-ui, sans-serif;
--font-family-display: "Inter", system-ui, sans-serif;
--font-family-mono: ui-monospace, "SFMono-Regular", Menlo, monospace;
--font-weight-display: 600;
```

Motion: mantener los valores actuales.

`Layout.astro`: el link de Google Fonts carga solo `Inter:wght@400;500;600;700`. Quitar
Archivo Black y JetBrains Mono.

## 3. Acento customizable

### 3.1 `src/styles/themes.ts`

Agregar, sin romper lo existente:

- `ACCENT_PRESETS`: lista ordenada `{ id, label, hex }`:
  `pink #db2777` (default), `rose #e11d48`, `violet #7c3aed`, `blue #2563eb`,
  `teal #0d9488`, `green #16a34a`, `orange #ea580c`, `slate #475569`.
- `DEFAULT_ACCENT = "#db2777"`.
- `STORAGE_KEY_ACCENT = "preferred_accent"`.
- `isValidHex(v)`: acepta solo `^#[0-9a-fA-F]{6}$`.
- `accentForeground(hex)`: devuelve `#ffffff` o `#18181b` segun contraste WCAG (el que
  tenga mayor ratio contra `hex`).
- `applyAccent(hex)`: setea `--accent-base` y `--accent-fg` en
  `document.documentElement.style`.
- `readStoredAccent()`: lee localStorage, valida con `isValidHex`, si no `DEFAULT_ACCENT`.
  Envolver en try/catch.
- Actualizar `description` de los temas light y dark (sin mencionar amarillo ni neon).

### 3.2 `NoFOUC.astro`

Ademas del tema, leer `preferred_accent` antes del primer paint, validar con la misma regex,
calcular el foreground con la misma formula y setear las dos variables. Todo inline, en
try/catch, sin imports.

### 3.3 UI

En `settings/GeneralTab.tsx` agregar una seccion "Color de acento":
- Fila de muestras circulares (una por preset), con `aria-label` del nombre y
  `aria-pressed` en la activa. Anillo de foco visible.
- Un `<input type="color">` para color propio.
- Boton "Restablecer" que vuelve a `DEFAULT_ACCENT`.
- Al cambiar: `applyAccent`, guardar en localStorage. Efecto inmediato, sin recargar.
- Textos via i18n en `es.json` y `en.json` (claves nuevas bajo `settings.accent.*`).
  Correr `node check-i18n.cjs` y dejarlo pasando.
- La sincronizacion con backend no es parte de este trabajo.

## 4. Tailwind (`tailwind.config.mjs`)

- Agregar colores: `primary-hover`, `primary-soft`, `primary-soft-fg`, `ring`.
- Agregar `borderRadius`: `sm: var(--radius-sm)`, `DEFAULT` y `md: var(--radius-md)`,
  `lg: var(--radius-lg)`.
- `boxShadow`: mantener las claves `neobrutal-sm`, `neobrutal`, `neobrutal-lg` apuntando a
  los tokens nuevos (para no romper), y agregar `sm`, `md`, `lg` con los mismos tokens.

## 5. Clases compartidas (`global.css`, capa utilities)

Redefinir con los mismos nombres:

- `h1..h4` base: `font-semibold tracking-tight`, sin `uppercase`, sin `font-display` 900.
- `.neo-card`: `rounded-lg border border-border bg-surface shadow-sm`.
- `.neo-card-hover:hover`: `shadow-md` y `border` un tono mas oscuro. Sin `translate`.
- `.neo-btn`: `inline-flex items-center justify-center gap-2 rounded-md border
  border-border bg-surface px-3.5 py-2 text-sm font-medium text-fg shadow-sm
  hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  disabled:opacity-50`. Sin `translate`.
- `.neo-btn-primary`: `bg-primary text-primary-fg border-transparent
  hover:bg-primary-hover`.
- `.neo-btn-danger`: `bg-accent text-accent-fg border-transparent hover:opacity-90`.
- `.neo-btn-sm`: si existe, `px-2.5 py-1.5 text-xs`.
- `.neo-input`: `block w-full rounded-md border border-border bg-surface px-3 py-2
  text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2
  focus:ring-ring focus:border-primary`.
- Mantener las reglas `.bg-primary { color: var(--color-primary-fg) }` y equivalentes de
  status. Corregir `.bg-accent` a `var(--color-accent-fg)` (ya es asi).
- Quitar todo comentario que hable de neobrutalismo.

## 6. Barrido de componentes (`frontend/src`)

Reglas exactas, aplicar en todos los `.tsx` y `.astro`:

1. `uppercase`: quitar en todas partes. Unica excepcion: etiquetas de seccion de una sola
   linea con `text-xs`, que pasan a `text-xs font-medium text-fg-muted tracking-wide`.
2. Titulos de pagina (`h1` con `font-display text-4xl uppercase`): `text-2xl font-semibold`.
   `h2` de seccion: `text-lg font-semibold`. `h3`: `text-base font-semibold`.
3. `font-display`: quitar.
4. `font-bold`: en botones, labels, badges y nav pasa a `font-medium`. En titulos pasa a
   `font-semibold`. En cifras de estadisticas puede quedar `font-semibold`.
5. `border-thick`, `border-2`, `border-4`: pasan a `border`.
6. `shadow-neobrutal*` en componentes: `shadow-sm` (cards, popovers chicos) o `shadow-lg`
   (modales, menus desplegables).
7. Efectos `hover:-translate-*`, `active:translate-*`, `translate-x-[..]`,
   `translate-y-[..]` usados como efecto de boton/card: quitar. No quitar `translate`
   usados para posicionar (centrar modales, toggles, sliders).
8. Cards, modales, inputs, badges, menus, avatares sin radio: agregar `rounded-lg`
   (cards, modales), `rounded-md` (botones, inputs, menus), `rounded-full` (avatares,
   badges tipo pill, muestras de color).
9. Badges de estado de cadencia: pill `rounded-full px-2 py-0.5 text-xs font-medium` con
   `bg-status-*` y `text-status-*-fg`. Sin borde.
10. Item activo del sidebar: `bg-primary-soft text-primary-soft-fg`. Items inactivos:
    `text-fg-muted hover:bg-muted hover:text-fg`.
11. Overlays de modal: `bg-black/40` (light) — usar una sola clase que funcione en ambos
    temas.
12. Colores literales en componentes (`#hex`, `bg-yellow-*`, `text-black`, etc.):
    reemplazar por tokens. Excepcion: el color de un `Tag` que viene de la DB.
13. Espaciado: no rediseniar layouts. Solo ajustar si al quitar sombras/bordes gruesos algo
    queda pegado.

## 7. Emojis

- Reemplazar los 90 emojis de `frontend/src` (21 archivos; los mas cargados son
  `persons/detail/DatesTab.tsx`, `persons/detail/helpers.ts`,
  `persons/new/PersonCreateForm.tsx`, `persons/detail/AttachmentsTab.tsx`) por iconos de
  `lucide-react`, tamano `size-4` (o `size-5` en encabezados), `aria-hidden="true"` cuando
  hay texto al lado.
- Crear `src/components/ui/icons.tsx` con un mapa unico de claves a componentes lucide y un
  componente `<IconByKey name=... />`.
- `ImportantDate.icon` en la DB es `CharField(max_length=8)` y hoy guarda emojis. El selector
  de icono de fechas pasa a ofrecer claves de maximo 8 caracteres:
  `calendar, cake, heart, gift, star, party, home, travel, work, grad, baby, gem`.
  El render debe aceptar valores viejos: si el valor no es una clave conocida (por ejemplo
  un emoji guardado), mostrar `calendar`. Al crear una fecha nueva, default `calendar`
  (aunque el backend todavia tenga default emoji; la migracion de backend es otra tarea).
- Toasts (`ToastContainer.tsx`): iconos lucide `CheckCircle2`, `AlertCircle`, `Info`,
  `AlertTriangle`.

## 8. Documentacion

- Reescribir `docs/design/themes.md` con este sistema (tokens, acento customizable, reglas
  de contraste). Quitar la referencia a `palette-neobrutalist.png` (no borrar el archivo).

## 9. Verificacion (todas deben pasar antes de entregar)

1. `pnpm astro check` desde `frontend/`: 0 errores.
2. `pnpm build` desde `frontend/`: sin errores.
3. `node check-i18n.cjs`: pasa.
4. Busquedas que deben dar 0 resultados en `frontend/src`:
   `uppercase` (salvo la excepcion 6.1), `font-display`, `border-thick`,
   `shadow-neobrutal`, `Archivo`, y emojis (rango U+1F300-U+1FAFF y U+2600-U+27BF).
5. `pnpm astro dev --port 4337`, abrir `/login/` en light y dark, con acento por defecto y
   con un preset cambiado via localStorage. Detener el server al terminar.
6. Entregar: lista de archivos tocados, salida resumida de cada verificacion y cualquier
   regla que no se pudo cumplir con el motivo.
