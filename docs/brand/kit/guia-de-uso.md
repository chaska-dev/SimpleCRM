# Simple CRM - guia de uso del logo (compacta)

## 1. El logo
- **Idea**: anillos que comparten el mismo suelo alrededor de un nucleo protegido: los circulos de cercania (tu circulo intimo, tus amigos, tus conocidos), ordenados y a resguardo.
- **Versiones**: horizontal (principal), vertical (stacked), simbolo y solo nombre (wordmark).
- **Dos dibujos del simbolo**: el completo (tres elementos) y el **recorte pequeno** (un anillo + nucleo). La app, los lockups (horizontal y vertical, incluida la cabecera del README) y todos los iconos (favicon, sidebar, PWA, apple-touch-icon, maskable, `app-icon-*`) usan siempre el recorte pequeno. El simbolo completo (`symbol-*.svg`) queda solo como archivo maestro. Nunca escales el completo a 16 px.
- **Limitacion aceptada**: el favicon, el `theme_color` y el manifest llevan el rosa de marca fijo (`#db2777`); no siguen el acento que elija el usuario.
- **Colores de archivo**: `-color` y `-mono-db2777` (rosa `#db2777`, identicos: el logo es de un solo color), `-black`, `-white` (invertido, ya adelgazado) y `currentColor` (para la app).

| Necesito... | Archivo |
|---|---|
| Cabecera, login, README | `lockup-horizontal-{color,black,white}.svg` |
| Formato cuadrado / portada | `lockup-stacked-*.svg` |
| Avatar, sidebar, icono en UI | `symbol-small-*.svg` (en la app siempre el recorte pequeno); `symbol-*.svg` es solo archivo maestro |
| Dentro de la app, con el acento del usuario | `symbol-small-currentColor.svg` |
| Pestana del navegador | `web-icons/favicon.ico`, `web-icons/favicon.svg` |
| Icono de app / PWA | `app-icon-pink.svg`, `app-icon-dark.svg`, `web-icons/*.png` |

## 2. Espacio libre
Deja alrededor del logo un margen minimo de **x**, donde x = 1/6 de la altura del simbolo (37 de 224 unidades). Es proporcional: se escala con el logo, nunca es una distancia fija. En el lockup horizontal la separacion simbolo-nombre ya esta fijada; no la cambies.

## 3. Tamanos minimos
| Version | Pantalla | Impresion |
|---|---|---|
| Horizontal | 160 px de ancho | 35 mm de ancho |
| Vertical (stacked) | 140 px de ancho | 30 mm de ancho |
| Solo nombre | 120 px de ancho | 28 mm de ancho |
| Simbolo completo (maestro) | 32 px | 8 mm |
| Recorte pequeno | 16 px | 5 mm |

## 4. Color
| Nombre | HEX | RGB | CMYK (aprox.) | Pantone |
|---|---|---|---|---|
| Rosa de marca (acento por defecto) | `#db2777` | 219, 39, 119 | 0, 82, 46, 14 | sin asignar (verificar con prueba impresa) |
| Fondo oscuro | `#0b0b0e` | 11, 11, 14 | negro rico a definir con la imprenta | - |
| Blanco | `#ffffff` | 255, 255, 255 | 0, 0, 0, 0 | - |

El CMYK es una conversion matematica, no una prueba de color: pedir prueba antes de imprimir. En la app el simbolo hereda el acento que elija el usuario (`currentColor`); el rosa es el color por defecto de marca.

**Pares aprobados** (contraste medido):

| Logo | Fondo | Contraste |
|---|---|---|
| Rosa `#db2777` | blanco `#ffffff` | 4.6:1 |
| Rosa `#db2777` | oscuro `#0b0b0e` | 4.28:1 (vale para simbolo y titulos grandes; no usar el rosa para texto pequeno sobre oscuro) |
| Blanco (adelgazado) | rosa `#db2777` | 4.6:1 |
| Blanco (adelgazado) | oscuro `#0b0b0e` | 19.65:1 |
| Negro | blanco | 21:1 |

Sobre fotos o fondos con dibujo: usa la version blanca o negra sobre una zona calmada, o el icono en su cuadrado redondeado.

## 5. Tipografia
- El nombre "Simple CRM" del logo es un dibujo propio (monolinea geometrica, trazados): **no se escribe con una fuente**. Usa siempre los archivos.
- Texto de la interfaz: la tipografia de la app; esta guia no impone otra.

## 6. Que no hacer
- No estires ni deformes; no gires.
- No recolorees fuera de la paleta ni pongas el rosa sobre rosa o rojo.
- No anadas sombras, bordes, degradados ni efectos.
- No uses el simbolo completo en lockups ni iconos, ni por debajo de 32 px: usa el recorte pequeno.
- No separes ni reordenes las partes de un lockup.
- No lo coloques sobre fondos con mucho detalle sin contenedor.
- No uses la version negra o de color sobre fondo oscuro: usa la blanca (esta adelgazada para compensar la irradiacion).
- No reescribas el nombre con una fuente.

## 7. Masters y cambios de nombre
Los masters (negro, normal y adelgazado) estan en `docs/brand/kit/masters/`. Si la app se renombra, el simbolo sigue siendo valido; el lockup y el wordmark habria que redibujarlos.
