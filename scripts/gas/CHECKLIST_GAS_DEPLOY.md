# Checklist de Despliegue GAS + Supabase (FOCADES)

Este checklist sirve para dejar funcionando la generacion de los 3 PDFs de aspirantes con Google Docs + Google Apps Script (GAS), guardando en Supabase Storage.

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

1. Crear proyecto de Apps Script.
2. Copiar el contenido de:
- `scripts/gas/focades-docs-webapp.gs`

3. En GAS, abrir Project Settings > Script properties y crear estas propiedades:

### Obligatorias
- `TEMPLATE_FORMULARIO_ID`
- `TEMPLATE_TERMINOS_ID`
- `TEMPLATE_DATOS_ID`

### Recomendadas
- `OUTPUT_FOLDER_ID` (carpeta destino en Drive)
- `KEEP_DOC_COPY=false` (para no dejar copias .docx/.gdoc)
- `CLEANUP_UNUSED_PLACEHOLDERS=false` (true si deseas limpiar placeholders no mapeados)

### Seguridad (opcional pero recomendado)
- `DOCS_GAS_API_KEY`
- `DOCS_GAS_SHARED_SECRET`

### Opcional para enlaces publicos de soportes
- `SUPABASE_PUBLIC_BASE_URL` (ej: `https://xxxx.supabase.co`)

## 3) Desplegar Web App en GAS

1. Deploy > New deployment.
2. Tipo: Web app.
3. Execute as: Me.
4. Who has access: Anyone (o Anyone with link, segun politica).
5. Deploy y copiar la URL del Web App (termina en `/exec`).

## 4) Configurar secretos en Supabase (backend)

Configurar en el entorno donde corre la Edge Function:

### Obligatorias
- `DOCS_GAS_ENABLED=true`
- `DOCS_GAS_WEBHOOK_URL=<URL_WEB_APP_GAS>`

### Recomendadas
- `DOCS_GAS_TIMEOUT_MS=20000`
- `DOCS_GAS_FALLBACK_LOCAL=true`

### IDs de plantillas (si no viajan por request)
- `DOCS_GAS_TEMPLATE_FORMULARIO_ID=<ID_DOC_FORMULARIO>`
- `DOCS_GAS_TEMPLATE_TERMINOS_ID=<ID_DOC_TERMINOS>`
- `DOCS_GAS_TEMPLATE_DATOS_ID=<ID_DOC_DATOS>`

### Seguridad (si se activo en GAS)
- `DOCS_GAS_API_KEY=<valor_igual_al_de_GAS>`
- `DOCS_GAS_SHARED_SECRET=<valor_igual_al_de_GAS>`

Nota: El backend ya envia credenciales en headers y body para compatibilidad.

## 5) Verificar rutas y tablas en Supabase

1. Bucket de destino: `soportes`.
2. Rutas esperadas para aspirantes:
- `expedientes/{documento}/{radicado}/generados/{tipo}.pdf`

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
5. Revisar en Storage los 3 PDFs:
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

2. Configurar (si usas plantillas dedicadas):
- `DOCS_GAS_TEMPLATE_HISTORICOS_TERMINOS_ID`
- `DOCS_GAS_TEMPLATE_HISTORICOS_DATOS_ID`

3. Flujo esperado:
- Subida de firma
- Generacion de 2 PDFs por GAS
- Registro en `portal_beneficiario_documentos_historicos`

## 8) Diagnostico rapido de errores comunes

### Error 401 desde GAS
- Revisar `DOCS_GAS_API_KEY` y `DOCS_GAS_SHARED_SECRET` en ambos lados.
- Confirmar que GAS tenga Script Properties correctas.

### Error "No se encontro templateId"
- Revisar IDs en Script Properties y/o secretos de Supabase.

### PDF sin firma
- Verificar placeholder `{{firma_aspirante}}` en la plantilla.
- Verificar que llegue `payload.signature.base64`.

### Placeholders sin reemplazo
- Revisar que el nombre del placeholder coincida exacto.
- Activar temporalmente `CLEANUP_UNUSED_PLACEHOLDERS=true` para limpiar remanentes.

### Timeout
- Aumentar `DOCS_GAS_TIMEOUT_MS` a 30000-45000.
- Revisar complejidad/tamano de plantilla.

## 9) Criterio de salida (Done)

Marcar como completo solo si:
- [ ] GAS despliega Web App y responde `ok=true`.
- [ ] Se generan 3/3 PDFs en aspirantes.
- [ ] La firma aparece en los 3 documentos.
- [ ] Se guardan archivos en Storage (`soportes`).
- [ ] Se registra historial en tabla correspondiente.
- [ ] No quedan placeholders criticos sin reemplazo.
