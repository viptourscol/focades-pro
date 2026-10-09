# Checklist de Despliegue GAS + Supabase (FOCADES)

Este checklist sirve para dejar funcionando la generacion de los PDFs automaticos (3 de aspirantes y 2 de onboarding de beneficiarios) con Google Docs + Google Apps Script (GAS). Los PDFs se guardan en Cloudflare R2.

## 0) Inventario de hosting (mantener actualizado)

El proyecto GAS anterior no pudo localizarse (octubre 2026) y se reemplazo por uno nuevo en una cuenta controlada. Completar esta tabla al crear el proyecto y cada vez que cambie algo.

| Dato | Valor |
|---|---|
| Cuenta de Google propietaria | **POR COMPLETAR** (cuenta institucional de FOCADES) |
| Editor de respaldo | **POR COMPLETAR** |
| Nombre del proyecto GAS | `focades-docs-webapp` |
| Script ID (Project Settings > IDs) | **POR COMPLETAR** |
| ID de la implementacion Web App (Deploy > Manage deployments) | **POR COMPLETAR** |
| Version desplegada (`SCRIPT_VERSION`) y fecha | **POR COMPLETAR** |
| Carpeta de salida en Drive (`OUTPUT_FOLDER_ID`) | **POR COMPLETAR** (nombre + ID) |
| Plantilla formulario (`TEMPLATE_FORMULARIO_ID`) | **POR COMPLETAR** (nombre + ID) |
| Plantilla terminos (`TEMPLATE_TERMINOS_ID`) | **POR COMPLETAR** (nombre + ID) |
| Plantilla tratamiento de datos (`TEMPLATE_DATOS_ID`) | **POR COMPLETAR** (nombre + ID) |
| Fecha de creacion del proyecto | **POR COMPLETAR** |

Donde viven los secretos (NO se guardan en este repositorio):
- La URL `/exec` y las claves estan en las propiedades del script (GAS) y en los secretos de Supabase `DOCS_GAS_WEBHOOK_URL`, `DOCS_GAS_API_KEY` y `DOCS_GAS_SHARED_SECRET`.
- Supabase no permite leer sus valores despues de guardarlos (solo muestra una huella). Guardar una copia en el gestor de claves de la institucion.

Como verificar que lo desplegado es lo que esta en el repo:
1. Abrir la URL `/exec` con GET: debe devolver `service: focades-gas-pdf` y `version` igual a `SCRIPT_VERSION` de `focades-docs-webapp.gs`.
2. Ejecutar `validateTemplates()` en el editor de GAS (revisa carpeta, plantillas y marcadores).
3. Ejecutar la prueba de humo (ver seccion 3).

Recuperacion si se pierde el proyecto o la cuenta:
1. Crear un proyecto nuevo en una cuenta controlada y copiar `focades-docs-webapp.gs` y `appsscript.json` desde este repo.
2. Repetir las secciones 2, 3 y 4 de este checklist (claves nuevas, plantillas nuevas, nuevo despliegue).
3. Actualizar el inventario de arriba.

Rotacion de claves: generar valores nuevos (`openssl rand -hex 32`), cambiarlos en las propiedades del script y en los secretos de Supabase al mismo tiempo, y comprobar con la prueba de humo.

## 1) Preparar plantillas en Google Docs

1. Crear o validar 3 plantillas en Google Docs:
- Formulario de solicitud (tipo: `formulario_credito_educativo`)
- Terminos y condiciones (tipo: `aceptacion_terminos_condiciones`)
- Tratamiento de datos (tipo: `autorizacion_tratamiento_datos`)

2. Verificar placeholders en cada plantilla.

### Placeholders base recomendados
- `{{nombre_completo}}`
- `{{tipo_documento}}`
- `{{n_documento}}`
- `{{firma_timestamp}}`
- `{{firma_hash_datos}}`

### Placeholder de firma (imagen)
- `{{firma_aspirante}}`

Nota: El script tambien soporta `{{firma_placeholder}}` por compatibilidad.

3. Copiar el ID de cada plantilla (desde la URL de Drive/Docs).

## 2) Configurar proyecto Google Apps Script

1. Crear proyecto de Apps Script en la cuenta propietaria (ver inventario).
2. Copiar el contenido de:
- `scripts/gas/focades-docs-webapp.gs`
- Opcional: en Project Settings activar "Show appsscript.json" y copiar `scripts/gas/appsscript.json` (zona horaria America/Bogota y permisos de Drive/Docs).

3. En GAS, abrir Project Settings > Script properties y crear estas propiedades:

### Obligatorias
- `TEMPLATE_FORMULARIO_ID`
- `TEMPLATE_TERMINOS_ID`
- `TEMPLATE_DATOS_ID`

### Recomendadas
- `OUTPUT_FOLDER_ID` (carpeta destino en Drive)
- `KEEP_DOC_COPY=false` (para no dejar copias .docx/.gdoc)
- `CLEANUP_UNUSED_PLACEHOLDERS=false` (true si deseas limpiar placeholders no mapeados)

### Seguridad (OBLIGATORIA)
- `DOCS_GAS_API_KEY`
- `DOCS_GAS_SHARED_SECRET`

Generar cada una con `openssl rand -hex 32`. El script rechaza toda peticion si falta alguna de las dos, porque el Web App es publico y crea archivos en el Drive de la cuenta.

### Opcional para enlaces publicos de soportes
- `SUPABASE_PUBLIC_BASE_URL` (ej: `https://xxxx.supabase.co`)

## 3) Desplegar Web App en GAS

1. Ejecutar `validateTemplates()` una vez en el editor: autoriza los permisos de Drive y Docs y revisa que carpeta, plantillas y marcadores esten bien (`ok: true`). Corregir lo que reporte (plantillas inaccesibles, marcadores desconocidos, falta de `{{firma_aspirante}}`).
2. Deploy > New deployment.
3. Tipo: Web app.
4. Execute as: Me.
5. Who has access: Anyone (si la politica de Workspace lo bloquea, pedir al administrador del dominio que permita Web Apps publicas).
6. Deploy y copiar la URL del Web App (termina en `/exec`).
7. Anotar Script ID e ID de implementacion en el inventario (seccion 0).
8. Cada cambio de codigo requiere Deploy > Manage deployments > Edit > New version; actualizar `SCRIPT_VERSION` en el repo antes.

### Prueba de humo antes de tocar Supabase

Desde la raiz del repo, con las variables en el entorno (no guardarlas en archivos versionados):

`GAS_WEBHOOK_URL=<url /exec> GAS_API_KEY=<clave> GAS_SHARED_SECRET=<secreto> node scripts/gas/smoke-gas-webapp.mjs`

Debe terminar en `OK`: responde el GET, rechaza peticiones sin claves, genera 3 PDFs validos y tarda menos de 15 s (`GAS_SMOKE_MAX_MS`). Genera archivos de prueba en la carpeta de salida (se envian a la papelera si `KEEP_DOC_COPY=false`).

## 4) Configurar secretos en Supabase (backend)

Configurar en el entorno donde corre la Edge Function:

### Obligatorias
- `DOCS_GAS_ENABLED=true`
- `DOCS_GAS_WEBHOOK_URL=<URL_WEB_APP_GAS>`

### Recomendadas
- `DOCS_GAS_TIMEOUT_MS=20000` (subir a 45000 si la prueba de humo tarda mas de 15 s)
- `DOCS_GAS_FALLBACK_LOCAL` (`true` genera PDFs locales con otro aspecto si GAS falla; en produccion esta en `false`, decision vigente: reintentar a mano)

### IDs de plantillas (las usan las dos funciones: aspirantes y onboarding)
- `DOCS_GAS_TEMPLATE_FORMULARIO_ID=<ID_DOC_FORMULARIO>`
- `DOCS_GAS_TEMPLATE_TERMINOS_ID=<ID_DOC_TERMINOS>`
- `DOCS_GAS_TEMPLATE_DATOS_ID=<ID_DOC_DATOS>`

### Seguridad (obligatoria: deben coincidir con las propiedades del script)
- `DOCS_GAS_API_KEY=<valor_igual_al_de_GAS>`
- `DOCS_GAS_SHARED_SECRET=<valor_igual_al_de_GAS>`

Nota: El backend envia las credenciales en headers y body. Los secretos se cambian con el panel de Supabase o `supabase secrets set`; despues repetir la prueba de humo y regenerar los documentos de una inscripcion de prueba.

## 5) Verificar rutas y tablas

1. Los PDFs se guardan en Cloudflare R2 (bucket configurado en `R2_BUCKET`).
2. Rutas esperadas para aspirantes:
- `soportes/expedientes/{documento}/{radicado}/generados/{tipo}.pdf`
- Al regenerar desde el admin se crea una version nueva: `{tipo}-v2.pdf`, `{tipo}-v3.pdf`...

3. Tabla de historial:
- `inscripciones_documentos`

Verificar que se inserten filas con:
- `tipo_documento`
- `storage_path`
- `mime_type`
- `size_bytes`

## 6) Prueba funcional completa (Aspirantes)

1. Hacer una inscripcion de prueba en frontend.
2. Confirmar que se suba firma digital.
3. Confirmar invocacion de `generate-inscripcion-docs`.
4. Revisar resultado exitoso (`ok=true`).
5. Revisar en R2 (o desde el admin del aspirante) los 3 PDFs:
- `formulario_credito_educativo.pdf`
- `aceptacion_terminos_condiciones.pdf`
- `autorizacion_tratamiento_datos.pdf`

6. Abrir PDFs y validar:
- Placeholders reemplazados
- Firma insertada en `{{firma_aspirante}}`
- Timestamp y hash visibles

## 7) Prueba funcional onboarding beneficiarios (si aplica)

1. Confirmar que existe la funcion:
- `generate-beneficiario-onboarding-docs`

2. Plantillas: usa las mismas `DOCS_GAS_TEMPLATE_TERMINOS_ID` y `DOCS_GAS_TEMPLATE_DATOS_ID` de aspirantes (las variables `*_HISTORICOS_*` no se usan desde Supabase).

3. Flujo esperado:
- Subida de firma
- Generacion de 2 PDFs por GAS
- Registro en `portal_beneficiario_documentos_historicos`

## 8) Diagnostico rapido de errores comunes

### Error 401 / "API key invalida" / "Autenticacion no configurada en el script"
- Revisar `DOCS_GAS_API_KEY` y `DOCS_GAS_SHARED_SECRET` en ambos lados.
- Confirmar que GAS tenga las dos Script Properties (sin ellas rechaza todo).

### Error "No se encontro templateId"
- Revisar IDs en Script Properties y/o secretos de Supabase.

### PDF sin firma
- Verificar placeholder `{{firma_aspirante}}` en la plantilla.
- Verificar que llegue `payload.signature.base64`.

### Placeholders sin reemplazo
- Ejecutar `validateTemplates()`: lista los marcadores desconocidos de cada plantilla.
- Revisar que el nombre del placeholder coincida exacto.
- Activar temporalmente `CLEANUP_UNUSED_PLACEHOLDERS=true` para limpiar remanentes.

### Timeout
- El script solo reemplaza los marcadores presentes en cada plantilla; si aun tarda, revisar la prueba de humo y la seccion Ejecuciones del proyecto GAS.
- Aumentar `DOCS_GAS_TIMEOUT_MS` a 30000-45000.
- Revisar complejidad/tamano de plantilla (imagenes pesadas, muchas tablas).

## 9) Criterio de salida (Done)

Marcar como completo solo si:
- [ ] Inventario de hosting (seccion 0) completo: cuenta, Script ID, implementacion, carpeta y plantillas.
- [ ] GAS despliega Web App y responde `ok=true` con `version` igual a `SCRIPT_VERSION`.
- [ ] La prueba de humo termina en `OK` en menos de 15 s.
- [ ] Se generan 3/3 PDFs en aspirantes.
- [ ] La firma aparece en los 3 documentos.
- [ ] Se guardan archivos en R2 (`soportes/expedientes/...`).
- [ ] Se registra historial en tabla correspondiente.
- [ ] No quedan placeholders criticos sin reemplazo.
