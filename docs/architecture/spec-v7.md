# Spec v7 — Logo unico en README, transiciones de carga, recorte de imagenes y landing

Fecha: 2026-11-03
Aplican: style-spec v2 + v2.1, reglas comunes de spec-v3, i18n/tema de spec-v4, spec-v6.
Reglas comunes: sin emojis; todo texto de UI por i18n (es + en, mismas claves); tuteo;
`prefers-reduced-motion: reduce` desactiva toda animacion nueva; tests para backend nuevo;
no tocar puertos 8000/4321; sin commits salvo donde se indica.

## M. Logo: el README y el kit usan el recorte chico

El README muestra el lockup con el simbolo completo (dos anillos); la app usa el recorte chico
(un anillo + nucleo). Decision: todos los lockups del kit pasan a usar el recorte chico.
- Regenerar `docs/brand/kit/lockup-horizontal-{black,white,color,mono-db2777}.svg` y
  `lockup-stacked-{...}.svg` con la geometria de `symbol-small-*.svg` en lugar del simbolo
  completo, conservando el wordmark, proporciones, espaciado y viewBox ajustado al contenido.
  Mismo criterio para `app-icon-*.svg` si usan el simbolo completo.
- `symbol-*.svg` (completo) queda solo como archivo maestro; `guia-de-uso.md` y el README del kit
  lo dicen en una linea.
- `README.md` sigue apuntando a `lockup-horizontal-white/black.svg` (ahora con el recorte chico).
  Verificar que renderiza: solo `<path>`, sin `<text>` ni fuentes.

## N. Carga con skeleton y transiciones de 200 ms en todas las paginas

Problema: algunas vistas saltan de golpe a skeleton y de golpe al contenido.
- Nuevo `frontend/src/components/ui/LoadingSwap.tsx`:
  `<LoadingSwap loading={bool} skeleton={<.../>}>{content}</LoadingSwap>`.
  - El skeleton aparece solo si la carga dura mas de 120 ms (evita parpadeo en cargas rapidas)
    y entra con fade de 200 ms.
  - Al terminar: crossfade de 200 ms (skeleton sale, contenido entra con opacity 0->1 y
    translateY 4px->0, `ease-out`). Ambos apilados en la misma celda de grid durante la
    transicion para que no salte el alto.
  - Si la carga termina antes de los 120 ms, el contenido entra con el mismo fade de 200 ms
    sin mostrar skeleton.
- Clases utilitarias en `global.css` (o el css de skeleton existente): `.fade-in` (200 ms) para
  reutilizar en contenido que aparece despues de una accion (cambio de pestana, filtros).
- Aplicar en TODA vista que carga datos en cliente, cada una con un skeleton con la forma real
  de su contenido (reusar `ui/Skeletons.tsx`; crear los que falten):
  Personas (grid y lista), Favoritas, detalle de persona y cada pestana (Contacto, Fechas,
  Interacciones, Notas, Adjuntos, Instituciones), Instituciones (lista y detalle, pestanas
  Miembros y Archivos), Recordatorios (lista y tablero), Tags, Actividad de IA, Ajustes
  (Almacenamiento, Cifrado, Integraciones, Importar y exportar: lo que haga fetch), Inicio
  (si refresca en cliente, el refresco no debe mostrar skeleton: solo fade del contenido nuevo).
- Cambio de pestana (Ajustes, detalle de persona, detalle de institucion) y de vista
  (grid/lista, lista/tablero): el contenido nuevo entra con `.fade-in` 200 ms.
- Sin cambios de layout al terminar la carga: el skeleton debe ocupar aproximadamente lo mismo.

## O. Imagenes: vista previa, recorte y validacion

Aplica a: foto del usuario (Ajustes > Cuenta), foto de persona (detalle > Contacto, hoy dice
"pronto"), logo de institucion (formulario de institucion) e icono de la marca (Ajustes >
General). Formatos permitidos: PNG, JPEG, WEBP y GIF (animado incluido). Tamano maximo: el
limite actual de cada campo (si no hay, 5 MB).

### Frontend
- Dependencia `react-easy-crop` (version fija). Componente nuevo
  `frontend/src/components/ui/ImageCropModal.tsx`: recibe el `File`, muestra la imagen
  (los GIF se ven animados), recorte cuadrado 1:1 con zoom (slider) y arrastre, mascara
  redonda para foto de usuario y de persona, cuadrada para logo e icono. Botones Cancelar y
  Guardar. Vista previa en vivo del resultado al tamano real en que se usa (avatar chico y
  grande, o logo/icono del sidebar).
- Componente `ImagePicker` (o hook) compartido por los 4 lugares: abre el selector, valida
  antes de abrir el recorte y muestra el error en linea + toast:
  - tipo por MIME y por firma de bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `47 49 46 38`,
    WEBP `RIFF....WEBP`): si no coincide, "Este archivo no es una imagen PNG, JPG, WEBP o GIF."
  - tamano: "La imagen pesa X MB; el maximo es Y MB."
  - imagen que el navegador no puede decodificar: "No se pudo leer la imagen."
- Al guardar se envia el archivo ORIGINAL + el rectangulo de recorte en pixeles de la imagen
  original (`crop_x`, `crop_y`, `crop_w`, `crop_h`), no un canvas: asi los GIF conservan la
  animacion.
- Las imagenes ya subidas (Avatar, OrgLogo, icono del sidebar) entran con fade de 200 ms al
  terminar de cargar, sobre las iniciales o el placeholder; si fallan, quedan las iniciales.

### Backend
- Helper compartido `crm_backend/images.py` (o donde viva `validate_small_image`):
  `process_upload(file, crop, max_side=512)`:
  - valida con Pillow (formato real en PNG/JPEG/WEBP/GIF, limite de pixeles), 400 claro si no;
  - aplica el recorte (validar que el rectangulo cae dentro de la imagen; si no viene, recorte
    cuadrado centrado);
  - redimensiona a `max_side` como maximo;
  - GIF y WEBP animados: recorta y redimensiona cada cuadro conservando duracion, loop y
    transparencia (maximo 300 cuadros, si no 400);
  - devuelve el archivo procesado en el mismo formato.
- Usarlo en: avatar del usuario (`accounts`), icono de la marca, logo de institucion y la foto
  de persona.
- Foto de persona: si `Person` no tiene campo real, agregarlo como lo espera el frontend
  (`profile_photo`, referencia a un `Attachment` de esa persona, cifrado como los adjuntos, con
  `on_delete=SET_NULL`) y endpoints `POST /api/persons/<id>/profile_photo/` (multipart `file` +
  crop) y `DELETE` del mismo. El serializer de persona expone `profile_photo` (id). El Avatar ya
  sabe pintarlo por id; verificar.
- Tests: recorte correcto (tamano de salida), GIF animado conserva cantidad de cuadros, archivo
  que no es imagen da 400, rectangulo fuera de rango da 400, owner scoping de la foto de persona.

## P. Landing page (rama `landing`)

- Rama nueva `landing` creada desde `main`. Carpeta `landing/` con un sitio estatico (Astro en
  modo static, sin backend) listo para GitHub Pages; workflow
  `.github/workflows/landing.yml` que construye `landing/` y publica en Pages al hacer push a la
  rama `landing` (no se hace push en esta fase).
- Idiomas: espanol (`/`) e ingles (`/en/`), selector ES/EN arriba, `hreflang` y `lang` correctos.
- Secciones: cabecera con el logo (recorte chico) y boton "Ver en GitHub" /
  "View on GitHub" (`https://github.com/chaska-dev/SimpleCRM`); hero con una frase y dos
  botones (GitHub e Instalar); instalacion con los comandos reales y boton copiar
  (`git clone https://github.com/chaska-dev/SimpleCRM.git`, `cd SimpleCRM`,
  `python scripts/generate-secrets.py`, `docker compose --env-file .env.docker up -d --build`,
  abrir `http://127.0.0.1:8080`); "Levantamiento rapido" en 3 pasos; vista previa de la app con
  capturas reales (Inicio, Personas, Recordatorios en tablero, Integraciones MCP) en pestanas,
  en el idioma de la pagina, tema oscuro y una en claro; funcionalidades (6-8); MCP en 3 pasos;
  importar/exportar; pie con licencia "por definir" y link al repo.
- Estilo: los tokens de la app (oscuro por defecto, acento #db2777, Inter), sin rasgos tipicos de
  IA (sin blobs de gradiente, sin glassmorphism, sin emojis, sin iconos decorativos de relleno).
  Responsive a 375 px.
- Capturas a 1440x900 con deviceScaleFactor 2, tomadas de la app local (http://localhost:4338)
  con la cuenta demo, en `landing/public/screens/{es,en}/*.png` (optimizadas, WEBP o PNG
  comprimido).
