# Style spec v2.1 — Normalizacion y pulido

Fecha: 2026-11-02
Extiende `style-spec-v2.md` (tokens, acento, limites). Donde este documento dice algo
distinto, gana este. Objetivo: tamanos, fuentes, colores y patrones consistentes en todas
las pantallas, y quitar los rasgos tipicos de interfaz generada por IA.

## 0. Limites (obligatorio, igual que v2)

- Solo `frontend/` y `docs/design/`. No tocar `backend/`.
- No detener ni reiniciar procesos. El frontend ya corre en `http://localhost:4338` (Astro
  con recarga en caliente) contra el backend en 8010. Hay sesion iniciada en el panel del
  navegador como `demo@simplecrm.test`. Usarlo para mirar los cambios. No cerrar sesion.
- No tocar puertos 8000, 4321, 5433, 8010, 4338.
- Sin dependencias nuevas. Sin commits. Sin emojis.
- No cambiar comportamiento de datos (que se guarda, cuando, a que endpoint). Solo
  presentacion, salvo los bugs listados en la seccion 9.

## 1. Escala tipografica (unicos valores permitidos)

| Uso | Clases |
|---|---|
| Titulo de pagina (h1) y nombre en cabecera de persona | `text-xl font-semibold` |
| Titulo de card o seccion (h2/h3) | `text-sm font-semibold` |
| Texto normal, botones, inputs, items de nav, celdas | `text-sm` (peso normal; botones/nav `font-medium`) |
| Meta, ayuda, fechas secundarias, badges | `text-xs text-fg-muted` |
| Cifra destacada (si hay estadisticas) | `text-2xl font-semibold tabular-nums` |
| Codigo 404 | `text-4xl font-semibold` |

- Prohibido en `frontend/src`: `text-base`, `text-lg`, `text-3xl` en adelante (salvo 404),
  `text-[..]` arbitrario, `font-mono`, `tracking-wide`, `tracking-wider`, `italic`,
  `font-bold`, `font-light`.
- Fechas, horas y numeros: `tabular-nums`.
- Etiquetas de seccion tipo overline: `text-xs font-medium text-fg-muted`, sin tracking.

## 2. Tamanos de controles

| Elemento | Clases |
|---|---|
| Boton default (`neo-btn`) | `h-9 px-3.5 text-sm font-medium rounded-md`, icono `size-4` |
| Boton chico (`neo-btn-sm`) | `h-8 px-3 text-sm font-medium rounded-md` |
| Boton solo icono | crear `.btn-icon`: `inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-muted hover:text-fg`; siempre con `aria-label` y `title` |
| Boton fantasma | crear `.neo-btn-ghost`: como `neo-btn` pero `border-transparent bg-transparent shadow-none hover:bg-muted` |
| Input / select / textarea (`neo-input`) | `h-9` (textarea sin altura fija), `text-sm px-3 rounded-md` |
| Checkbox / radio | `size-4 rounded` con `accent-color: var(--color-primary)` |

- Todos los botones de una misma fila tienen la misma altura.
- Disabled (todas las variantes): `bg-muted text-fg-muted border-border shadow-none
  cursor-not-allowed`. Nunca un rosa lavado.

## 3. Iconos y avatares

- Iconos de interfaz: `size-4`. Dentro de una linea de meta o badge: `size-3.5`.
  Estado vacio: `size-8` dentro de un circulo `size-12 rounded-full bg-muted`. Ningun otro
  tamano de icono.
- Prohibidos como decoracion: `Sparkles`, `Wand`, `Wand2`, `Zap`, `Rocket`, `Stars`.
- Avatares: `size-8` en filas y listas compactas, `size-10` en cards, `size-16` en la
  cabecera de persona. Iniciales `text-xs` / `text-sm` / `text-xl`, `font-medium`.
- Color de avatar: NO usar el acento. Elegir uno de 6 pares por hash del nombre visible
  (suma de char codes mod 6). Definir en `global.css` las variables
  `--avatar-{1..6}-bg` y `--avatar-{1..6}-fg` en ambos temas y un helper unico
  `avatarTone(name)` en `src/components/ui/avatar.ts` (o junto a un componente `Avatar`).

  Light: 1 `#e2e8f0/#334155`, 2 `#dbeafe/#1e40af`, 3 `#dcfce7/#166534`,
  4 `#fef3c7/#92400e`, 5 `#ede9fe/#5b21b6`, 6 `#ffe4e6/#9f1239`.
  Dark: 1 `#1e293b/#cbd5e1`, 2 `#172554/#93c5fd`, 3 `#052e16/#86efac`,
  4 `#3a2a05/#fcd34d`, 5 `#2e1065/#c4b5fd`, 6 `#4c0519/#fda4af`.

- Un solo componente `Avatar` reutilizado en todas partes (dashboard, listas, detalle,
  selectores).

## 4. Espaciado y forma

- Contenido de pagina: `mx-auto w-full max-w-6xl px-6 py-6`.
- Cabecera de pagina: fila `flex items-center justify-between gap-4 mb-6`. Titulo a la
  izquierda; si hay conteo, al lado en `text-sm text-fg-muted tabular-nums` (sin
  parentesis). Accion principal a la derecha como `neo-btn neo-btn-primary`.
- Padding de contenedores: cards `p-5`, modales `p-6`, filas de lista `px-4 py-3`.
  Prohibido `p-3`, `p-8`, `p-10` en contenedores (elementos internos chicos pueden usar
  `p-0.5`..`p-2`).
- Gaps permitidos: `gap-1`, `gap-1.5`, `gap-2`, `gap-3`, `gap-4`, `gap-6`. Separacion
  vertical entre bloques: `space-y-6`; dentro de una card: `space-y-4`.
- Radios: cards y modales `rounded-lg`, controles y menus `rounded-md`, pills y avatares
  `rounded-full`. Prohibido `rounded` y `rounded-sm` sueltos (excepto checkbox).
- Listas: preferir una card con filas divididas (`divide-y divide-border`) en vez de una
  card por fila.

## 5. Disciplina de color

El acento rosa solo aparece en:
1. Boton primario (como maximo uno visible por zona).
2. Item activo del sidebar y tab activa (indicador).
3. Anillo de foco.
4. Links de texto.
5. Estado seleccionado en pickers (acento, iconos de fecha).
6. Marca de "hoy" en el calendario (solo color de texto + punto, sin relleno ni anillo).

Prohibido usar el acento en: avatares, iconos decorativos, badges, fondos de cards,
botones flotantes.

- Destructivo: nunca rojo solido en reposo dentro de listas o cards. Borrar en una fila =
  `.btn-icon` con icono `Trash2`, y en hover `hover:text-accent hover:bg-status-overdue`.
  Rojo solido (`neo-btn-danger`) solo en el boton de confirmar de un dialogo de
  confirmacion.
- Tags: pill neutra `inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5
  text-xs text-fg` con un punto `size-2 rounded-full` del color del tag. Sin `#` delante
  del nombre. Sin fondo saturado.
- Estado de cadencia: el unico badge de color en la cabecera y las cards de persona.
  "Cadencia (dias): 7d" deja de ser badge: pasa a texto meta "Cada 7 dias".
- Recurrencia: si es `none`, no mostrar nada. Si no, texto meta con icono `Repeat`
  `size-3.5` ("Anual", "Mensual", "Semanal"), sin pill.
- "Conto como contacto": texto meta con icono `Check` `size-3.5` en `text-status-ok-fg`,
  sin pill.

## 6. Patrones

### 6.1 Tabs (secciones de una pagina: Ajustes, detalle de persona)
Un solo componente `Tabs` en `src/components/ui/`. Fila con `border-b border-border`.
Item `h-10 px-1 mr-6 text-sm font-medium text-fg-muted hover:text-fg`; activo `text-fg`
con borde inferior de 2px `border-primary` (que tape el borde de la fila). Sin fondo.

### 6.2 Control segmentado (filtros: Pendientes / Completados / Todos)
Componente `SegmentedControl`: `inline-flex rounded-md bg-muted p-0.5`. Item
`h-7 px-3 text-sm font-medium rounded text-fg-muted`; activo
`bg-surface text-fg shadow-sm`. Nunca se parte en dos lineas.

### 6.3 Barra de filtros
`flex flex-wrap items-center gap-2`. Sin labels visibles al lado de los selects ("Filtrar
por persona", "Filtrar por tipo"): el select lleva `aria-label` y su primera opcion
describe el filtro ("Todas las personas", "Todos los tipos"). Selects de filtro con
`neo-input` y ancho automatico (`w-auto`). La accion principal de la pagina va en la
cabecera (4), no en la barra de filtros.

### 6.4 Acciones de fila
Editar y borrar como `.btn-icon` (`Pencil`, `Trash2`), mismo tamano, alineados a la
derecha, `gap-1`. Reemplazar los links de texto "Eliminar" por el mismo `.btn-icon`.

### 6.5 Formularios y Ajustes
- Label arriba del control: `text-sm font-medium mb-1.5`; ayuda debajo `text-xs
  text-fg-muted mt-1.5`. Ancho de control `max-w-sm` en Ajustes.
- Cada seccion de Ajustes: titulo `text-sm font-semibold`, descripcion `text-xs
  text-fg-muted`, controles, y si tiene boton Guardar, va abajo a la derecha como
  `neo-btn-sm neo-btn-primary`. Separar secciones con `divide-y divide-border` y `py-5`.
- Valor hex del acento: `text-xs text-fg-muted tabular-nums`, sin mono.

### 6.6 Fechas
- Crear `src/utils/format.ts` (no en `src/lib/`, que esta fuera de git) con
  `formatDate(iso, lang)`, `formatDateTime(iso, lang)` y `formatRelative(iso, lang)`
  usando `Intl.DateTimeFormat` (`day: "numeric", month: "short", year: "numeric"`, y
  `hour: "2-digit", minute: "2-digit"` para fecha-hora) e `Intl.RelativeTimeFormat`
  (`numeric: "auto"`).
- Listas y cards: relativo ("hace 9 dias", "en 2 dias"), con la fecha absoluta en el
  atributo `title`. Detalle y formularios: absoluto ("29 oct 2026, 18:00").
- Prohibido mostrar ISO crudo (`2026-10-29 18:00`) o `toLocaleDateString()` sin opciones.
  Reemplazar los helpers existentes de `persons/detail/helpers.ts` para que deleguen en
  `utils/format.ts`.

### 6.7 Estados vacios
Centrado dentro de la card: icono (3), titulo `text-sm font-medium`, una linea
`text-xs text-fg-muted`, y como maximo un boton `neo-btn-sm`.

### 6.8 Shell
- Sidebar: cabecera `h-14` con `border-b`, marca `text-sm font-semibold`. Items
  `h-9 px-3 gap-3 rounded-md text-sm font-medium`, icono `size-4`. Activo
  `bg-primary-soft text-primary-soft-fg`. "Cerrar sesion" con el mismo estilo de item
  (fantasma), no boton con borde.
- Topbar: `h-14` con `border-b`, alineada con la cabecera del sidebar. Busqueda
  `neo-input` `max-w-md` con icono `Search` `size-4` dentro. A la derecha: `Avatar`
  `size-8` + nombre `text-sm`. Quitar "Hola,".
- Quitar el boton flotante "+" de Personas; la accion "Nueva persona" va en la cabecera
  de la pagina.

### 6.9 Cabecera de persona
`Avatar size-16`, nombre `text-xl font-semibold`, debajo una linea meta `text-sm
text-fg-muted` con apodo, cargo y empresa separados por ` · ` (sin comillas en el apodo).
Debajo: badge de cadencia + "Cada N dias" + "Ultimo contacto: <relativo>" + tags.
Acciones a la derecha, todas `neo-btn-sm`: primaria "Marcar contactada hoy", luego
"Editar", luego favorito como `.btn-icon` (`Star`, relleno si es favorito), luego menu
"Mas" como `.btn-icon` (`MoreHorizontal`).

### 6.10 Calendario del dashboard
Grilla sin borde por celda. Celda `h-9 rounded-md text-sm tabular-nums
hover:bg-muted`. Dias fuera del mes `text-fg-muted opacity-50`. Hoy `text-primary
font-semibold`. Dia con eventos: punto `size-1 rounded-full bg-fg-muted` centrado debajo
del numero. Mes y anio como titulo de card normal (`text-sm font-semibold`), sin badge
mono. Botones prev/next como `.btn-icon`, "Hoy" como `neo-btn-sm neo-btn-ghost`.

### 6.11 Barra de registro rapido
Quitar icono `Zap`. Usar `MessageSquarePlus` `size-4 text-fg-muted`. Placeholder corto:
"Registrar interaccion..." (es) / "Log an interaction..." (en).

## 7. Texto de interfaz (i18n es/en)

- Sin signos de exclamacion. Sin raya `—` en textos visibles (usar punto o coma).
- Sin jerga tecnica visible: UTC, USE_TZ, IANA, backend, SSR, localStorage, Fernet,
  AES, HMAC, FIELD_ENCRYPTION_KEY, settings de Django. Reescribir en lenguaje de usuario
  ("Zona horaria", "Tus notas y archivos se guardan cifrados en el servidor."). Mantener el
  registro actual del idioma (voseo existente) y la paridad de claves es/en.
- Frases cortas, en mayuscula inicial solamente.

## 8. Rasgos de IA a eliminar (checklist)

Emojis (ya hecho), iconos decorativos de la seccion 3, acento por todas partes, badges
para todo, conteos entre parentesis, comillas tipograficas alrededor de apodos, overlines
con tracking, mono para fechas, rayas en el texto, botones flotantes, placeholders
conversacionales, textos de ayuda que explican la implementacion, gradientes, blur,
sombras grandes en reposo.

## 9. Bugs a corregir en esta pasada

1. Se pide `/api/attachments/undefined/thumb/` cuando la persona no tiene foto
   (`PersonCard`, `ContactTab`, `ProfilePhoto`, dashboard). Si `profile_photo` es falsy,
   no pedir imagen y mostrar `Avatar` con iniciales.
2. El calendario dice "N eventos" pero no marca los dias. Revisar `CalendarCard.tsx` y
   `dashboard-data.ts` y marcar los dias con el punto de 6.10.
3. Tabs de Recordatorios se parten en dos lineas: resolver con 6.2 y 6.3.

## 10. Verificacion (todo debe pasar)

1. `./node_modules/.bin/astro check` en `frontend/`: 0 errores.
2. `node check-i18n.cjs`: pasa, y paridad de claves es/en.
3. Busquedas con 0 resultados en `frontend/src/components`, `pages`, `layouts`:
   `text-base`, `text-lg`, `text-3xl`, `text-7xl`, `text-\[`, `font-mono`,
   `tracking-wide`, `italic`, `font-bold`, `Zap`, `Sparkles`, `Rocket`, `" p-3 "`
   en contenedores, `rounded-sm`.
4. En `i18n/*.json`: 0 resultados para `!`, `—`, `UTC`, `IANA`, `backend`, `Fernet`,
   `localStorage`.
5. Mirar en el panel del navegador (sesion ya iniciada, `http://localhost:4338`) en light
   y dark: `/dashboard/`, `/persons/`, `/persons/<id>/` con sus 5 tabs, `/reminders/`,
   `/tags/`, `/favorites/`, `/settings/` con sus tabs, `/login/` no (no cerrar sesion).
   Sin errores nuevos en consola.
6. Reporte: archivos tocados, resultado de cada verificacion, decisiones no cubiertas.
