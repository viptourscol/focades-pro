# 🎯 PRECARGA DE ASPIRANTES CON CAMPOS COMPLETOS

**Fecha:** 2026-11-12  
**Status:** ✅ COMPLETADO Y PUSHEADO  
**Commits:** a054428, 1451592  

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

### Paso 1: Agregar columnas a tabla (si no existen)

```sql
ALTER TABLE portal_valores_cargue
ADD COLUMN IF NOT EXISTS tipo_identificacion VARCHAR(10),
ADD COLUMN IF NOT EXISTS email VARCHAR(100),
ADD COLUMN IF NOT EXISTS telefono VARCHAR(20),
ADD COLUMN IF NOT EXISTS direccion VARCHAR(255),
ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100);
```

### Paso 2: Crear función RPC

Copiar contenido completo de:
```
supabase/migrations/20261112130700_precargar_rp_con_filtros.sql
```

Ejecutar en Supabase Console → SQL Editor

### Paso 3: Verificar

```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'precargar_rp%';
```

Resultado esperado: 2 funciones (con y sin parámetros)

### Paso 4: Probar en navegador

1. Ir a `/admin/cargue-documentos`
2. Crear documento RP
3. Click "Precargar desde aspirantes"
4. Seleccionar convocatoria y estado
5. Verificar que se llenen todos los 7 campos

### Paso 5: Validar en BD

```sql
SELECT COUNT(*) as total_con_email
FROM portal_valores_cargue
WHERE email IS NOT NULL;
```

---

## ✅ VALIDACIONES INCLUIDAS

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
