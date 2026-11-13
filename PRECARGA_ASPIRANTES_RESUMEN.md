# Precarga de aspirantes: comportamiento vigente

Actualizado: 2026-11-13.

## Bandeja de trabajo

La pantalla `/admin/cargue-documentos` organiza la convocatoria en el encabezado,
una guia compacta del rol y la bandeja a todo el ancho disponible. Todos sus
indicadores graficos (incluidos selector de creacion y validaciones) usan iconos
SVG de Lucide, no emojis.

- Un unico resumen muestra documentos totales, en revision, aprobados y
  borradores de la convocatoria, segun la lista autorizada del usuario.
  Pulsar una tarjeta filtra por estado; los contadores no dependen del filtro.
- No se muestran estadisticas ficticias ni tarjetas que aparenten acciones sin
  ejecutarlas. Durante la consulta o ante un error los contadores muestran una
  raya, no un cero que pueda confundirse con un resultado.
- Los filtros de tipo/estado, Actualizar y la paginacion se concentran en la
  bandeja. Actualizar conserva los filtros; cambiar convocatoria los reinicia.
- Abrir conserva el flujo de edicion/revision y sus permisos. Solo Educacion
  ve Nuevo Documento. La tabla permite desplazamiento horizontal en movil sin
  desbordar la pagina.

### Eliminar documentos TERCEROS

Educacion dispone del icono de papelera en la bandeja para TERCEROS en
`borrador` o `enviado_para_revision`. No se ofrece para RP, rechazados,
aprobados ni finalizados; los demas roles no pueden eliminar.

- La confirmacion muestra documento, estado y cantidad de filas. Exige escribir
  `ELIMINAR` y explica que el borrado permanente incluye filas, validaciones,
  historial de revision y correcciones. En revision, desaparece tambien de
  la bandeja de Presupuesto. No modifica aspirantes ni beneficiarios.
- `eliminar_terceros_educacion` bloquea el documento y comprueba rol, tipo,
  estado y `editado_en`. Si otro usuario corrige o aprueba mientras el modal
  esta abierto, se rechaza el borrado y se debe actualizar/revisar otra vez.
- El borrado es atomico mediante las relaciones `ON DELETE CASCADE`.
  La proteccion de documentos aprobados/finalizados se conserva.
- La bandeja vuelve a consultar sus documentos despues de confirmar el borrado,
  actualiza contadores y conserva los filtros.

Migracion: `supabase/migrations/20261113200000_eliminar_terceros_educacion.sql`.
Prueba transaccional: `supabase db query --linked --file scripts/testing/test-eliminar-terceros.sql`.
Esta migracion no elimina documentos existentes; el usuario debe confirmar
cada documento individualmente desde la interfaz.

## RP: registro presupuestal de 16 columnas

Educacion crea RP en `/admin/cargue-documentos` despues de la aprobacion de
TERCEROS de la misma convocatoria. En el editor selecciona el documento aprobado
y pulsa **Incorporar personas**. Se conserva `rp_terceros_id` y una copia de la
identidad, nombre y modalidad disponible. No se vuelve a filtrar por `admitido`.
La incorporacion repetida no duplica personas ni reemplaza importes.

- Educacion puede buscar/agregar personas de `personas`, `inscripciones` y
  `portal_beneficiarios`, sin limitarse a la convocatoria actual. La busqueda
  exige tres caracteres y devuelve hasta 30 identificaciones distintas; puede
  refinarse con el numero completo. No se admiten identificaciones inventadas,
  repetidas, no numericas ni de mas de 15 digitos.
- Educacion digita y confirma el valor por persona. No se calculan SMLV ni se
  presumen equivalencias de modalidad. Liquidacion refleja el mismo importe.
  Ambos son positivos, de hasta 13 enteros y 2 decimales (punto decimal), sin
  aritmetica flotante ni perdida de ceros.
- Codigos fijos: origen legal `5`, proyecto `841`, entidad `9901`, rubro
  `2.3.2.02.02.009`, firma mecanica `NO`.
- Presupuesto, solo en revision, llena No. RP (10 digitos), SubConsecutivo
  (4), Descripcion (500 caracteres), Fecha real `DDMMYYYY`, No. CDP (10),
  SubConsecutivo CDP (4), Fuente de Financiacion (4) y Contrato (texto opcional,
  sin un maximo inventado).
- No. RP y No. CDP admiten edicion manual o asignacion a personas seleccionadas
  con el mismo numero o consecutivos desde un inicio. Cada columna es
  independiente. La vista previa muestra todas las filas afectadas en el orden
  del documento, anterior/nuevo y exige confirmacion. Reemplazar numeros
  existentes requiere otra confirmacion; un desborde de 10 digitos no aplica
  ningun cambio. Filtrar no altera el orden.
- Encontrar una persona en FOCADES o aprobar TERCEROS no certifica que se
  haya importado al programa externo. Presupuesto debe confirmar por persona
  la existencia externa del tercero, entidad, rubro y fuente antes de aprobar.
  No se inventan catalogos ni validaciones contra un sistema no conectado.
- Se permiten borradores incompletos con formatos validos. Enviar requiere
  los datos y confirmacion de Educacion; aprobar/exportar requiere las 16
  columnas completas salvo Contrato y la confirmacion externa de Presupuesto.
  Aprobar es una accion separada de guardar y descargar. Despues se bloquea
  la edicion. La devolucion/reapertura conserva los datos para corregir.
- Los roles y estados se comprueban en PostgreSQL, no solo en botones. El
  guardado atomico verifica `editado_en`, conserva valores numericos exactos
  en las columnas financieras existentes y registra copia anterior/nueva,
  usuario, rol y fecha en `portal_transiciones_documento`.
  El nombre completo se conserva sin truncar en `datos_rp.nombre`; cuando
  excede 200 caracteres no se duplica en la columna opcional heredada
  `nombre_beneficiario`, para mantener compatibles sus vistas existentes.
- La interfaz ofrece lista/detalle, vista de las 16 columnas, filtros,
  paginacion de 25 personas e historial. Los cambios pendientes bloquean
  decisiones y exportacion; se avisa antes de salir.
- El XLSX real contiene exactamente las 16 columnas en el orden solicitado.
  Identificadores, fecha y numeros se conservan como texto, incluidos ceros
  iniciales y dos decimales en los importes. La compatibilidad final con el
  importador externo requiere una prueba real de Presupuesto.

Los RP anteriores no se modifican por la migracion. Si estaban en borrador,
el editor conserva sus importes/documentos existentes y exige vincular su
origen antes de enviarlos. Incorporar el TERCEROS aprobado vincula las
coincidencias; buscar una identificacion ya incluida sin origen permite
vincularla sin quitar la fila ni reemplazar sus importes. Los documentos antiguos en revision sin origen
deben devolverse y reabrirse para completar el nuevo formato.

Migracion: `supabase/migrations/20261113210000_editor_rp_completo.sql`.
RPC: `leer_rp_cargue`, `personas_terceros_rp`, `buscar_personas_rp`,
`guardar_rp_cargue`, `obtener_rp_exportacion`.
La Edge Function `generar-rp` tambien devuelve XLSX privado validado,
sin CSV ni URL publica. `validar-documento-cargue` lee el RP guardado autorizado.

Pruebas:
```sh
node --test scripts/testing/test-rp-cargue.mjs scripts/testing/test-flujo-presupuesto-edge.mjs
supabase db query --linked --file scripts/testing/test-editor-rp.sql
```

## Precarga y exportacion TERCEROS

La exportacion XLSX carga ExcelJS junto con la aplicacion, no mediante un
`import()` al descargar. Asi una pestaña abierta no depende de un fragmento
ExcelJS de un despliegue anterior que Vercel ya no publica. Tras actualizar
desde una version anterior, recargar la pagina una vez antes de descargar.

- Ruta: `/admin/cargue-documentos`.
- TERCEROS admite precarga en borrador, exclusivamente para
  `admin_educacion`. Los documentos aprobados no se modifican.
- Se filtra por la convocatoria del documento y el estado seleccionado,
  comparado exactamente sin distinguir mayusculas y espacios exteriores.
  Los estados se obtienen por convocatoria desde las inscripciones existentes;
  no se ofrecen estados inventados ni se usa una busqueda parcial con `LIKE`.
- La fuente es `inscripciones` con su `persona_id` relacionado a `personas`,
  nunca la base historica de beneficiarios. La prioridad coincide con la ficha:
  `personas`, columnas de `inscripciones`, `inscripciones.datos_formulario`.
- Campos reales: `n_documento`, `nombre_completo`, `tipo_documento`, `email`,
  `n_celular`, `direccion_residencia` y `municipio_residencia`. Se guardan en
  `portal_valores_cargue` como identificacion, nombre y los cinco datos de contacto.
  TERCEROS incorpora ademas nombres separados y datos bancarios, como se detalla
  en la seccion del formato de Presupuesto.
- Los identificadores de inscripciones son UUID. No se truncan datos ni se
  sustituyen identificaciones o nombres faltantes por datos ficticios.
- La RPC conserva el nombre publicado `precargar_rp_convocatoria` y recibe
  `p_documento_id`, `p_convocatoria_id`, `p_estado`, `p_modalidad_beca`.
  Se conserva para el editor TERCEROS; RP usa ahora el documento aprobado
  seleccionado, no la precarga antigua por estado/modalidad.
- El contador devuelto corresponde a filas efectivamente insertadas.
  Repetir la precarga no duplica ni sobrescribe datos diligenciados; en TERCEROS
  completa los campos faltantes desde la fuente, incluidos los bancarios, aunque
  no inserte nuevas filas. Los textos vacios, espacios y nulos no bloquean esa
  recuperacion. El editor recarga tambien cuando el contador de inserciones es cero.
  Si el aspirante no tiene datos bancarios en su fuente vinculada, siguen pendientes
  para Educacion; nunca se toman cuentas de beneficiarios ajenos.
- Los errores SQL se propagan como errores, no como una respuesta exitosa de
  cero filas. Si no hay coincidencias o ya estan cargadas, se informa en el modal.

Migracion correctiva: `supabase/migrations/20261113081000_fix_precarga_aspirantes_documentos.sql`.
Recuperacion bancaria al precargar: `supabase/migrations/20261113180000_completar_bancos_en_precarga.sql`.
Prueba de regresion con datos reales y `ROLLBACK`:

```sh
supabase db query --linked --file scripts/testing/test-precarga-aspirantes.sql
npm run build
```

## Editor visual de TERCEROS

El editor de TERCEROS usa un directorio con busqueda y una ficha de detalle,
en lugar de siete columnas de entradas estrechas. El patron lista-detalle
conserva el contexto de la seleccion; en movil se muestra una vista a la vez,
con navegacion de regreso al directorio.

Referencias de diseño:
- [PatternFly / Red Hat: primary-detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/).
- [Carbon: uso de tablas y espacio para evitar truncamiento](https://carbondesignsystem.com/components/data-table/usage/).

Incluye busqueda por cualquiera de los siete campos (sin distinguir tildes o
mayusculas), filtro de datos por completar, paginacion, ficha de lectura sin
truncar datos y edicion agrupada en identificacion, contacto y ubicacion.
Los campos opcionales pendientes no se confunden con errores que bloquean guardar.
Los tipos de identificacion precargados se conservan, incluso si no aparecen
en las opciones frecuentes.

`Guardar cambios` utiliza `guardar_terceros_cargue` para persistir altas,
ediciones y eliminaciones de forma atomica. Solo admite TERCEROS en borrador y
el rol `admin_educacion`; Presupuesto utiliza la correccion auditada descrita
mas abajo, sin altas ni bajas. Compara `editado_en` para
rechazar ediciones desactualizadas; conserva los identificadores y datos
financieros de las filas existentes. Nunca modifica `personas` ni `inscripciones`.
El documento puede guardarse vacio despues de confirmar las eliminaciones.

La interfaz advierte al recargar, volver desde el editor o cambiar a la pestaña
de validaciones con cambios pendientes, y bloquea la precarga
hasta que se guarden, evitando que una recarga sustituya cambios locales.
RP y los demas tipos conservan su editor y flujo anterior.

Migracion: `supabase/migrations/20261113110000_guardar_editor_terceros.sql`.
Pruebas:

```sh
node --test scripts/testing/test-editor-terceros.mjs
supabase db query --linked --file scripts/testing/test-guardar-editor-terceros.sql
supabase db query --linked --file scripts/testing/test-precarga-aspirantes.sql
npm run build
```

La prueba SQL de guardado utiliza datos sinteticos en documentos temporales
y revierte toda la transaccion. Las pruebas de navegador deben usar datos
sinteticos y cubrir busqueda, filtros, edicion, alta, eliminacion confirmada,
errores de guardado y lectura en escritorio y movil.

## Formato completo de Presupuesto: 22 columnas

Migracion vigente: `supabase/migrations/20261113170000_terceros_presupuesto_completo.sql`.
Proteccion de identidad y documentos aprobados:
`supabase/migrations/20261113171000_fijar_identidad_documentos_cargue.sql`.

Orden exacto del archivo XLSX y la lista de Presupuesto:

```text
C.C/NIT | Nombre/Razón Social | Segundo Apellido | Primer Apellido |
Segundo Nombre | Primer Nombre | Tipo Identificación | Código Cargo |
Código Dependencia | Email | Teléfono | Dirección | Digito Verificador |
Tipo Tercero | Naturaleza | Régimen | País | Departamento | Ciudad |
Banco | Tipo Cuenta | Numero cuenta
```

- Nombre/Razon Social, Codigo Cargo y Digito Verificador se exportan vacios.
- Constantes: dependencia `4`, tercero `OTROS`, naturaleza `0`, regimen `0`,
  pais `52`, departamento `23`, ciudad `466`. El municipio original se conserva
  en `portal_valores_cargue.ciudad`, sin sustituirlo por el codigo de importacion.
- Tipos: CC=13, RC=11, TI=12, TE=21, CE=22, Cuenta=14, NIT=31,
  Pasaporte=41, Documento Extranjero=42, Sin Identificacion Exterior=43, Otros=44.
  Los tipos sin equivalencia confirmada (por ejemplo PPT) requieren seleccion
  explicita; nunca se convierten silenciosamente en CC.
- Los datos bancarios se toman de `inscripciones.datos_bancarios`, luego de la
  persona y finalmente del beneficiario relacionado a esa inscripcion/persona
  y convocatoria. No se hace una precarga general de beneficiarios historicos.
  `ahorro`, como lo guarda Registro, se normaliza a `AHORROS`.
- Los campos separados existentes tienen prioridad sobre la sugerencia de
  nombres. Si solo existe nombre completo, los dos ultimos terminos se sugieren
  como apellidos y el resto como nombres. Esta heuristica NO certifica el dato:
  Educacion debe revisar nombres compuestos, corregir y confirmar cada ficha.
  Cambiar cualquier nombre/apellido invalida la confirmacion en el editor.
- Los campos nuevos se guardan en `datos_tercero` JSONB. El nombre original,
  identificacion, contacto, municipio, IDs y valores financieros se conservan.
  Abrir un borrador en Educacion completa solo claves fuente ausentes.
- Se permiten borradores incompletos. Para enviar/aprobar se exige identificacion,
  tipo, primer nombre, ambos apellidos, email, telefono, direccion, banco, tipo
  y numero de cuenta, ademas de confirmar nombres. Segundo nombre es opcional.
  Identificacion: solo digitos, maximo 15; nombres/apellidos: 120 cada uno;
  email: 100; telefono: 30; direccion: 500. No se truncan datos.
- La lectura usa una RPC de agregacion bajo RLS para no truncar a 1000 filas.
  El guardado conserva la comprobacion de concurrencia y es atomico.
- La pestaña Validaciones y el endpoint de validacion de TERCEROS revisan los
  registros guardados con las mismas reglas actuales, incluyendo duplicados y
  confirmacion de nombres. No se pueden ocultar esos errores marcandolos
  manualmente como resueltos ni se exige la razon social que debe ir vacia.

### Revision, descarga y continuacion

Educacion envia; Presupuesto revisa una tabla de 22 columnas con busqueda,
paginacion y desplazamiento horizontal, y aprueba o rechaza. Descargar no cambia
el estado. El Excel incluye todas las filas guardadas, no solo el filtro o pagina.
La descarga exige una instantanea autorizada y valida del documento enviado,
aprobado o finalizado. No se publica ningun archivo en Storage.

### Correcciones controladas de Presupuesto

Migracion: `supabase/migrations/20261113190000_correcciones_presupuesto_terceros.sql`.

- Solo `admin_presupuesto`, sobre TERCEROS en `enviado_para_revision`.
  Cada celda editable tiene un lapiz que abre la ficha de la persona.
  Los campos fijos y deliberadamente vacios del formato no son editables.
- Se exige motivo, ficha completa y formatos validos antes de guardar.
  Cambiar nombres/apellidos exige confirmarlos expresamente otra vez.
  En documentos antiguos incompletos, completar toda la ficha antes de guardar.
- `corregir_tercero_presupuesto` bloquea el documento y compara `editado_en`:
  no sobrescribe otra edicion ni permite editar despues de aprobar/rechazar.
  La fila debe pertenecer al documento; no admite altas, bajas, duplicados,
  cambios de municipio original, nombre fuente ni valores financieros.
- Guarda solo la copia documental. `personas`, `inscripciones` y perfiles de
  beneficiarios no cambian. Educacion conserva su guardado anterior en borrador.
- El trigger registra cada celda modificada en `portal_correcciones_terceros`
  con fila, identificacion, usuario, fecha, motivo y valores anterior/nuevo.
  La lectura usa RLS del documento y una RPC agregada para evitar truncamientos;
  el cliente no tiene permisos de insertar, alterar ni borrar esta bitacora.
  `Ver historial de correcciones` muestra los cambios y el identificador de usuario.
- Guardar no aprueba. Mientras la ficha esta abierta se bloquean descarga y
  acciones de flujo; al guardar o cancelar vuelven a habilitarse.
  El Excel siempre usa los valores guardados actuales.
- Aprobados/finalizados, rechazados y borradores son de solo lectura para
  Presupuesto. Agregar o eliminar personas corresponde a Educacion mediante
  rechazo, reapertura y reenvio.

Regresion transaccional:

```sh
supabase db query --linked --file scripts/testing/test-correcciones-presupuesto.sql
```

`generar-terceros` ahora devuelve el binario XLSX con las mismas reglas, en vez
del CSV antiguo basado en la tabla auxiliar historica. Usa el mismo contrato
JS y generador Excel que la interfaz.

Al rechazar, Educacion utiliza **Reabrir para corregir**, guarda el borrador y
lo reenvia. Envio, aprobacion y rechazo se realizan mediante una RPC atomica
que verifica rol, estado, contenido y registra la transicion. Los endpoints
existentes delegan en esa RPC con la sesion del solicitante.

Los triggers aplican las restricciones tambien a las escrituras directas:
solo Educacion edita terceros en borrador; solo Presupuesto aprueba TERCEROS.
Presupuesto puede corregir celdas existentes en revision mediante la RPC
auditada; no se habilitan escrituras directas desde el cliente.
RP requiere un TERCEROS aprobado/finalizado con aprobador registrado de la
misma convocatoria para crearse, precargarse, enviarse, aprobarse o exportarse.
Los documentos ya aprobados/finalizados no se convierten ni se reabren.
Los TERCEROS anteriores enviados e incompletos pueden completarse mediante
correccion auditada de Presupuesto o rechazarse para Educacion. La ficha debe
quedar completa y con nombres confirmados; no se aprueban automaticamente.

**Compatibilidad externa pendiente:** Banco se exporta por nombre y Tipo Cuenta
como `AHORROS`/`CORRIENTE`, segun lo acordado. Se debe validar una importacion
de prueba con Presupuesto antes de considerar certificado el formato para su
programa; todavia no se ha proporcionado la plantilla original.

Pruebas actualizadas:

```sh
node --test scripts/testing/test-editor-terceros.mjs scripts/testing/test-listado-documentos-por-rol.mjs scripts/testing/test-flujo-presupuesto-edge.mjs
supabase db query --linked --file scripts/testing/test-guardar-editor-terceros.sql
supabase db query --linked --file scripts/testing/test-precarga-aspirantes.sql
supabase db query --linked --file scripts/testing/test-correcciones-presupuesto.sql
npm run build
```

La prueba de guardado cubre el flujo completo y lectura de 1001 filas. La prueba
de precarga instrumenta temporalmente datos bancarios de una inscripcion real
y revierte la transaccion completa. No se imprimen datos personales.

## Bandeja de revision de Presupuesto

`obtener-documentos-por-rol` crea un cliente por peticion y transmite la cabecera
`Authorization` tanto a la verificacion de usuario como a la consulta. Verificar
el JWT con `getUser(token)` no autentica por si solo las consultas posteriores:
sin esa cabecera, RLS las ejecutaba como anonimas y devolvia una bandeja vacia.
No se utiliza la clave de servicio ni se amplian las politicas RLS.

El rol se resuelve igual que en la pagina, considerando los roles reconocidos
en los metadatos de usuario y aplicacion. Presupuesto puede listar TERCEROS y RP
de la convocatoria seleccionada. Los filtros de tipo y estado de la interfaz
se aplican sobre el listado autorizado completo, incluso despues de actualizar.
Las respuestas atrasadas de otra convocatoria se descartan y los errores se
muestran explicitamente.

Las acciones del documento utilizan su estado real, no un borrador fijo.
Un TERCEROS enviado se abre en lectura y ofrece Aprobar/Rechazar a Presupuesto.
Al completar una accion se actualizan las acciones y se recarga el editor.

Pruebas:

```sh
node --test scripts/testing/test-listado-documentos-por-rol.mjs scripts/testing/test-editor-terceros.mjs
supabase db query --linked --file scripts/testing/test-presupuesto-documento-enviado.sql
npm run build
```

La prueba del endpoint ejecuta su codigo real con autenticacion y transporte
simulados. La prueba SQL comprueba, bajo el rol autenticado de Presupuesto, la
lectura del documento reportado en revision y sus tres terceros, con `ROLLBACK`.
Es una comprobacion puntual del incidente: presupone que ese documento sigue
en revision. Las pruebas de navegador usan datos sinteticos y no aprueban
documentos reales.

Desplegar solamente la funcion modificada, manteniendo la verificacion de JWT:

```sh
supabase functions deploy obtener-documentos-por-rol --use-api
```

## Historial anterior (no vigente)

Las notas siguientes describen intentos previos; las firmas, fuentes y
afirmaciones de despliegue antiguas no sustituyen el comportamiento indicado arriba.

**Fecha:** 2026-11-12  
**Status:** ✅ COMPLETADO, PUSHEADO Y MIGRACIONES EJECUTADAS EN SUPABASE  
**Commits:** a054428, 1451592, 8672d53, fb06539  

---

## 📋 PROBLEMAS RESUELTOS

### 1. Campos Incompletos
- **Antes:** Solo se precargaban identificación + nombre
- **Ahora:** Se precarga: ID, Nombre, Tipo ID, Email, Teléfono, Dirección, Ciudad

### 2. Precarga Sin Filtros
- **Antes:** El botón traía TODA la tabla de aspirantes
- **Ahora:** Modal con filtros:
  - Seleccionar Convocatoria (2026-1, 2025-2, etc)
  - Seleccionar Estado (Aspirante, Admitido, Rechazado, Pendiente)

### 3. Datos Dispersos
- **Antes:** Información en múltiples tablas/fuentes
- **Ahora:** Todo centralizado en `inscripciones.datos_formulario` (JSON)

---

## 🔧 CAMBIOS TÉCNICOS

### Backend SQL
**Archivo:** `supabase/migrations/20261112130700_precargar_rp_con_filtros.sql`

**Nueva función RPC:**
```sql
precargar_rp_convocatoria(
  p_documento_id UUID,
  p_modalidad_beca VARCHAR(50) DEFAULT NULL
)
```

**Campos precargados (9 total):**
1. identificacion (requerido)
2. nombre_beneficiario (requerido)
3. tipo_identificacion
4. email
5. telefono
6. direccion
7. ciudad
8. modalidad_beca
9. modalidad_beca

**Fuente de datos:**
```
inscripciones.datos_formulario (JSON)
├── numero_documento → identificacion
├── nombre_completo → nombre_beneficiario
├── tipo_documento → tipo_identificacion
├── email → email
├── telefono → telefono
├── direccion → direccion
└── ciudad → ciudad
```

### Frontend React
**Archivo:** `src/components/EditorDocumentoCargue.jsx`

**Nuevos estados:**
```javascript
const [mostrarModalFiltros, setMostrarModalFiltros] = useState(false)
const [convocatoriaFiltro, setConvocatoriaFiltro] = useState('')
const [estadoFiltro, setEstadoFiltro] = useState('admitido')
const [convocatorias, setConvocatorias] = useState([])
```

**Campos RP actualizados:**
```javascript
rp: [
  { name: 'identificacion', label: 'Identificación', required: true },
  { name: 'nombre_beneficiario', label: 'Nombre', required: true },
  { name: 'tipo_identificacion', label: 'Tipo Identificación', required: false },
  { name: 'email', label: 'Email', required: false },
  { name: 'telefono', label: 'Teléfono', required: false },
  { name: 'direccion', label: 'Dirección', required: false },
  { name: 'ciudad', label: 'Ciudad', required: false }
]
```

**Nuevas funciones:**
- `precargarDesdeAspirantes()` - Abre modal de filtros
- `realizarPrecarga()` - Ejecuta precarga con filtros seleccionados
- `cargarConvocatorias()` - Carga convocatorias disponibles desde BD

**Modal de filtros:**
- Selector de Convocatoria (dinámico desde BD)
- Selector de Estado (aspirante, admitido, rechazado, pendiente)
- Z-index correcto (`pointer-events-none/auto`)

---

## 📊 ESTADÍSTICAS

| Métrica | Valor |
|---------|-------|
| Archivos modificados | 2 |
| Commits | 2 |
| Líneas de código | ~350 |
| Campos nuevos | 5 (tipo_id, email, teléfono, dirección, ciudad) |
| Validaciones | 8 |

---

## 🚀 DEPLOYMENT

### Status: ✅ MIGRACIONES EJECUTADAS EN SUPABASE

Todas las migraciones se han ejecutado exitosamente en Supabase remoto via CLI.

---

## ✅ MIGRACIONES EJECUTADAS

### 1. Migración 20261112130700_precargar_rp_con_filtros.sql
- **Status:** ✅ Ejecutada en Supabase
- **Contenido:** Función RPC `precargar_rp_convocatoria()` con filtros
- **Fecha ejecución:** 2026-11-12 13:30:30

### 2. Migración 20261112131000_agregar_columnas_precargar.sql
- **Status:** ✅ Ejecutada en Supabase
- **Contenido:** Agregar 5 columnas + índices + comentarios
- **Fecha ejecución:** 2026-11-12 13:32:45
- **Columnas creadas:**
  - tipo_identificacion VARCHAR(10)
  - email VARCHAR(100)
  - telefono VARCHAR(20)
  - direccion VARCHAR(255)
  - ciudad VARCHAR(100)

**Índices creados:**
- idx_portal_valores_cargue_email
- idx_portal_valores_cargue_identificacion_tipo

---

- ✓ Solo `admin_educacion` puede precargar
- ✓ Solo documentos tipo 'rp' en estado 'borrador'
- ✓ Solo aspirantes con cédula válida (regex numérico)
- ✓ No duplica registros (ON CONFLICT DO NOTHING)
- ✓ Manejo de campos nulos con valores por defecto
- ✓ Modal con Z-index correcto
- ✓ Convocatorias cargadas dinámicamente
- ✓ Reseteo de filtros al cerrar modal

---

## 💻 USO EN NAVEGADOR

```
[Precargar desde Aspirantes] ← Click

MODAL:
┌─────────────────────────────┐
│ Seleccionar Filtros         │
├─────────────────────────────┤
│ Convocatoria: [2026-1 ▼]   │
│ Estado: [Admitido    ▼]    │
│ [Cancelar] [Precargar]     │
└─────────────────────────────┘

↓ Executa SQL ↓

FROM inscripciones
WHERE convocatoria_id = 2026-1
AND estado = 'admitido'

↓ Extrae campos ↓

ID, Nombre, Tipo ID, Email, Tel, Dirección, Ciudad

↓ Llena tabla ↓

Usuario puede: Editar → Validar → Guardar
```

---

## 🔗 REFERENCIAS

- **Commit 1:** a054428 - fix: RP + aspirantes admitidos + Z-index modal
- **Commit 2:** 1451592 - feat: precarga con filtros + campos completos
- **Branch:** main
- **Status:** ✅ PUSHED a GitHub

---

## 📝 NOTAS

1. Los datos se extraen de `inscripciones.datos_formulario` que es JSONB
2. Si faltan campos en el JSON, se llena con valores por defecto
3. Los estados en inscripciones pueden variar según configuración
4. La función es backward compatible con versión anterior sin parámetros
5. La precarga es atómica (todo o nada, sin datos parciales)

---

## ✨ CARACTERÍSTICAS DESTACADAS

- ✨ Modal con Z-index correcto (siempre visible)
- ✨ Convocatorias cargadas dinámicamente (no hardcoded)
- ✨ Estados configurables en lista de opciones
- ✨ Validación de documento válido (regex numérico)
- ✨ No duplica registros
- ✨ Manejo seguro de transacciones
- ✨ Mensajes descriptivos de error y éxito
- ✨ Reseteo automático de filtros

---

**STATUS:** ✅ LISTO PARA PRODUCCIÓN

Todos los cambios están implementados, committeados y pusheados a GitHub.
Solo falta ejecutar la migración SQL en Supabase Console.
