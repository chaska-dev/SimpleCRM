# Simple CRM - kit de logo (concepto B, Circulos)

Producido con la skill `logo-design` (fase "Build the kit"). Concepto elegido: **Circulos**.

## Contenido
- `masters/` - masters en negro: `symbol`, `symbol-small`, `lockup-horizontal`, `lockup-stacked`, `wordmark` y sus versiones `-thin` (para invertido), mas variantes rosa para el tablero. Son archivos de trabajo: sus lockups conservan el simbolo completo; los lockups publicados (`lockup-*-*.svg`) usan el recorte pequeno.
- `symbol-*`, `symbol-small-*`, `lockup-horizontal-*`, `lockup-stacked-*`, `wordmark-*` en `color`, `black`, `white`, `mono-db2777`. `color` y `mono-db2777` son identicos (logo de un solo color).
- **Recorte pequeno en todo lo publicado**: los `lockup-horizontal-*`, `lockup-stacked-*` y `app-icon-*` llevan el recorte pequeno (un anillo + nucleo, la geometria de `symbol-small-*`), igual que la app. `symbol-*.svg` (simbolo completo, dos anillos + nucleo) queda solo como archivo maestro.
- `symbol-currentColor.svg`, `symbol-small-currentColor.svg` - un solo `<path fill="currentColor">` para tintar con el acento de la app.
- `app-icon-pink.svg`, `app-icon-dark.svg` - icono sobre cuadrado redondeado (fondo `#db2777` con simbolo blanco; fondo `#0b0b0e` con simbolo rosa), con el recorte pequeno.
- `web-icons/` - `favicon.ico` (16/32/48), `favicon.svg`, `favicon-16/32/48.png`, `apple-touch-icon.png`, `icon-192/512.png`, `maskable-512.png`, `site.webmanifest`, `head-snippet.html`, y `dark/` con las mismas versiones sobre `#0b0b0e`.
- `presentation/` - tablero (`slide-01..05.png`, `board.html`, `spec.json`) y `app-mockups.png` (sidebar de 24 px en tema oscuro y login en tema claro; mockup propio, porque el script no trae esos dos).
- `guia-de-uso.md` - guia de una pagina en espanol.
- Copia para la web: `frontend/public/brand/` (solo los archivos que necesita la app).

## El problema de 16 px (diana/onda)
El simbolo completo (dos anillos + nucleo) a 16 px se leia como diana u ojo porque los huecos entre anillos se cierran. Solucion: **recorte pequeno** dedicado (`symbol-small`): un solo anillo grueso (32/256) y un nucleo apoyado en el mismo suelo. Quedan dos formas, el hueco superior es grande y se lee "circulo que protege un punto", no diana. Regla: en la app y en todos sus iconos (favicon, sidebar, PWA, apple-touch-icon, maskable) se usa siempre el recorte pequeno. Los lockups (incluida la cabecera del README) y los iconos de app tambien llevan el recorte pequeno; el simbolo completo (`symbol-*.svg`) queda solo como archivo maestro.

## Invertido adelgazado
Blanco sobre oscuro o rosa parece mas pesado (irradiacion). Las versiones `-white` (y los `app-icon-*`) salen de masters `-thin`: anillos 24 a 23 y nucleo 38 a 37.5 (simbolo completo, solo maestro); anillo 32 a 30 y nucleo 54 a 52 (recorte); trazo del wordmark 18 a 17 y horizontales 16 a 15 (~5 %). El rosa sobre `#0b0b0e` (icono oscuro y tablero) tambien usa el adelgazado.

## Auditoria
`svg_audit.py` sobre 34 SVG (kit y masters; los 2 masters rosa del tablero son recolores y no se auditaron aparte): 0 FAIL, 0 WARN, puntuacion 100/100 (`app-icon-pink` 99: solo INFO "on-tile", esperado). Sin `<text>`, rasters, filtros, degradados ni trazos. Contraste (con `--bg`): sin avisos de bajo contraste; ratios exactos en la guia.

## Checklist final (process.md seccion 7)
- Sin anclas sobrantes ni trazados abiertos: ok (audit).
- Angulos exactos: diagonales de la M a 70 grados, pata de la R a 75 grados.
- Texto a contornos, sin rasters ni filtros: ok.
- Trazos expandidos a rellenos: ok.
- Formas fusionadas: el simbolo son anillos y discos disjuntos; las letras del wordmark se solapan dentro de un mismo `<path>` (regla nonzero, mismo sentido de giro): union visual sin costura pero no booleana. Para plotter o bordado hay que hacer "Unir" en un editor vectorial (Inkscape no esta instalado aqui).
- viewBox ajustado: simbolo con 16 u de margen (recorte 8 u); lockup horizontal 1022x256. En los lockups el recorte pequeno se escala a 224 u de diametro (el alto del simbolo completo) y conserva centro, separacion con el wordmark y viewBox.
- Colores exactos: `#db2777`, `#0b0b0e`, `#ffffff`, `#000000`.
- Archivos de trabajo: en `masters/`.

## Snippet `<head>` (rutas bajo `/brand/`, archivos en `frontend/public/brand/`)
```html
<link rel="icon" href="/brand/favicon.ico" sizes="48x48">
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<link rel="manifest" href="/brand/site.webmanifest">
<meta name="theme-color" content="#db2777">
```

## Pendientes
- Busqueda de marca registrada e imagen inversa antes de uso publico.
- Pantone sin asignar; el CMYK es conversion matematica.
- Letras del wordmark dibujadas a mano, sin kerning optico final.
- El lockup `-white` mantiene el mismo lienzo que el normal aunque sus letras son ~1 % mas estrechas.
