# Cifrado y rotación de claves

## Qué se cifra

Con Fernet (AES-128-CBC + HMAC-SHA256), mismas claves para todo:

- Campos `*_enc` (`EncryptedTextField`): `Person.how_we_met_enc`, `Reminder.message_enc`,
  `Interaction.body_enc`, `Note.body_enc`, `Organization.notes_enc` (y los que se agreguen: los comandos
  descubren los campos por tipo, no por lista fija).
- Archivos de `Attachment` (`EncryptedFileField`) en `MEDIA_ROOT/attachments/`.

No se cifran: nombres, teléfonos, correos, fechas, títulos, iconos, avatares y logos.

## Configuración de claves

- `FIELD_ENCRYPTION_KEYS`: lista separada por comas. **La primera cifra; todas descifran** (`MultiFernet`).
- `FIELD_ENCRYPTION_KEY`: una sola clave (compatibilidad). Si además hay lista, se agrega al final como clave
  solo de descifrado, para que dejarla puesta no deje datos ilegibles.
- Con `DEBUG=False` el backend no arranca sin al menos una clave Fernet válida ni sin una `DJANGO_SECRET_KEY` segura.

Nueva clave: `python scripts/generate-secrets.py --new-encryption-key` (o
`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).

## Rotar (sin tiempo fuera de servicio)

1. Genera la clave nueva y haz un backup (ver `backup.md`).
2. En `.env.docker`: `FIELD_ENCRYPTION_KEYS=<nueva>,<vieja>` y recrea el backend
   (`docker compose --env-file .env.docker up -d backend`). Desde aquí lo nuevo se cifra con la nueva y todo lo
   anterior sigue legible.
3. Simulación: `docker compose --env-file .env.docker exec backend python manage.py rotate_encryption_key --dry-run`
   (cuenta qué recifraría; no escribe).
4. Recifrado: `... exec backend python manage.py rotate_encryption_key`.
   - Campos de texto: por lotes (`--batch-size`, default 500), una transacción por lote, con SQL directo sobre el
     token ya cifrado.
   - Archivos: reescritura atómica (temporal + `os.replace`), de a uno.
   - Idempotente y reanudable: lo que ya está con la clave primaria se omite.
   - Un valor que ninguna clave abre NO se toca y se informa como fallo (el comando termina con código != 0).
5. Verificación: `... exec backend python manage.py check_encryption --full` debe terminar en 0.
6. Solo entonces deja únicamente `<nueva>` en `FIELD_ENCRYPTION_KEYS` y recrea el backend. Conserva la clave vieja
   mientras existan backups hechos con ella.

## check_encryption

```
manage.py check_encryption [--sample N] [--full]
```

Falla (código != 0) si: no hay clave o es inválida; una muestra (o todo con `--full`) no descifra; algún campo
`*_enc` tiene texto plano (chequeo estructural sobre todas las filas); un archivo adjunto falta, no está cifrado o
no descifra. Nunca imprime claves ni contenido. Informa cuántos valores siguen con una clave anterior.
