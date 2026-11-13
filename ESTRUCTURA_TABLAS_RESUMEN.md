# RESUMEN: ESTRUCTURA DE TABLAS - FOCADES PRO

> Actualizacion del cargue: la fuente de TERCEROS es `inscripciones` y sus
> relaciones; el documento guarda sus filas en `portal_valores_cargue`.
> RP continua desde un TERCEROS aprobado de la misma convocatoria, enlazado
> por `portal_documentos_cargue.rp_terceros_id`. Sus 16 campos y confirmaciones
> por persona se guardan en `portal_valores_cargue.datos_rp`; valor_bruto,
> valor_neto y numero_rp conservan los datos financieros para continuidad.
> Educacion puede agregar personas mediante busqueda en las tres fuentes,
> incluso de otras convocatorias. Presupuesto confirma su existencia externa.
> Los 22 campos de Presupuesto y sus reglas vigentes se documentan en
> [PRECARGA_ASPIRANTES_RESUMEN.md](./PRECARGA_ASPIRANTES_RESUMEN.md).
> `inscripciones.datos_bancarios` contiene banco, tipo y numero de cuenta.
> `portal_valores_cargue.datos_tercero` conserva nombres separados, confirmacion
> y datos bancarios de la copia del documento. La tabla auxiliar de beneficiarios
> descrita mas abajo no es la fuente de exportacion del editor actual.
> `portal_correcciones_terceros` registra los ajustes de Presupuesto a las celdas
> de documentos en revision (usuario, fecha, motivo, valor anterior y nuevo).
> Es de solo lectura para clientes autorizados; no modifica los perfiles fuente.

## 1. VALORES DEL CAMPO `etapa` EN TABLA `inscripciones`

**Ubicación:** `inscripciones.etapa` (VARCHAR)
**Tipo:** texto (text)
**Valor por defecto:** `'aspirante'`
**Valores identificados:**
- `aspirante` - Estado inicial cuando se crea la inscripción
- `legalizacion` - Etapa donde el aspirante debe cargar documentos de legalización (ej: certificado bancario)

**Notas:** 
- El campo usa valores en minúsculas
- Se inicializa con 'aspirante' al crear la inscripción (202603090002_inscripciones_flujo_publico.sql)
- La transición a 'legalizacion' aparece como requisito para promover a beneficiario
- No hay constraint CHECK explícito que limite los valores

---

## 2. VALORES POSIBLES DE `estado_beneficiario` EN TABLA `portal_beneficiarios`

**Ubicación:** `portal_beneficiarios.estado_beneficiario`
**Tipo:** texto (text)
**Valor por defecto:** `'activo'`

**Valores válidos (con CHECK constraint):**
- `activo` - Beneficiario activo en el programa
- `suspendido` - Beneficiario suspendido temporalmente
- `retirado` - Beneficiario que se ha retirado
- `condonado` - Beneficiario con deuda condonada
- `egresado` - Beneficiario que ya egresó

**Constraint SQL:**
```sql
CHECK (estado_beneficiario IN ('activo','suspendido','retirado','condonado','egresado'))
```

**Índice:**
```sql
CREATE INDEX idx_portal_beneficiarios_estado ON public.portal_beneficiarios(estado_beneficiario);
```

---

## 3. INFORMACIÓN DE MODALIDAD (Sueños, Mérito)

### Ubicación de datos:
La información de modalidad está distribuida en dos lugares:

#### A. En tabla `portal_beneficiarios`:

**Campo:** `modalidad_beca` (texto)
**Ubicación de definición:** 202608120002_extend_portal_beneficiarios.sql
**Comentario:** 'Modalidad de la beca: MÉRITO, SUEÑOS, etc'
**Valores identificados:**
- `MÉRITO` / `Mérito` - Apoyo al Mérito Educativo (estudiante con mejor puntaje Saber 11)
- `SUEÑOS` / `Sueño` - Apoyo a Sueños Educativos (75 estudiantes con prioridad zonas rurales)

**Características:**
- Campo opcional (puede ser NULL)
- Se asigna cuando se promueve un aspirante a beneficiario
- Almacena la modalidad de beca que aplica al beneficiario

#### B. En tabla `inscripciones` (datos_formulario JSONB):

**Ubicación:** `inscripciones.datos_formulario ->> 'modalidad'` o `modalidad_aspira`
**Notas:**
- Valor guardado en JSON dentro del formulario de inscripción
- Puede existir como `'modalidad'` o `'modalidad_aspira'` (para compatibilidad)
- Se lee con: `coalesce(datos_formulario ->> 'modalidad', datos_formulario ->> 'modalidad_aspira')`

#### C. Tabla de requisitos por modalidad:

**Tabla:** `portal_requisitos_modalidad` (20260824000002_portal_documentacion_system.sql)
**Propósito:** Almacena requisitos de documentación por modalidad de formación

**Campos:**
- `modalidad` (TEXT) - Restricción: `('tecnico', 'tecnologo', 'profesional', 'general')`
- `nombre_requisito` (TEXT)
- `descripcion` (TEXT)
- `orden` (INTEGER)
- `activo` (BOOLEAN)

**Nota:** Esta tabla `modalidad` se refiere a modalidad de **formación** (técnico, tecnólogo, profesional), NO a modalidad de beca (Mérito/Sueños)

#### D. En tabla `portal_beneficiarios`:

**Campo adicional:** `modalidad` (texto)
**Ubicación de definición:** 202608140001_extend_beneficiarios_onboarding_completo.sql
**Comentario:** 'Modalidad de estudio (PRESENCIAL, VIRTUAL, DISTANCIA)'
**Constraint:**
```sql
CHECK (modalidad IS NULL OR modalidad IN ('PRESENCIAL', 'VIRTUAL', 'DISTANCIA', 'SEMIPRESENCIAL'))
```

**Nota:** Este es modalidad de **estudio**, NO la modalidad de beca (Mérito/Sueños)

---

## 4. RELACIONES ENTRE LAS TRES TABLAS

### Diagrama de Relaciones:

```
┌─────────────────────────────────────────────────────────────────┐
│                        inscripciones                             │
├─────────────────────────────────────────────────────────────────┤
│ id (uuid, PK)                                                   │
│ persona_id (uuid)                                               │
│ convocatoria_id (uuid)                                          │
│ etapa (text) ──────────────────────┐                            │
│ datos_formulario (jsonb)           │                            │
│   └─ modalidad (dentro de JSONB)   │                            │
│ promovido_a_beneficiario (boolean) │                            │
│ beneficiario_portal_id (bigint)────┼────────┐                   │
│ promovido_at (timestamptz)         │        │                   │
│ promovido_por_user_id (uuid)       │        │                   │
└─────────────────────────────────────────────│───────────────────┘
                                              │
                                              │ (1:1)
                                              │ FK: beneficiario_portal_id
                                              │
┌─────────────────────────────────────────────▼───────────────────┐
│                    portal_beneficiarios                          │
├─────────────────────────────────────────────────────────────────┤
│ id (bigint, PK) ◄──────────────────────────────────────────────│
│ auth_user_id (uuid)                                             │
│ persona_id (uuid)                                               │
│ inscripcion_id (uuid)                                           │
│ inscripcion_pk (uuid) ────────┐                                 │
│ estado_beneficiario (text)    │                                 │
│ modalidad_beca (text)         │ (Mérito, Sueños)               │
│ modalidad (text)              │ (Presencial, Virtual, etc.)    │
│ radicado_inscripcion (text)   │                                 │
│ nombre_completo, email, etc.  │                                 │
│ semestre_actual (integer)     │                                 │
│ created_at, updated_at        │                                 │
└───────────────────────────────│─────────────────────────────────┘
                                │
                                │ (1:N)
                                │ FK: beneficiario_id
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│        portal_cargue_beneficiarios_terceros                      │
├─────────────────────────────────────────────────────────────────┤
│ id (uuid, PK)                                                   │
│ documento_cargue_id (uuid, FK)                                  │
│   └─ referencia a portal_documentos_cargue                      │
│ beneficiario_id (bigint, FK)  ◄──────────────────┐              │
│ numero_identificacion (varchar)                   │              │
│ fila_numero (integer)                             │              │
│ creado_en (timestamptz)                           │              │
│ (Otros campos según plantilla de cargue)          │              │
└───────────────────────────────────────────────────────────────────┘
```

### Descripción de Relaciones:

**1. inscripciones → portal_beneficiarios (1:1)**
   - **Campo clave:** `inscripciones.beneficiario_portal_id` → `portal_beneficiarios.id`
   - **Proceso:** Función `promover_inscripcion_a_beneficiario()` crea esta relación
   - **Prerequisitos:**
     - `inscripciones.etapa = 'legalizacion'`
     - `inscripciones.cert_bancario_requerido = true`
     - Certificado bancario cargado en soportes
   - **Datos transferidos:** nombre, documento, email, tipo_documento, teléfono, dirección, etc.

**2. portal_beneficiarios → portal_cargue_beneficiarios_terceros (1:N)**
   - **Campo clave:** `portal_cargue_beneficiarios_terceros.beneficiario_id` → `portal_beneficiarios.id`
   - **Propósito:** Registra qué beneficiarios aparecen en cada cargue masivo de terceros
   - **Tabla origen:** `portal_documentos_cargue` (tipos: 'terceros', 'rp', 'op', 'contabilidad', 'siafe')
   - **Auditoría:** Permite trazar cuándo y en qué documento se registró cada beneficiario

**3. Flujo completo de datos:**
   ```
   Aspirante llena inscripción 
        ↓
   inscripciones.datos_formulario[modalidad] = "Mérito" | "Sueños"
        ↓
   Aspirante llega a legalizacion (inscripciones.etapa = 'legalizacion')
        ↓
   Carga certificado bancario requerido
        ↓
   Admin promueve a beneficiario → Crea portal_beneficiarios
        ↓
   portal_beneficiarios.modalidad_beca = "MÉRITO" | "SUEÑOS"
        ↓
   Beneficiario se incluye en cargue masivo de terceros
        ↓
   Registro en portal_cargue_beneficiarios_terceros (auditoría)
   ```

---

## 5. CAMPOS CLAVE POR TABLA

### inscripciones
- `id` - Identificador único
- `persona_id` - Referencia a datos personales
- `convocatoria_id` - Qué convocatoria
- `etapa` - Estado: 'aspirante', 'legalizacion'
- `datos_formulario` - JSONB con respuestas del formulario (incluye modalidad)
- `cert_bancario_requerido` - ¿Requiere certificado?
- `beneficiario_portal_id` - FK a beneficiario (cuando se promueve)
- `promovido_a_beneficiario` - Flag de promoción

### portal_beneficiarios
- `id` - Identificador único
- `auth_user_id` - Usuario autenticado asociado
- `estado_beneficiario` - Estado: activo, suspendido, retirado, condonado, egresado
- `modalidad_beca` - "MÉRITO" o "SUEÑOS"
- `modalidad` - "PRESENCIAL", "VIRTUAL", "DISTANCIA", "SEMIPRESENCIAL"
- `inscripcion_pk` - Referencia a inscripciones original
- `semestre_actual` - Avance académico
- `perfil_completado_en` - Marca cuando completó perfil

### portal_cargue_beneficiarios_terceros
- `id` - Identificador único (UUID)
- `documento_cargue_id` - Documento de cargue al que pertenece
- `beneficiario_id` - Beneficiario (FK a portal_beneficiarios)
- `numero_identificacion` - Documento para auditoría
- `fila_numero` - Ubicación en documento
- `creado_en` - Timestamp de registro

---

## 6. CONSIDERAR EN DESARROLLO

1. **Dos tipos de "modalidad"** en `portal_beneficiarios`:
   - `modalidad_beca`: Mérito/Sueños (tipo de ayuda)
   - `modalidad`: Presencial/Virtual (forma de estudio)

2. **Etapa de inscripción** solo tiene dos valores confirmados:
   - 'aspirante' (inicial)
   - 'legalizacion' (documento requerido)
   - No hay validación CHECK en BD (puede haber otros valores)

3. **Estado de beneficiario** tiene 5 estados restringidos por CHECK

4. **Modalidad en inscripciones** está en JSONB, no es campo nativo de tabla

5. **Promoción de aspirante a beneficiario** es operación de admin, requiere etapa 'legalizacion' y documentos
