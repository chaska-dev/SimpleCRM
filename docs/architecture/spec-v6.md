# Spec v6 — Conexion MCP simple, importar/exportar contactos y README en ingles

Fecha: 2026-11-03
Aplican: style-spec v2 + v2.1, reglas comunes de spec-v3, i18n/tema de spec-v4.
Reglas comunes: sin emojis; todo texto de UI por i18n (es + en, mismas claves); tuteo;
owner scoping en todo endpoint; tests para cada endpoint nuevo; no tocar puertos 8000/4321.

## J. Conectar un agente MCP en 3 pasos (Ajustes > Integraciones)

Hoy hay que armar a mano la URL (fija en `MCP_HTTP_URL=127.0.0.1:8010`, que no sirve en Docker),
el token solo se ve una vez y la config principal es stdio. Objetivo: URL + token visibles en
Ajustes, copiar un bloque listo para el cliente y listo.

### Backend (`crm_mcp`)
- `ApiToken.token_enc = EncryptedTextField(blank=True, default="")` (migracion). Al crear un
  token se guarda el valor completo cifrado (ademas del hash actual, que sigue siendo lo que se
  usa para autenticar).
- `GET /api/mcp/tokens/<id>/reveal/` -> `{token}` solo del dueno, 404 si esta revocado o si
  `token_enc` esta vacio (tokens viejos). El serializer de lista agrega `can_reveal: bool`.
  Revelar no requiere nada mas que la sesion (quien tiene sesion ya puede crear tokens).
- `ConfigView` devuelve `{"public_url": <MCP_PUBLIC_URL o null>, "stdio": {project_dir, python,
  manage_py}}`. Nuevo env `MCP_PUBLIC_URL` (default vacio); `MCP_HTTP_URL` queda como alias
  leido si `MCP_PUBLIC_URL` no esta. `stdio` solo se incluye si `request.user.is_staff` o si
  `settings.DEBUG`.
- Verificar que `/mcp/` acepta `Authorization: Bearer <token>` con y sin barra final bajo uvicorn
  y detras de Caddy (`X-Forwarded-*`), y que `allowed_hosts` del SDK no bloquea el host con
  el que entra el usuario (IP de LAN incluida). Si `ALLOWED_HOSTS` contiene `*`, desactivar la
  validacion de host del SDK. Test.

### Desarrollo local
- `frontend/astro.config.mjs`: proxy `/mcp` al mismo target que `/api`.
- Backend: correr con uvicorn
  (`backend/.venv/Scripts/python.exe -m uvicorn crm_backend.asgi:application --host 127.0.0.1
  --port 8010 --app-dir backend`), mismo env. Verificar que `/api/` y `/mcp/` responden.

### Frontend (`IntegrationsTab.tsx`, reescritura del layout)
Orden de la pestana:
1. Interruptor "Permitir acceso de agentes de IA" (como hoy). Si esta apagado, lo demas se
   muestra deshabilitado con una linea que explica que hay que activarlo.
2. Tarjeta "Conexion":
   - **URL del servidor**: `config.public_url` si existe, si no `window.location.origin + "/mcp/"`.
     Campo de solo lectura + boton Copiar.
   - **Token**: selector del token a usar (solo tokens activos con `can_reveal`), valor
     enmascarado (`scrm_••••••••` con el prefijo real) + botones Mostrar y Copiar (piden
     `/reveal/` la primera vez y lo guardan en memoria del componente, nunca en localStorage).
     Si no hay ninguno: boton "Generar token" que crea uno con nombre "Agente IA" y permisos
     read + write sin abrir modal, y lo deja seleccionado.
   - Boton **Probar conexion**: `fetch(url, {method: "POST", headers: {Authorization: "Bearer
     <token>", "Content-Type": "application/json", Accept: "application/json, text/event-stream"},
     body: initialize JSON-RPC})`. Muestra "Conectado: <serverInfo.name> <version>" o el error
     (401 token invalido, 403 MCP desactivado, red). Usar la misma forma de request que usan los
     tests del endpoint HTTP.
   - Aviso si el host es `localhost`/`127.0.0.1`: "Esta URL solo funciona en este equipo. Para
     conectar desde otro dispositivo, abre la app con la IP del equipo en tu red (por ejemplo
     http://192.168.1.20:8080) y publica el puerto en la red (ver README)."
3. Tarjeta "Configura tu cliente": pestanas con el bloque ya relleno con URL y token real
   (o `TOKEN` si aun no se revelo) y boton Copiar:
   - **Claude Code**: `claude mcp add --transport http simple-crm <URL> --header "Authorization: Bearer <TOKEN>"`
   - **Claude Desktop** (`claude_desktop_config.json`):
     `{"mcpServers":{"simple-crm":{"command":"npx","args":["-y","mcp-remote","<URL>","--header","Authorization:Bearer <TOKEN>"]}}}`
     y agregar `"--allow-http"` a args cuando la URL es `http://` y el host no es localhost.
     Una linea con donde vive el archivo en Windows y macOS.
   - **Cursor**: `{"mcpServers":{"simple-crm":{"url":"<URL>","headers":{"Authorization":"Bearer <TOKEN>"}}}}`
   - **VS Code** (`.vscode/mcp.json`): `{"servers":{"simple-crm":{"type":"http","url":"<URL>","headers":{"Authorization":"Bearer <TOKEN>"}}}}`
   - **Otro**: URL + cabecera `Authorization: Bearer <TOKEN>` (Streamable HTTP).
4. Tarjeta "Tokens": lista actual (nombre, prefijo, permisos, ultimo uso, revocar) + "Nuevo
   token" con el modal actual (nombre + permisos). Tras crear, queda seleccionado en "Conexion".
5. `<details>` "Avanzado: mismo equipo por stdio" con la config stdio actual, solo si
   `config.stdio` viene.
- Link a "Actividad de IA" como hoy.

## K. Importar y exportar contactos (vCard y Google CSV)

Formatos: vCard `.vcf` (2.1 de Android con QUOTED-PRINTABLE, 3.0 de iPhone/iCloud/Google, 4.0)
y Google Contacts CSV (formato actual "First Name, Last Name, ... Phone 1 - Value" y el antiguo
"Given Name, Family Name, ..."). Dependencia: `vobject` (agregar a requirements.txt con version
fija). Si vobject no decodifica bien 2.1 QP, pre-decodificar esas lineas antes de parsear.

### Backend (`crm`, modulo nuevo `crm/importexport.py` + vistas)
- Mapeo vCard -> modelo:
  - `N`/`FN` -> first_name/last_name (si solo hay FN, partir en el primer espacio).
  - `NICKNAME` -> nick_name; `ORG` -> company; `TITLE` -> role.
  - `TEL`: CELL/HOME/VOICE sin WORK -> personal_phone; WORK -> work_phone. Label = tipo original.
  - `EMAIL`: WORK -> work_email; resto -> personal_email.
  - `URL`/`X-SOCIALPROFILE`: por dominio -> instagram, facebook, x, linkedin, telegram; resto other.
  - `BDAY` (`YYYY-MM-DD`, `YYYYMMDD`, `--MMDD`, `--MM-DD`; anio 1604 de Apple = sin anio) ->
    ImportantDate kind birthday, recurrence yearly, `birth_year` si hay anio. 29-feb permitido.
  - `NOTE` -> Note (cifrada por el modelo). `ADR` -> se agrega como texto a esa nota.
  - `CATEGORIES` -> tags (si el usuario lo elige). `PHOTO` se ignora.
- Mapeo Google CSV: mismas reglas por columna; `Labels` ("* myContacts ::: Amigos") -> tags
  ignorando `* myContacts`; `* starred` -> favorite.
- Duplicados (por dueno): mismo telefono normalizado (solo digitos, comparar los ultimos 9) o
  mismo email (minusculas); si no, mismo nombre completo sin mayusculas ni tildes.
- `POST /api/persons/import/preview/` multipart `file`: detecta formato por extension y
  contenido. No escribe. Responde `{format, total, new, duplicates, errors: [{row, message}],
  rows: [primeras 50: {row, name, company, phones, emails, birthday, duplicate_of: {id, name}|null}]}`.
  Limites: 5 MB, 5000 contactos -> 400 claro.
- `POST /api/persons/import/` multipart `file` + `duplicates` (`skip` | `merge` | `create`,
  default skip) + `tag` (nombre opcional, se crea si no existe) + `import_labels` (bool). En
  `transaction.atomic`. `merge` agrega contactos/fechas/nota que falten a la persona existente,
  nunca borra ni sobreescribe campos con valor. Todo con `created_via="import"`. Responde
  `{created, merged, skipped, errors}`.
- `GET /api/persons/export/?format=vcf|google_csv&tag=<id>&include_notes=0|1`: descarga
  (`Content-Disposition: attachment; filename="simple-crm-contacts-YYYY-MM-DD.vcf|.csv"`).
  vCard 3.0, UTF-8, CRLF, lineas plegadas a 75 octetos: N, FN, NICKNAME, ORG, TITLE,
  TEL;TYPE=CELL / WORK, EMAIL;TYPE=HOME / WORK, URL, BDAY (`--MMDD` si no hay anio),
  CATEGORIES (tags), NOTE solo si include_notes. Google CSV con las columnas que Google acepta al
  importar (incluir Labels con los tags).
- `GET /api/persons/<id>/vcard/`: una persona en vCard 3.0.
- Tests con fixtures reales en `crm/tests_importexport.py`: vCard 2.1 QP con tildes, 3.0 de
  iPhone con BDAY 1604, 4.0, CSV de Google nuevo y antiguo, duplicados skip/merge/create,
  owner scoping, limites, ida y vuelta (export -> import da los mismos datos).

### Frontend
- Ajustes: nueva pestana "Importar y exportar" (`ImportExportTab.tsx`), despues de "Valores por
  defecto".
  - **Importar**: zona para soltar o elegir archivo (`.vcf,.csv`). Debajo, ayuda corta de donde
    sacar el archivo: Android (Contactos > Exportar a .vcf), iPhone (icloud.com/contacts >
    Exportar vCard), Google (contacts.google.com > Exportar > vCard o Google CSV). Al elegir
    archivo llama a preview y muestra: resumen (nuevos, duplicados, errores), tabla de los
    primeros 50 (nombre, empresa, telefono, email, cumpleanos, marca "Duplicado de X"),
    opciones: que hacer con duplicados (saltar / completar / crear igual), etiqueta para lo
    importado (default "Importado <fecha local>", se puede borrar), "Importar etiquetas del
    archivo". Boton "Importar N contactos". Al terminar: resumen y link a Personas.
  - **Exportar**: formato (vCard: celular, iCloud, Outlook / Google CSV), alcance (todas o una
    etiqueta), "Incluir notas" (apagado por defecto, con aviso de que las notas salen sin
    cifrar), boton Descargar (via `apiFetchBlob`).
- Personas (lista): boton secundario "Importar" junto a "Nueva persona" que lleva a
  `/settings/?tab=import`. La pestana se abre desde ese query param.
- Detalle de persona: accion "Descargar vCard" en su menu de acciones.

## L. README en ingles y corto

- `README.md` en ingles, maximo ~120 lineas: logo (`<picture>` actual), una frase, features
  (8 bullets), Quick start con Docker (4 comandos), Configuration (tabla con 6 variables
  principales + link), Connect an AI agent (3 pasos: activar, copiar URL + token, pegar bloque;
  link a docs/architecture/mcp.md), Import and export contacts (2-3 lineas), Development (corto,
  link), Security (3 bullets + links), License.
- Lo que se saca se mueve a `docs/` en ingles: `docs/configuration.md` (tabla completa de
  variables, exponer en red/TLS, actualizar/detener/borrar datos) y `docs/development.md`
  (desarrollo local, tests, estructura del repo). Links desde el README.
- Comandos verificados contra los archivos reales. Sin emojis, sin badges externos.
- Actualizar `docs/architecture/mcp.md` con el flujo nuevo (URL + token desde Ajustes).
