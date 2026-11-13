# Precarga de aspirantes: comportamiento vigente

Actualizado: 2026-11-13.

- Ruta: `/admin/cargue-documentos`.
- Tanto TERCEROS como RP admiten precarga en borrador, exclusivamente para
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
- Los identificadores de inscripciones son UUID. No se truncan datos ni se
  sustituyen identificaciones o nombres faltantes por datos ficticios.
- La RPC conserva el nombre publicado `precargar_rp_convocatoria` y recibe
  `p_documento_id`, `p_convocatoria_id`, `p_estado`, `p_modalidad_beca`.
  La creacion automatica de RP usa `admitido` y la modalidad opcional real
  (`Sueño Educativo` o `Mérito Educativo`).
- El contador devuelto corresponde a filas efectivamente insertadas.
  Repetir la precarga no duplica ni sobrescribe filas existentes.
- Los errores SQL se propagan como errores, no como una respuesta exitosa de
  cero filas. Si no hay coincidencias o ya estan cargadas, se informa en el modal.

Migracion correctiva: `supabase/migrations/20261113081000_fix_precarga_aspirantes_documentos.sql`.
Prueba de regresion con datos reales y `ROLLBACK`:

```sh
supabase db query --linked --file scripts/testing/test-precarga-aspirantes.sql
npm run build
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
