# Registro seguro de documentos de condonacion

## Alcance

La subida R2 ya funcionaba. La RPC de registro requeria `auth.uid()`, ausente
en el login por documento. Ahora el login emite un token aleatorio de 256 bits
con vigencia de 24 horas; la BD guarda solo SHA-256 y resuelve el beneficiario.
La RPC JWT conserva su firma. Ambas rutas usan el mismo registro transaccional.
El navegador verifica identidad antes de subir, y la RPC vuelve a verificarla.

La tabla de sesiones y el helper de escritura no son accesibles a anon ni
authenticated. El cierre de sesion revoca el token; cambiar password_hash
revoca las sesiones existentes mediante trigger. Si el cierre no tiene red,
la revocacion remota no esta garantizada y el token caduca por tiempo.
Las sesiones antiguas deben iniciar sesion nuevamente antes de cargar documentos.

## Despliegue

No se ha aplicado esta migracion ni desplegado la funcion a produccion.

1. Revisar en la BD objetivo la definicion y permisos actuales antes de aplicar:

   ```sql
   select pg_get_functiondef('public.beneficiario_subir_documento_condonacion_final(text,text,text,text,bigint)'::regprocedure);
   ```

   Comparar con la migracion base `202603160013_modulo_condonaciones_base.sql`.
   Si hay diferencias de negocio, conciliarlas antes de reemplazar la funcion.
   Respaldar la definicion y los permisos actuales para una reversion coordinada.

2. Aplicar exclusivamente
   `supabase/migrations/20261007160000_condonacion_document_sessions.sql`
   mediante el procedimiento de migraciones del proyecto. El archivo es atomico.
   `supabase push` no es el comando de migraciones: es `supabase db push`.
   Antes de usarlo, ejecutar `supabase db push --dry-run` y revisar todas las
   migraciones pendientes; no aplicar pendientes ajenos ni `--include-all`
   indiscriminadamente. Una aplicacion manual via SQL Editor requiere conciliar
   el historial de migraciones antes del siguiente push.

3. Desplegar solo la funcion modificada, despues de confirmar la migracion:

   ```sh
   supabase functions deploy auth-credentials
   ```

4. Publicar el frontend con el procedimiento habitual (`npm run build`).
   No requiere desplegar funciones de R2. Validar con cuenta de prueba el login
   documento, el login JWT y la carga de diploma, acta e historico de notas.
   Verificar registros propios y estado `preaprobada_sistema` tras tres tipos.

No borrar automaticamente el PDF que ya se subio sin registrar. No revertir ni
borrar documentos al deshacer un despliegue. Una reversion necesita coordinar
frontend, funcion de login y definiciones SQL, conservando los datos.

## Pruebas locales

Sin tocar la BD real, usando Node con `stripTypeScriptTypes` y PostgreSQL embebido:

```sh
npm exec --yes --package=@electric-sql/pglite -- node -e "console.log('PGlite ready')"
node scripts/test-condonacion-session.mjs "$(find ~/.npm/_npx -path '*/@electric-sql/pglite/dist/index.js' -print -quit)"
npm run build
```

Se comprueban migracion, permisos, tokens falsos/caducados/revocados, hash usado
como credencial, beneficiario eliminado, rutas ajenas, JWT, tres tipos distintos,
login incorrecto/bloqueado, fallo al persistir sesion y seleccion de identidad.
La prueba SQL usa tablas minimas; no sustituye el smoke test con el esquema real.
No se ha validado concurrencia con conexiones independientes ni subida real R2.
ESLint conserva 10 errores previos en los archivos tocados, sin nuevos hallazgos.

## Correccion de visualizacion: R2 devuelve 403

La funcion `get-presigned-download-url` omitia el bucket en la ruta y firmaba
`Content-Type`, una cabecera que el visor PDF no envia al hacer GET. Se reemplazo
su firma manual por AWS SDK con `Bucket` explicito y `forcePathStyle: true`.
`R2_ENDPOINT` debe ser el endpoint de cuenta de R2; `R2_BUCKET` contiene el bucket.

Prueba local sin credenciales reales:

```sh
node scripts/test-r2-download.mjs
```

Desplegar solamente esta funcion para activar la correccion de visualizacion:

```sh
supabase functions deploy get-presigned-download-url --project-ref jwifxjzxdxjntbdqbyku
```

Despues, recargar `admin/condonaciones` para generar URLs nuevas. Las URLs antiguas
siguen siendo invalidas. No requiere migraciones, cambios de CORS, publicar el
bucket ni volver a subir documentos. Falta comprobar una descarga real tras el
despliegue; las pruebas locales verifican firma y contrato con servicios simulados.

## Revision final: motivos en portal y bitacora

Aplicar la migracion `20261007170000_condonacion_revision_bitacora.sql` despues
de revisar `supabase db push --dry-run`. No aplicar pendientes ajenos sin revisar.
Los triggers auditan aprobacion y rechazo de documentos y solicitudes finales,
incluyendo beneficiario, actor, motivo, estado anterior/nuevo y fecha de revision.
Rechazar sin motivo falla en BD. Si falla el registro de bitacora, se revierte
la decision. No se reconstruyen eventos anteriores a esta migracion.

Despues desplegar la consulta del portal:

```sh
supabase functions deploy get-condonacion-modulo --project-ref jwifxjzxdxjntbdqbyku
```

Publicar el frontend actualizado. Al abrir o recargar su condonacion, el
beneficiario vera motivos de solicitud y documentos, los estados reales y
la accion Enviar correccion para soportes rechazados. No se agregan correos
ni notificaciones push; la informacion se presenta en el modulo de condonacion.
Se conserva la carga existente: un documento nuevo queda pendiente de revision
y se muestra la version mas reciente de cada tipo. La ultima observacion final
se conserva identificada como tal cuando la solicitud cambia de estado.

Prueba aislada (PGlite instalado como en las pruebas anteriores):

```sh
node scripts/test-condonacion-revision.mjs "$(find ~/.npm/_npx -path '*/@electric-sql/pglite/dist/index.js' -print -quit)"
```

Comprobar en entorno de prueba: rechazar un documento y la solicitud con motivo,
recargar portal beneficiario, verificar textos y bitacora, enviar correccion y
comprobar que aparece pendiente; aprobar y verificar el nuevo evento y la
limpieza del motivo anterior en el modal administrativo. No se ha realizado
esta prueba manual contra produccion ni una verificacion visual en navegador.

## Riesgos fuera de este arreglo

R2 y otras rutas existentes que aceptan solo beneficiario_id siguen necesitando
una revision de autorizacion separada. No se modifica su funcionamiento aqui.
El token en localStorage es una credencial bearer: un XSS podria robarlo.
Se retiraron logs de contenido de sesion, pero este cambio no es una auditoria
integral del portal ni garantiza ausencia de otras vulnerabilidades.