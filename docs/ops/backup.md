# Backups

Un backup completo del CRM son TRES cosas que se guardan por separado:

1. La base de datos (`pg_dump`).
2. Los archivos subidos (volumen `crm_media`: adjuntos cifrados, iconos, avatares, logos).
3. Las claves de cifrado (`FIELD_ENCRYPTION_KEYS`) y, para restaurar el mismo entorno, `DJANGO_SECRET_KEY`.

**Sin `FIELD_ENCRYPTION_KEYS` el backup es ilegible.** Notas, mensajes, "como nos conocimos", notas de
instituciones y todos los adjuntos están cifrados con Fernet; la clave NO está en la base de datos ni en el
volumen. Guárdala aparte (gestor de contraseñas, otro disco o equipo), nunca junto al backup ni en git.
Mientras existan datos cifrados con una clave vieja, conserva también esa clave (ver `docs/ops/encryption.md`).

Todos los comandos se ejecutan en la raíz del repo. En desarrollo (solo `db` en Docker) cambia
`--env-file .env.docker` por nada y usa el contenedor `crm-db`.

## 1. Base de datos

```bash
# Formato custom (comprimido, restaurable con pg_restore). Ajusta usuario y base si cambiaste los defaults.
docker compose --env-file .env.docker exec -T db pg_dump -U crm -Fc crm > backup-crm-$(date +%F).dump
```

PowerShell (evitar `>` de PowerShell 5.1, que re-codifica el binario; usa cmd):

```powershell
cmd /c "docker compose --env-file .env.docker exec -T db pg_dump -U crm -Fc crm > backup-crm.dump"
```

El dump contiene el texto ya cifrado de las columnas `*_enc`, pero el resto (nombres, teléfonos, fechas,
títulos) va en claro: protégelo como dato personal.

## 2. Archivos subidos

```bash
docker run --rm -v crm_media:/media:ro -v "$PWD":/backup alpine \
  tar czf /backup/backup-media-$(date +%F).tgz -C /media .
```

El volumen se llama `<proyecto>_media` (`crm_media` con el proyecto por defecto; compruébalo con
`docker volume ls`). Los adjuntos de `attachments/` ya están cifrados en disco; iconos, avatares y logos no.

## 3. Claves

Copia de `FIELD_ENCRYPTION_KEYS` y `DJANGO_SECRET_KEY` de `.env.docker` a un lugar distinto del backup.

## Restaurar

```bash
# 1. Stack nuevo con el MISMO .env.docker (mismas claves) o, al menos, las mismas FIELD_ENCRYPTION_KEYS.
docker compose --env-file .env.docker up -d db
# 2. Base de datos
docker compose --env-file .env.docker exec -T db pg_restore -U crm -d crm --clean --if-exists < backup-crm.dump
# 3. Archivos
docker run --rm -v crm_media:/media -v "$PWD":/backup alpine tar xzf /backup/backup-media.tgz -C /media
# 4. Resto del stack y verificacion
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker exec backend python manage.py check_encryption --full
```

`check_encryption --full` debe terminar con "all good". Si dice que no descifra, la clave no es la que
cifró esos datos.

## Recomendaciones

- Frecuencia: diaria para la base de datos; los archivos cuando cambian.
- Cifra el backup en reposo si sale del equipo (por ejemplo `age` o `gpg`), además del cifrado por campos.
- Prueba la restauración en un stack aparte (`docker compose -p crm-restore ...` con otro `APP_PORT`,
  `PGDATA_VOLUME` y `DB_CONTAINER_NAME`) antes de necesitarla.
- `docker compose down -v` borra los volúmenes y con ellos los datos: no lo uses sin backup.
