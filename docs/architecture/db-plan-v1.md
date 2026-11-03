# DB Plan v1 — SimpleCRM (Personal Relationship Manager)

**Estado:** Planeamiento cerrado — pendiente de aprobación para implementar.
**Stack:** Django 5.2 + DRF + **Postgres 16 (mandatory, sin fallback SQLite)** + Astro/React + Tailwind.
**Encripción:** `cryptography.fernet` sobre campos sensibles — **incluyendo attachments binarios**. Mismo `FIELD_ENCRYPTION_KEY` para todo lo cifrado.
**Dev DB:** Postgres 16 vía `docker-compose` (servicio `db`) — Django nativo conecta con `DB_HOST=localhost`. Sin SQLite en ningún ambiente.

> **Cambios respecto al draft inicial** (resumen ejecutivo; detalles en sus secciones):
>
> 1. Attachments son un modelo reusable con `GenericForeignKey` y se cuelgan de **Person, Note, Interaction e ImportantDate**. Cifrados con Fernet (mismo `FIELD_ENCRYPTION_KEY`).
> 2. `ImportantDate` reduce su enum `kind` a `{birthday, custom}`. Birthday gana `birth_year` (para mostrar edad). Todas las fechas aceptan `icon` (emoji), `icon_image` (foto), `attachment`.
> 3. `ContactInfo.type` deja de ser enum → `CharField` libre, con defaults largos en `settings.py` (incluyendo redes sociales).
> 4. **DB engine: Postgres 16 mandatory** — sin SQLite. Decidido porque el proyecto va a ser pesado y queremos tipos/índices más ricos en dev (para no sorprendernos en prod) y `JSONB`/`partial indexes` disponibles para v2.

---

## 1. Goal

CRM personal de uso individual. Tres problemas concretos que tiene que resolver:

1. **Trackear gente:** no perder el hilo de ninguna persona importante.
2. **No ser mala amiga / mal amigo:** acordarse de fechas (cumples, aniversarios, reuniones) y retomar contacto antes de que se enfríe.
3. **Memoria privada:** notas sobre personas, mensajes pendientes, ideas de regalo, archivos adjuntos — todo cifrado a nivel DB.

Lo que **NO** es v1: CRM de ventas, multi-tenant, multi-user, sharing con familia/amigos, búsqueda full-text sobre notas cifradas, OCR/transcripción de attachments.

---

## 2. Decisiones locked-in

| # | Decisión | Razón |
|---|---|---|
| D1 | Schema se llama `Person` (no `Contact`) | "Person" es la entidad; "Contact" pasa a ser un canal |
| D2 | Datos de contacto en tabla aparte `ContactInfo` (1:N) | Una persona tiene email + WhatsApp + LinkedIn + … los campos planos quedan cortos |
| D3 | Solo `Tag` en v1 (no `Category` aparte) | Redundante. Si después hace falta, se agrega `category` enum en Person |
| D4 | `Organization` + `PersonOrganization` → **v2** | v1 usa `Person.company` + `Person.role` como string |
| D5 | `cadence_days` + `last_contacted_at` en v1 | Sin esto es una agenda, no un PRM |
| D6 | `ImportantDate` separado de `Reminder` (anual recurrente sin hora vs one-shot con hora) | Modelan cosas distintas; UI distinta |
| D7 | `Interaction` aparte de `Note` (eventos con timestamp vs memoria atemporal) | "¿cuándo fue la última vez que hablé con X?" responde Interaction, no Note |
| D8 | **Cadencia es manual:** cada `Interaction` tiene `counts_as_contact: bool` | El usuario decide qué cuenta como "contacto" |
| D9 | **`ImportantDate` solo-lectura en dashboard** (no auto-genera Reminders) | Cero duplicación, sin ruido de filas |
| D10 | **Búsqueda v1:** nombre + tag + title/description de attachments. Notas/interacciones/person.how_we_met cifradas NO se buscan | Encripción a nivel DB se preserva. Búsqueda full-text → v2 |
| D11 | **Timezone:** `USE_TZ=True`, conversión en front | Soporta DST Chile (UTC-3/UTC-4) |
| D12 | Reminder completado con contacto linked → **auto-crea `Interaction`** si `recur=yearly`; prompt en otros casos | Flow natural "ya hice lo que me acordé" |
| D13 | Recurrencia anual de Reminder **sin tope** | Cero mantenimiento. Editable si pasa caso degenerado |
| D14 | Persona con `cadence_days` seteado sin interactions → dashboard muestra **"iniciar relación"** | Es la primera vez, no es deuda |
| D15 | `last_contacted_at` admite **override manual** además del auto-derivado | A veces sabés que hablaste pero no querés registrar la interaction con detalle |
| D16 | `last_contacted_at` inicial es `null` cuando se setea `cadence_days` | "Empecé a trackear" ≠ "hoy contacté" |
| D17 | CASCADE sin papelera en v1 | v2 si se necesita soft-delete |
| D18 | Reminder sin contacto (nullable) — sigue permitido | "Renovar el carnet" no es contra una persona |
| D19 | **`Attachment` reusable con `GenericForeignKey`** — cuelga de Person, Note, Interaction e ImportantDate | Un modelo, una validación, una política de cifrado |
| D20 | **Attachments cifrados con Fernet** (mismo `FIELD_ENCRYPTION_KEY` que `Note.body`) | Postura de seguridad consistente. Si se compromete la DB o `media/`, los archivos siguen cifrados |
| D21 | **`ContactInfo.type` libre** (CharField) con defaults largos en `settings.CONTACT_TYPE_SUGGESTIONS` (incluye redes sociales) | Defaults cubren el 90% de los casos, el usuario puede agregar custom |
| D22 | `ImportantDate.kind` reducida a `{birthday, custom}`. Birthday gana `birth_year` para cálculo de edad. Todo ImportantDate tiene `icon` (emoji), `icon_image` (foto opcional), `attachment` (opcional) | El usuario controla título/icon/foto para casos no-birthday. Birthday mantiene semántica especial (edad, recurrencia anual automática) |
| D23 | **Postgres 16 mandatory** — sin SQLite en dev ni prod. Settings siempre lee `DB_*` env vars. Si falta una, error en boot (no degradación silenciosa) | El proyecto va a ser pesado, queremos `JSONB` / partial indexes / `UniqueConstraint` con condition disponibles desde dev. Tests corren contra Postgres (no SQLite) para no esconder bugs de engine |
| D24 | **`Person.profile_photo`** OneToOne → `Attachment`, on_delete=SET_NULL, nullable | Para PFP reusando el sistema Attachment (cifrado + quota + MIME whitelist). El OneToOne permite reemplazar la foto eliminando la fila anterior; mantiene consistencia con notas/dates/interactions que también aceptan archivos via GenericForeignKey |

---

## 3. Schema v1

### 3.1 Diagrama relacional

```
                  ┌──────────┐
                  │   USER   │  (django.auth.User)
                  └─────┬────┘
                        │ 1:N (owner)
                        ▼
┌────────────────────────────────────────────────────────────┐
│                          PERSON                            │
│  owner_id, first_name, last_name, nick_name                │
│  company, role                                            │
│  how_we_met_enc, relationship_strength (1-5)              │
│  cadence_days (int, nullable)                             │
│  last_contacted_at (datetime, nullable)                    │
│  created_at, updated_at                                    │
└──┬──────────┬────────────┬───────────────┬───────────┬─────┘
   │ 1:N      │ 1:N        │ 1:N           │ 1:N       │
   ▼          ▼            ▼               ▼           │
┌────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐         │
│CONTACT │ │IMPORTANT│ │ REMINDER │ │   NOTE   │         │
│ INFO   │ │  DATE   │ │          │ │          │         │
│        │ │         │ │          │ │          │         │
│type    │ │kind     │ │title     │ │body_enc  │         │
│value   │ │birth_yr │ │remind_at │ │category  │         │
│label   │ │title    │ │recur     │ └──────────┘         │
└────────┘ │icon     │ │lead_min  │                       │
           │icon_img │ │msg_enc   │ ◀─── cambia Person ───│
           │date     │ │completed │                       │
           │attach?  │ │person?   │                       │
           └─────────┘ └─────┬────┘                       │
                            │ trigger                     │
                            ▼                             │
                      ┌────────────┐                      │
                      │INTERACTION │                      │
                      │            │                      │
                      │kind        │                      │
                      │occurred_at │                      │
                      │channel     │                      │
                      │body_enc    │                      │
                      │counts_as_  │                      │
                      │ contact    │                      │
                      └────────────┘                      │
                                                         │
              ┌──────────────┐  GenericForeignKey        │
              │  ATTACHMENT  │◀───────────────────────── Person
              │              │◀───────────────────────── Note
              │ title        │◀───────────────────────── ImportantDate
              │ description  │◀───────────────────────── Interaction
              │ file (enc)   │   owner + ctype + obj_id
              │ original_fn  │
              │ mime_type    │
              │ size_bytes   │
              │ uploaded_at  │
              └──────────────┘

              ┌──────────┐
              │   TAG    │  M2M con Person, owner-scoped
              └──────────┘
```

### 3.2 Definición de tablas

#### `accounts.User` (extendido — campos nuevos)

Hereda de `django.contrib.auth.models.AbstractUser`. Login por email.
Campos ya provistos por AbstractUser que usamos: `username`, `email`,
`password` (hash), `first_name`, `last_name`, `is_active`, `is_staff`,
`is_superuser`, `last_login`, `date_joined`.

**Campos nuevos (v1.5 / frontend):**

| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `preferred_lang` | `CharField(max_length=5)` | `"es"` | `es` / `en`. Sincronizado opcional desde front localStorage |
| `preferred_theme` | `CharField(max_length=10)` | `"light"` | `light` / `dark` |
| `avatar` | `OneToOneField(crm_attachment.Attachment, on_delete=SET_NULL, null=True, blank=True)` | null | PFP del usuario. Reusa Attachment (cifrado + quota + MIME whitelist). Solo uno por usuario |

`first_name` y `last_name` siguen siendo editables vía `PATCH /api/auth/me/`.

> **Nota de scope:** estos campos NO entran en la migración `0002_v1_schema`
> porque son del `frontend-plan`. Migración posterior `0003_user_ui_fields`
> los agrega en un PR aparte (PR-A infra).

#### `crm.Person` (rename de `Contact` + nuevos campos)
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `owner` | FK → User | required | CASCADE |
| `first_name` | CharField(100) | required | |
| `last_name` | CharField(100) | "" | |
| `nick_name` | CharField(50) | "" | Búsqueda por LIKE |
| `company` | CharField(200) | "" | |
| `role` | CharField(150) | "" | "PM", "diseñador", etc. String libre |
| `how_we_met_enc` | EncryptedTextField | "" | Texto libre sobre cómo se conocieron |
| `relationship_strength` | SmallIntegerField(choices=[(i,i) for i in range(1,6)]) | 3 | 1=muy lejano, 5=muy cercano |
| `cadence_days` | PositiveIntegerField | null | "Contactar cada N días" |
| `last_contacted_at` | DateTimeField | null | Auto-derivado + override manual |
| `tags` | M2M → Tag | "" | |
| `profile_photo` | OneToOneField(`Attachment`, on_delete=SET_NULL, null=True) | null | Foto de perfil (PFP). Reusa el sistema Attachment (cifrado + quota + MIME whitelist). Solo 1 por persona; cambiar = reemplazar fila + borrar el attachment viejo |
| `created_at`, `updated_at` | DateTimeField | auto | |

**Indexes:** `(owner, last_name)`, `(owner, last_contacted_at)`.

#### `crm_attachment.Attachment` (nuevo, D19 + D20)
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `owner` | FK → User | required | CASCADE; siempre presente para ownership scoping |
| `title` | CharField(150) | required | Plain text, buscable en v1 |
| `description` | TextField | "" | Plain text opcional, buscable en v1 |
| `file_enc` | EncryptedFileField | required | Cifrado con Fernet (mismo `FIELD_ENCRYPTION_KEY`); vive en `media/attachments/{owner_id}/` |
| `original_filename` | CharField(255) | "" | Para el download (la extensión revela el MIME) |
| `mime_type` | CharField(80) | "" | Para validación y UI |
| `size_bytes` | PositiveBigIntegerField | 0 | Para validación de quota |
| `uploaded_at` | DateTimeField | auto | |
| `subject_type` | FK → ContentType | required | Para GenericForeignKey |
| `subject_id` | PositiveBigIntegerField | required | Para GenericForeignKey |

**Constraints / meta:**
- `EncryptedFileField` propio (en `crm/fields.py`, ver §4.4). Subclase de `models.FileField` que cifra al `save()` y descifra al `_open()`.
- Whitelist de MIME en `settings.ATTACHMENT_ALLOWED_MIMES` (default: pdf, txt, md, doc/docx, xls/xlsx, ppt/pptx, jpg/png/gif/webp, mp3/mp4/wav/m4a/ogg). NO `.exe`, `.bat`, `.dll`, `.sh`.
- Tamaño máximo en `settings.ATTACHMENT_MAX_BYTES` (default: 25 MB).
- `GenericForeignKey('subject_type', 'subject_id')` con `GenericRelation` reverso en cada modelo "sujeto".
- **Indexes:** `(owner, -uploaded_at)`, `(subject_type, subject_id)`.
- **Quota:** sum(size_bytes) por owner < `settings.ATTACHMENT_USER_QUOTA_BYTES` (default 500 MB). Validar en serializer pre_save.

#### `crm.ContactInfo` (refactor: type libre)
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `person` | FK → Person | required | CASCADE, related_name="contacts_info" |
| `type` | CharField(80) | required | Libre. Defaults pre-rellenados en `settings.CONTACT_TYPE_SUGGESTIONS` (ver §4.5) |
| `value` | CharField(200) | required | Validación regex opcional para email/phone |
| `label` | CharField(50) | "" | "trabajo", "personal", "de mi vieja" |

**Indexes:** `(person, type)`.

#### `crm.ImportantDate` (refactor importante, D22)
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `person` | FK → Person | required | CASCADE |
| `kind` | enum | "custom" | **Reducido a `birthday` / `custom`** |
| `birth_year` | PositiveIntegerField | null | Solo si `kind=birthday`. Permite mostrar "Marce turns 32" |
| `title` | CharField(120) | template por kind | Birthday default "Cumple de {first_name}"; custom: lo que escriba el usuario |
| `description` | TextField | "" | Detalle largo |
| `icon` | CharField(8) | por kind | Birthday: emoji de torta por default; custom: emoji de calendario |
| `icon_image` | ImageField | null | Foto alternativa al emoji (no cifrada — ver §4.4) |
| `date` | DateField | required | Para birthday: día+mes (sin año, el año va en `birth_year`) |
| `recurrence` | enum | "yearly" | `none` o `yearly` (v1) |
| `attachment` | FK → Attachment (nullable) | null | PDF, audio, lo que sea; cifrado como cualquier Attachment |

**Indexes:** `(person, kind)`, `(person, date)`.

> **Nota:** `icon_image` no está cifrado porque es solo display (lo usa el navegador directamente como `src=`). Si te importa que la foto también esté cifrada, decime y lo refactorizo a un `Attachment` regular. Por ahora queda plano.

#### `crm.Reminder` (extensión del actual)
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `owner` | FK → User | required | |
| `person` | FK → Person | null | FK opcional — recordatorios genéricos ("renovar el carnet") |
| `title` | CharField(200) | required | |
| `remind_at` | DateTimeField | required | UTC (USE_TZ=True) |
| `recur` | CharField(choices=RECUR_CHOICES) | "none" | none/yearly/monthly/weekly |
| `lead_minutes` | PositiveIntegerField | 0 | Avisame N minutos/horas/días antes (front lo convierte) |
| `message_enc` | EncryptedTextField | "" | Renombrar de `message` |
| `completed` | BooleanField | False | |

**Indexes:** `(owner, completed, remind_at)`.

#### `crm.Interaction` (nuevo)
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `person` | FK → Person | required | CASCADE |
| `kind` | CharField(choices=INTERACTION_KINDS) | required | call/message/email/meeting_in_person/video_call/gift/note_shared/other |
| `occurred_at` | DateTimeField | required | UTC |
| `channel` | CharField(100) | "" | "WhatsApp", "presencial", "Discord" |
| `body_enc` | EncryptedTextField | "" | Contenido, encriptado |
| `counts_as_contact` | BooleanField | False | D8 — el usuario decide manualmente |

**Indexes:** `(person, -occurred_at)`.

**Signal post_save:** actualiza `Person.last_contacted_at` al MAX si `counts_as_contact=True`.

#### `crm.Note` (extensión del actual)
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `person` | FK → Person | required | Renombrar de `contact` a `person` |
| `body_enc` | EncryptedTextField | required | |
| `category` | CharField(choices=NOTE_CATEGORIES) | "general" | general/followup/gift_idea/important |

#### `crm.Tag` (ya está, sin cambios)
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `owner` | FK → User | required | |
| `name` | CharField(50) | required | |
| `color` | CharField(7) | "#7c3aed" | Hex |
| `created_at` | DateTimeField | auto | |

**Constraint:** `UniqueConstraint(owner, name)`.

---

## 4. Behavioral rules

### 4.1 Cadencia (D5, D8, D14-D16)

Mismas reglas que el draft anterior:

- Una persona con `cadence_days=N` muestra 4 estados en la dashboard: **OK**, **Por vencer**, **Vencida** (rojo), **Iniciar relación** (`counts_as_contact` nunca marcada + `cadence_days` seteado).
- Solo `Interaction.counts_as_contact=True` alimenta `last_contacted_at`.
- `last_contacted_at` admite override manual. El signal NO pisa el override si el nuevo valor sería menor.
- Cuando una `Interaction` con `counts_as_contact=True` se crea/borra, el signal recomputa `last_contacted_at = MAX(occurred_at where counts_as_contact=True)`.

### 4.2 ImportantDate (D6, D9, D22)

- **NO** auto-genera Reminders. La dashboard lee directamente `ImportantDate`, calcula `days_until` (considerando `recurrence`) y muestra los próximos 30 días.
- Si el usuario quiere "crear recordatorio 3 días antes", lo hace manual como Reminder (`recur=yearly`, `lead_minutes=4320`).
- **Birthday edge case:** `date.month/day` + `birth_year` opcional. Para calcular edad actual: año actual - birth_year (con ajuste por mes/día). Si `birth_year` es null, se muestra solo la fecha.
- **icon fallback:** si `icon_image` está seteado, el front usa la imagen. Si no, usa `icon`. Si no, default según kind (torta para cumpleaños, calendario para custom).

### 4.3 Reminder completado (D12)

- Si `person` está seteado y el usuario marca `completed=True`:
  - Si `recur=yearly`: auto-crea `Interaction(kind=call, occurred_at=now, counts_as_contact=True, body_enc="Recordatorio completado: <title>")`. **Establece `last_contacted_at = now`** para la persona.
  - Si `recur ∈ {none, monthly, weekly}`: muestra prompt al usuario "¿Contar como interaction?".

### 4.4 Encripción de attachments (D20)

- **`EncryptedFileField`** (nuevo) en `crm/fields.py`. Subclase de `models.FileField`:
  - `pre_save()` cifra el `bytes` del archivo con Fernet y guarda el ciphertext en disco.
  - `deconstruct()` / custom descriptor (`_open`): cuando el código accede a `attachment.file`, devuelve un `File`-like wrapper que descifra al leer.
  - `storage` por default: `FileSystemStorage` bajo `MEDIA_ROOT/attachments/{owner_id}/{uuid}.bin`.
- **Validaciones pre-save (en serializer):**
  - MIME ∈ `ATTACHMENT_ALLOWED_MIMES`
  - size_bytes ≤ `ATTACHMENT_MAX_BYTES` (default 25 MB)
  - quota total del owner ≤ `ATTACHMENT_USER_QUOTA_BYTES` (default 500 MB)
- **Thumbnails:** para imágenes, on-demand con `Pillow` descifrando → thumbnail → sirviendo (sin persistir). Cache en memoria con `cache_page` decorator en la view.
- **Backups:** `media/` debe estar encriptado a nivel filesystem en prod (LUKS, eCryptfs, ZFS) si el admin lo considera necesario — fuera del scope Django.

### 4.5 ContactInfo defaults (D21)

- En `backend/crm_backend/settings.py`:
  ```python
  CONTACT_TYPE_SUGGESTIONS = [
      {"key": "personal_phone", "label": "Celular personal",   "icon": "phone"},
      {"key": "personal_email", "label": "Correo personal",    "icon": "mail"},
      {"key": "work_phone",     "label": "Celular trabajo",    "icon": "briefcase"},
      {"key": "work_email",     "label": "Correo trabajo",     "icon": "mail"},
      {"key": "whatsapp",       "label": "WhatsApp",           "icon": "chat"},
      {"key": "telegram",       "label": "Telegram",           "icon": "plane"},
      {"key": "instagram",      "label": "Instagram",          "icon": "camera"},
      {"key": "linkedin",       "label": "LinkedIn",           "icon": "briefcase"},
      {"key": "discord",        "label": "Discord",            "icon": "gamepad"},
      {"key": "other",          "label": "Otro",               "icon": "link"},
  ]
  ```
- **Backend:** `ContactInfo.type` es `CharField(80)`, sin choices enum. Validación: max_length + no vacío.
- **Front:** al crear una persona, pre-rellena 10 filas con `type` seteado y `value=""`. El usuario completa las que quiere, borra las que no, agrega custom (key libre).

### 4.6 Búsqueda (D10)

- v1: `Person.first_name`, `Person.last_name`, `Person.nick_name` (SQL `ILIKE`), nombre de Tag, **y** `Attachment.title` + `Attachment.description` (plain text, ahora buscables).
- v1 NO busca en `Note.body_enc`, `Interaction.body_enc`, `Person.how_we_met_enc`. Listables al abrir el perfil, pero no indexados.
- Si más adelante hace falta full-text cifrado seguro: ver las opciones en el draft original §4.5 (SIV, índice separado, outsource). Todo v2.

### 4.7 Timezone (D11)

- `USE_TZ=True` en `settings.py`. Backend guarda UTC. Front convierte a local del usuario (Chile `America/Santiago`).

---

## 5. Migration plan (current → v1)

Una sola migración grande `0002_v1_schema.py` — no se fragmenta.

### 5.1 Schema operations

1. `RenameModel(Contact → Person)`.
2. `RenameField(Note.contact → Note.person)`.
3. `RenameField(Reminder.contact → Reminder.person)`.
4. `RenameField(Reminder.message → Reminder.message_enc)` (consistencia).
5. `AddField` en Person: `nick_name`, `how_we_met_enc`, `relationship_strength` (default 3), `cadence_days`, `last_contacted_at`.
6. `AddField` en Reminder: `recur` (default "none"), `lead_minutes` (default 0).
7. `AddField` en Note: `category` (default "general").
8. `CreateModel(crm_attachment.Attachment)`.
9. `CreateModel(crm.ContactInfo)` — nueva tabla.
10. `CreateModel(crm.ImportantDate)` — nueva tabla, con nuevos campos del refactor.
11. `CreateModel(crm.Interaction)` — nueva tabla.
12. `AddIndex` en Person: `(owner, last_contacted_at)`.
13. `AddIndex` en Interaction: `(person, -occurred_at)`.
14. `AddIndex` en ImportantDate: `(person, kind)`, `(person, date)`.
15. `AddIndex` en Attachment: `(owner, -uploaded_at)`, `(subject_type, subject_id)`.

### 5.2 Data migration (RunPython)

1. Mover emails existentes de `Contact.email` → filas `ContactInfo(type='personal_email', value=...)`.
2. Mover phones existentes de `Contact.phone` → filas `ContactInfo(type='personal_phone', value=...)`.
3. **Borrar campos** `Contact.email` y `Contact.phone` (ahora viven en ContactInfo).
4. Validar que `Reminder.contact` se renombró a `Reminder.person` (Django a veces no autodetecta).
5. Validar que `Note.contact` se renombró a `Note.person`.

### 5.3 Signal handlers (en `crm/signals.py`, no en migración)

```python
@receiver(post_save, sender=Interaction)
def update_last_contacted_at(sender, instance, **kwargs):
    if not instance.counts_as_contact:
        return
    person = instance.person
    last = (
        Interaction.objects
        .filter(person=person, counts_as_contact=True)
        .aggregate(Max("occurred_at"))["occurred_at__max"]
    )
    if last and (person.last_contacted_at is None or last > person.last_contacted_at):
        # update() no triggerea signals — evita loop
        Person.objects.filter(pk=person.pk).update(last_contacted_at=last)

@receiver(post_delete, sender=Interaction)
def recompute_last_contacted_on_delete(sender, instance, **kwargs):
    update_last_contacted_at(sender, instance)
```

### 5.4 Imports / renames en serializers y views

- `ContactSerializer` → `PersonSerializer`. Todos los campos nuevos.
- `ContactViewSet` → `PersonViewSet`.
- ViewSets nuevos: `ContactInfoViewSet` (nested), `ImportantDateViewSet` (nested), `InteractionViewSet` (nested), `NoteViewSet` (ya estaba, rename lookup), `AttachmentViewSet` (nested por subject_type).
- `ReminderViewSet`: agregar `recur`, `lead_minutes`, rename `contact` → `person`.

### 5.5 Admin (`crm/admin.py`)

- `PersonAdmin` reemplaza a `ContactAdmin`. Inlines: `ContactInfo`, `ImportantDate` (con `icon` y `icon_image` visibles), `Note`, `Interaction`.
- `ImportantDateAdmin` con preview del emoji + thumbnail de la image.
- `AttachmentAdmin` con filtro por subject_type y download via proxy view.
- `ReminderAdmin` extendido con `recur` y `lead_minutes`.

---

## 6. API surface (REST)

Todos owner-scoped vía DRF `IsAuthenticated` + `get_queryset()` que filtra por `owner=request.user`.

### 6.1 Person
```
GET    /api/persons/                       ?search=&tag=&cadence_status=
POST   /api/persons/
GET    /api/persons/{id}/
PATCH  /api/persons/{id}/
DELETE /api/persons/{id}/
POST   /api/persons/{id}/mark_contacted/   # body: {occurred_at?} → actualiza last_contacted_at + crea interaction
GET    /api/persons/{id}/timeline/         # última interaction, reminders pendientes, important dates próximas
```

### 6.2 ContactInfo (nested)
```
GET    /api/persons/{pid}/contacts-info/
POST   /api/persons/{pid}/contacts-info/
PATCH  /api/persons/{pid}/contacts-info/{cid}/
DELETE /api/persons/{pid}/contacts-info/{cid}/
```

### 6.3 ImportantDate (nested)
```
GET    /api/persons/{pid}/important-dates/
POST   /api/persons/{pid}/important-dates/
PATCH  /api/persons/{pid}/important-dates/{id}/
DELETE /api/persons/{pid}/important-dates/{id}/
GET    /api/persons/{pid}/important-dates/upcoming/?days=30
```

### 6.4 Interaction (nested + flat)
```
GET    /api/persons/{pid}/interactions/
POST   /api/persons/{pid}/interactions/
PATCH  /api/persons/{pid}/interactions/{id}/
DELETE /api/persons/{pid}/interactions/{id}/
GET    /api/interactions/                  ?counts_as_contact=true&since=2026-01-01
```

### 6.5 Reminder
```
GET    /api/reminders/                     ?completed=false&person_id=&upcoming=true
POST   /api/reminders/
PATCH  /api/reminders/{id}/
DELETE /api/reminders/{id}/
POST   /api/reminders/{id}/complete/       # body opcional; signal crea Interaction si recur=yearly
```

### 6.6 Note (nested, ya existía)
```
GET    /api/persons/{pid}/notes/
POST   /api/persons/{pid}/notes/
PATCH  /api/persons/{pid}/notes/{id}/
DELETE /api/persons/{pid}/notes/{id}/
```

### 6.7 Attachment (nested + flat)
- **Nested** (subir a una entidad específica):
  ```
  GET    /api/{person|notes|interactions|important-dates}/{pk}/attachments/
  POST   /api/{person|notes|...}/{pk}/attachments/        # multipart/form-data
  GET    /api/{...}/{pk}/attachments/{aid}/
  PATCH  /api/{...}/{pk}/attachments/{aid}/                # editar title/description
  DELETE /api/{...}/{pk}/attachments/{aid}/
  ```
- **Download cifrado → descifrado on-the-fly:**
  ```
  GET    /api/attachments/{id}/download/                  # stream descifrado al front
  ```
- **Thumb on-demand:**
  ```
  GET    /api/attachments/{id}/thumb/?w=200               # Pillow + cache
  ```
- **Flat (lista todos los del owner):**
  ```
  GET    /api/attachments/                                ?search=
  ```

### 6.8 Tag (ya existía)
```
GET /api/tags/
POST /api/tags/
PATCH /api/tags/{id}/
DELETE /api/tags/{id}/
```

### 6.9 Dashboard (agregado)
```
GET /api/dashboard/
  → {
      overdue:        [person_summary, ...],
      due_soon:       [...],
      upcoming_important_dates: [...],   # próximos 30 días, cumpleaños por edad
      upcoming_reminders: [...],
      never_contacted: [...]             # cadence_days set + last_contacted_at null
    }
```

---

## 7. UI surfaces (Astro + React islands)

### 7.1 Dashboard (`/`)
- 4 secciones: **Vencidos** (rojo), **Por vencer** (amarillo), **Próximos eventos** (ImportantDate en 30 días + edad si es birthday), **Recordatorios pendientes** (Reminders upcoming).
- Cada item es un link al perfil de la persona.
- Si no hay personas con cadencia: dashboard muestra solo ImportantDates y Reminders.

### 7.2 Lista de personas (`/persons`)
- Búsqueda en vivo por nombre + filtro por tag + filtro por `cadence_status`.
- Sort: `last_contacted_at asc NULLS FIRST` (más olvidado primero), `relationship_strength desc` (toggle).
- Botón "+ persona" abre modal con campos: nombre, apellido, apodo, cadencia, contact info (pre-rellenada con 10 sugerencias vacías).

### 7.3 Perfil de persona (`/persons/{id}`)
- **Header:** nombre, nick, tags, cadencia status badge, edad si hay birthday.
- **Sección "Contacto"**: ContactInfo (lista por type, edit inline), cómo nos conocimos (cifrado), foto de perfil (Attachment opcional).
- **Sección "Interacciones"**: timeline desc, cada item con icono de kind, fecha, y check `counts_as_contact` editable.
- **Sección "Notas"**: lista con filtro por `category`, editor con categoría.
- **Sección "Fechas & Recordatorios"**: ImportantDates (con su icon/image) + Reminders (ordenados por `remind_at`).
- **Sección "Adjuntos"**: galería de attachments relacionados a esta persona, agrupados por tipo de entidad dueña (los de la persona misma, los de sus notas, los de sus fechas, los de sus interactions).
- **Botón flotante:** "Registrar interaction" (modal rápido: kind, occurred_at, body opcional, checkbox counts_as_contact, adjuntar archivo opcional).

### 7.4 Tag manager (`/tags`)
- Listado, crear, asignar color, eliminar.

### 7.5 Date detail (`/persons/{pid}/important-dates/{id}`)
- Vista dedicada para una fecha con: emoji o foto grande, título, descripción, edad (si birthday), archivo adjunto (descargable cifrado).

### 7.6 Attachment viewer (modal/componente)
- Para imágenes: `<img src="/api/attachments/{id}/thumb/?w=600">`.
- Para otros tipos: link de download → `/api/attachments/{id}/download/`.
- Mostrar `original_filename` + `size_bytes` + `mime_type`.

---

## 8. Out of scope v2+

- `Organization` + `PersonOrganization`.
- Búsqueda full-text sobre contenido cifrado.
- OCR de PDFs adjuntos.
- Transcripción de audios adjuntos.
- Family/relationship links entre personas.
- Soft-delete / papelera.
- Recurrencia distinta a yearly en ImportantDate (monthly/weekly si los necesitamos).
- Multi-user, sharing, roles.
- Auditoría / change log.
- Import/export CSV, vCard.
- Mobile app / PWA offline.
- Notificaciones push (browser).
- Reglas automáticas (ej: "si pasaron N días sin contact, mandar reminder").
- Quota por tipo de MIME (limitar cuota separada para videos).
- S3-compatible storage (hoy local).

---

## 9. Defaults asumidos (corregibles antes de implementar)

- `Reminder.contact` se renombra a `Reminder.person`.
- `Reminder.message` se renombra a `Reminder.message_enc`.
- `Note.contact` se renombra a `Note.person`.
- `relationship_strength` default = 3 (escala 1-5).
- Dashboard refresca en cada load (no hay polling ni websocket en v1).
- Timezone default: `Intl.DateTimeFormat().resolvedOptions().timeZone` del front.
- `cadence_days` mínimo 1 (sin tope inferior).
- `attachment.icon_image` NO está cifrado (se sirve directo al navegador como `<img src>`).
- `ATTACHMENT_MAX_BYTES` default 25 MB, `ATTACHMENT_USER_QUOTA_BYTES` default 500 MB.
- Thumbnails on-demand cacheados 5 min en memoria del servidor (no persistidos).

---

## 10. Open / unknown

- **Recurrencia `weekly` / `monthly` en Reminder:** no en v1. Si decís que querés "ejercicio cada lunes", extender el enum.
- **Notas con texto plano (NO cifrado) como opción:** hoy todo `Note.body_enc` es cifrado. ¿Querés notas rápidas sin cifrado para打卡 diario? Si sí, agregar `Note.is_encrypted` bool.
- **Person-to-person relationships** (pareja, hermano, padre): v2. Hoy vive en `description` o `how_we_met`.
- **Embed de videos de YouTube en notes:** defer a v2.

---

## 11. Cómo se aprueba este plan

1. Leer este doc (5-10 min).
2. Señalar disenso o补充 en §9 / §10.
3. Una vez firmado, implementar en una sola migración grande `0002_v1_schema.py`.
4. El código que toca models + signals + serializers + views + admin vive en una sola pasada lógica, no fragmentada.

**Una vez aprobado, NO se commitea automáticamente.** Se muestra el diff, se revisa, y vos decidís cuándo cae.

> **Doc compañero:** `frontend-plan-v1.md` (mismo directorio). Cubre páginas,
> i18n (es/en), theming (paletas en `../design/themes.md`), componentes y
> shell. Asume que el schema y la API definidos en este doc están aprobados.

---

## 12. Adendas al draft inicial (timeline de cambios)

| # | Cuándo | Cambio |
|---|---|---|
| A1 | Después del primer review | `Attachment` agregado como modelo reusable con GenericForeignKey (D19, D20). Era cero en el draft |
| A2 | Después del primer review | `ImportantDate.kind` reducido a `birthday`/`custom`, agregado `birth_year`, `icon`, `icon_image`, `attachment` (D22) |
| A3 | Después del primer review | `ContactInfo.type` ya no es enum; defaults largos en `settings.CONTACT_TYPE_SUGGESTIONS` (D21) |
| A4 | Después del primer review | Attachments cifrados con Fernet — interpretación del "other" con preocupación de deploy docker. Mantiene la postura de seguridad consistente con `Note.body`. Si preferís que sean planos, ver §4.4 — basta cambiar `EncryptedFileField` a `FileField` |
| A5 | Después del primer review | **Switch de DB engine**: SQLite (dev default) → Postgres 16 mandatory. Implica añadir servicio `db` a `docker-compose.yml`, cambiar `settings.py`, actualizar `.env.example` y README. Sin cambios en models — Django los genera idénticos para ambos engines |
| A6 | Después del primer review | **`Person.profile_photo`** OneToOne → `Attachment`. Simétrico al `User.avatar` (que se agrega en el frontend-plan, A7). Mantiene "foto de perfil" como flujo first-class para personas y usuario |
