# Themes — paletas y tokens

> **Archivo de referencia** para los temas visuales del frontend.
> Sistema "CRM moderno" (style spec v2, 2026-11-01). Reemplaza el tema
> neobrutalista anterior. La regla vinculante es `style-spec-v2.md` (mismo
> directorio); este archivo documenta el resultado y cómo se usa.
> Fuente de verdad en código: `frontend/src/styles/global.css` (valores CSS) y
> `frontend/src/styles/themes.ts` (registro de temas y helpers de acento).

## Cómo se usa

- Tokens como CSS variables (`var(--color-bg)`) mapeados 1-a-1 en
  `frontend/tailwind.config.mjs` (`bg-bg`, `text-fg`, `bg-primary`, ...).
- Cambio de tema = `data-theme="light"` / `data-theme="dark"` en `<html>`.
- Preferencia de tema en `localStorage.preferred_theme`; preferencia de acento
  en `localStorage.preferred_accent`. Ambas se aplican antes del primer paint
  desde `components/shell/NoFOUC.astro` (script inline, sin imports).
- Los switches de tema, idioma y acento viven **solo en `/settings/`** (tab
  General), no en el `TopBar`.
- No hardcodear colores en componentes. Única excepción: el color de un `Tag`
  (viene de la DB) y sus swatches de selección.

## Estilo

Aplica a ambos temas:

- Superficies planas, bordes de 1px (`--color-border`), sombras suaves.
- Radios: `--radius-sm` 6px, `--radius-md` 8px (botones, inputs, menús),
  `--radius-lg` 12px (cards, modales). Avatares, badges pill y muestras de
  color usan `rounded-full`.
- Tipografía Inter en todo (display = Inter 600). Sin `uppercase`; los
  títulos usan `font-semibold tracking-tight`.
- Sin efectos de desplazamiento (`translate`) en botones ni cards. El feedback
  es cambio de fondo, sombra o borde.
- Foco visible siempre: `focus-visible:ring-2 focus-visible:ring-ring`.

## Semántica de tokens

Se conservan los nombres de tokens y de clases (`neo-card`, `neo-btn`,
`neo-input`, ...). Cambia su significado:

| Token | Significado |
|---|---|
| `primary` | acento de marca, customizable por el usuario |
| `primary-fg` | texto sobre `primary` (lo calcula JS por contraste) |
| `primary-hover` | `primary` oscurecido 12% (hover de botón primario) |
| `primary-soft` / `primary-soft-fg` | fondo y texto tenues del acento (item activo del sidebar, tabs, chips activos) |
| `ring` | acento al 45% de opacidad, para anillos de foco |
| `accent` | **rojo de peligro**. Solo errores, acciones destructivas y asterisco de requerido |
| `secondary`, `muted` | gris de superficie secundaria (hover, placeholders, skeletons) |
| `border` | gris claro 1px |
| `status-*` | pares bg/fg para estados de cadencia (ok, due-soon, overdue, unknown) |

Clases de Tailwind nuevas: `bg-primary-hover`, `bg-primary-soft`,
`text-primary-soft-fg`, `ring-ring`, `rounded-sm|md|lg` (ligados a los radios)
y `shadow-sm|md|lg`. Se mantienen `shadow-neobrutal-sm|neobrutal|neobrutal-lg`
como alias de las mismas sombras suaves.

## Tema A — Light (default)

`:root[data-theme="light"]`

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

--shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
--shadow-md: 0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04);
--shadow-lg: 0 10px 30px rgb(0 0 0 / 0.10);
```

## Tema B — Dark

`:root[data-theme="dark"]`

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

--shadow-sm: 0 1px 2px rgb(0 0 0 / 0.4);
--shadow-md: 0 1px 3px rgb(0 0 0 / 0.5);
--shadow-lg: 0 10px 30px rgb(0 0 0 / 0.6);
```

## Acento customizable

Común a ambos temas, declarado en `:root`:

```
--accent-base: #db2777;   /* default rosa. Lo pisa el usuario */
--accent-fg: #ffffff;     /* lo calcula JS según contraste */
--color-primary: var(--accent-base);
--color-primary-fg: var(--accent-fg);
--color-primary-hover: color-mix(in oklch, var(--accent-base) 88%, black);
--color-ring: color-mix(in oklch, var(--accent-base) 45%, transparent);
```

`--color-primary-soft` y `--color-primary-soft-fg` dependen de
`--color-surface` y `--color-fg`, por eso se declaran **dentro de cada bloque
de tema**:

```
--color-primary-soft: color-mix(in oklch, var(--accent-base) 12%, var(--color-surface));
--color-primary-soft-fg: color-mix(in oklch, var(--accent-base) 80%, var(--color-fg));
```

Presets (`ACCENT_PRESETS` en `themes.ts`, en este orden):

| id | hex | texto sobre el acento (`accentForeground`) |
|---|---|---|
| pink (default) | `#db2777` | `#ffffff` (4.60:1) |
| rose | `#e11d48` | `#ffffff` (4.70:1) |
| violet | `#7c3aed` | `#ffffff` (5.70:1) |
| blue | `#2563eb` | `#ffffff` (5.17:1) |
| teal | `#0d9488` | `#18181b` (4.73:1) |
| green | `#16a34a` | `#18181b` (5.38:1) |
| orange | `#ea580c` | `#18181b` (4.98:1) |
| slate | `#475569` | `#ffffff` (7.58:1) |

Además se acepta cualquier color propio (`<input type="color">`).

API en `themes.ts`: `ACCENT_PRESETS`, `DEFAULT_ACCENT`, `STORAGE_KEY_ACCENT`,
`isValidHex(v)` (solo `^#[0-9a-fA-F]{6}$`), `accentForeground(hex)`,
`applyAccent(hex)` (setea `--accent-base` y `--accent-fg` en
`document.documentElement.style`) y `readStoredAccent()` (valida y cae a
`DEFAULT_ACCENT`; envuelto en try/catch).

`NoFOUC.astro` duplica la regex y la fórmula de contraste inline para aplicar
el acento antes del primer paint. Si se cambia la fórmula, actualizar ambos.

UI: `components/settings/GeneralTab.tsx`, sección "Color de acento" (muestras
con `aria-pressed`, selector de color propio, botón Restablecer). Textos en
`settings.accent.*` (es/en). La sincronización con backend no está
implementada.

## Reglas de contraste

Estas reglas son **bloqueantes** — nunca las rompas en componentes:

1. **Texto sobre `bg-primary` = `text-primary-fg`.** El acento es variable,
   así que el color de texto se calcula (`accentForeground`): el que tenga
   mayor ratio WCAG contra el acento, `#ffffff` o `#18181b`. La regla CSS
   `.bg-primary { color: var(--color-primary-fg) }` lo fuerza por defecto.
   Nunca poner `text-fg` sobre `bg-primary`.
2. **`accent` es siempre peligro.** `bg-accent` lleva `text-accent-fg`
   (blanco). Para avisos de error no destructivos usar el par suave
   `bg-status-overdue text-status-overdue-fg`. El asterisco de requerido es
   `text-accent`.
3. **Estados de cadencia** usan siempre el par `bg-status-*` +
   `text-status-*-fg` del mismo estado (sin borde, pill
   `rounded-full px-2 py-0.5 text-xs font-medium`). `STATUS_TOKENS[x].badge`
   (en `styles/tokens.ts`) trae las clases completas y literales para que
   Tailwind las detecte; no construir `bg-${...}` dinámicamente.
4. **Item activo de navegación/tab/chip:** `bg-primary-soft
   text-primary-soft-fg`. Inactivo: `text-fg-muted hover:bg-muted
   hover:text-fg`.
5. **Overlays de modal:** una sola clase para ambos temas, `bg-black/40`
   (los tokens de color con `var()` no soportan modificador de opacidad en
   Tailwind v3, así que `bg-fg/40` no genera CSS).
6. **Ratios medidos** (WCAG): light `fg`/`bg` 16.5:1, `fg-muted` sobre
   `surface` 4.8:1 y sobre `bg` 4.5:1; dark `fg`/`bg` 18.8:1, `fg-muted` sobre
   `surface` 7.0:1. Pares de estado: 5.8:1 a 8.5:1. Excepción conocida: texto
   blanco sobre el rojo de peligro oscuro `#ef4444` = 3.76:1 (valor fijado por
   la spec; usar con `text-sm font-medium` o mayor).
7. **Foco:** anillo de 2px con `ring` (acento al 45%). Nunca quitar el
   outline sin reemplazarlo.

## Tipografía

| Slot | Familia | Pesos | Uso |
|---|---|---|---|
| Sans / Display | **Inter** | 400, 500, 600, 700 | todo el UI. Títulos en 600 |
| Mono | `ui-monospace, "SFMono-Regular", Menlo, monospace` | 400 | IDs, fechas técnicas, hashes |

Google Fonts carga solo `Inter:wght@400;500;600;700` (`layouts/Layout.astro`).
Ya no se cargan Archivo Black ni JetBrains Mono.

Escala de uso:

```
h1 (título de página)   text-2xl font-semibold tracking-tight
h2 (sección)            text-lg  font-semibold
h3                      text-base font-semibold
botones / labels / nav  font-medium
cifras de estadísticas  font-semibold
etiqueta de sección     text-xs font-medium text-fg-muted tracking-wide   (sin uppercase)
```

Tokens: `font-family-sans`, `font-family-display` (= Inter), `font-family-mono`,
`font-weight-regular` 400, `font-weight-medium` 500, `font-weight-bold` 700,
`font-weight-display` 600.

## Tokens (nombres semánticos — ortogonales al modo)

```yaml
tokens:
  color:
    bg, surface, fg, fg-muted
    primary, primary-fg, primary-hover, primary-soft, primary-soft-fg, ring
    accent, accent-fg           # peligro
    secondary, muted, border
    status-{ok,due-soon,overdue,unknown}[-fg]
  typography:
    font-family-sans / font-family-display / font-family-mono
    font-weight-regular / medium / bold / display
  radius:
    sm: 6px
    md: 8px
    lg: 12px
    full: rounded-full (utilidad Tailwind)
  border:
    width-thin: 1px
    width-default: 1px
    width-thick: 1px            # alias legacy; no usar border-thick en componentes
    style: solid
  shadow:
    none
    sm: tarjetas, popovers chicos
    md: hover de cards
    lg: modales, menús desplegables, toasts
  motion:
    duration-fast: 80ms
    duration-normal: 160ms
    duration-slow: 240ms
    easing-standard: cubic-bezier(0.2, 0, 0, 1)
    easing-ease-out: cubic-bezier(0, 0, 0.2, 1)
```

## Componentes compartidos (`global.css`, capa utilities)

- `.neo-card`: `rounded-lg border border-border bg-surface shadow-sm`.
  `.neo-card-hover:hover`: `shadow-md` + borde un tono más oscuro (sin
  translate).
- `.neo-btn`: botón neutro 8px de radio, `text-sm font-medium`, hover
  `bg-muted`, foco con `ring-ring`. Variantes `.neo-btn-primary`,
  `.neo-btn-danger`, `.neo-btn-sm`.
- `.neo-input`: `rounded-md border border-border`, foco
  `ring-2 ring-ring` + `border-primary`. `.neo-input-sm` para filtros densos.

## Iconos

No se usan emojis. Todos los iconos son `lucide-react`, `size-4` (o `size-5`
en encabezados), con `aria-hidden="true"` cuando hay texto al lado.
`frontend/src/components/ui/icons.tsx` define el mapa único de claves a
iconos y el componente `<IconByKey name=... />`.

`ImportantDate.icon` (`CharField(max_length=8)`) guarda una clave:
`calendar, cake, heart, gift, star, party, home, travel, work, grad, baby,
gem`. Si el valor guardado no es una clave conocida (por ejemplo un emoji de
datos viejos) el render muestra `calendar`. Los toasts usan `CheckCircle2`,
`AlertCircle`, `Info` y `AlertTriangle`.

## Switches de tema/idioma/acento

Viven **solo en `/settings/`** (tab General). No en el `TopBar`.
