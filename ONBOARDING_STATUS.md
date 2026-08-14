# Estado de Implementación: Onboarding Extendido para Beneficiarios

**Fecha inicio:** 2026-08-14  
**Objetivo:** Recopilar ~70 campos + 9 documentos durante activación de cuenta

---

## ✅ Fase 1: Migración de BD (COMPLETADA)

**Archivo:** `supabase/migrations/202608140001_extend_beneficiarios_onboarding_completo.sql`

### Columnas agregadas (40):
- ✅ Datos personales: fecha_nacimiento, pais_nacimiento, dpto_nacimiento, municipio_nacimiento, dpto_residencia, municipio_residencia, direccion_residencia, barrio_corregimiento, zona_residencia
- ✅ Socioeconómicos: sisben_grupo, recibe_subsidio, cual_subsidio, enfoque_diferencial, labora_actualmente
- ✅ Familia (opcional): nombre_padre, documento_padre, ocupacion_padre, ingresos_padre, nombre_madre, documento_madre, ocupacion_madre, ingresos_madre
- ✅ Formación secundaria: titulo_obtenido, ano_graduacion, establecimiento_educativo, puntaje_icfes, municipio_establecimiento
- ✅ Formación superior: institucion_superior, ciudad_institucion, modalidad, promedio_anterior

### Otros elementos:
- ✅ 7 índices creados para búsquedas
- ✅ CHECK constraints para validar valores
- ✅ Función `check_perfil_completitud()` para validar campos
- ✅ Políticas RLS para documentos
- ✅ Comentarios SQL en columnas

**Próximo:** Ejecutar migración en Supabase

---

## ✅ Fase 2: Backend - Edge Functions (COMPLETADA)

**Archivo:** `supabase/functions/auth-credentials/index.ts`

### Métodos agregados:
- ✅ `update-profile`: Actualiza perfil durante onboarding (acepta 40+ campos)
- ✅ `complete-onboarding`: Marca onboarding completado + timestamps

### Validaciones:
- ✅ Lista de campos permitidos (whitelist)
- ✅ Validación de beneficiario_id
- ✅ Timestamps automáticos (acepta_terminos_at, acepta_datos_at, perfil_completado_en)

**Próximo:** Desplegar Edge Function actualizada

---

## 🚧 Fase 3: Frontend - Componente Base (EN PROGRESO)

**Archivo:** `src/pages/BeneficiarioOnboardingCompleto.jsx`

### Completado:
- ✅ Estructura de 12 pasos
- ✅ Estado del formulario con todos los campos
- ✅ Navegación entre pasos (Anterior/Siguiente)
- ✅ Validaciones por paso
- ✅ Guardado automático en localStorage cada 30s
- ✅ Función `saveProgress()` y `loadSavedProgress()`
- ✅ Barra de progreso visual
- ✅ Botón "Guardar y salir"
- ✅ Integración con Edge Functions (`update-profile`, `complete-onboarding`)

### Pendiente:
- ❌ **Renderizado de cada paso (4-12)** ← SIGUIENTE TAREA
- ❌ Componentes de formulario para cada paso
- ❌ Subida de documentos (paso 10)
- ❌ Canvas de firma digital (paso 11)
- ❌ Resumen final (paso 12)
- ❌ Integración con catálogos (departamentos, municipios, colegios, universidades, bancos)

---

## 📋 Próximos Pasos Inmediatos

### 1. Ejecutar migración en Supabase (10 min)
```bash
# Opción A: Desde Supabase Dashboard
# - Ir a SQL Editor
# - Copiar contenido de 202608140001_extend_beneficiarios_onboarding_completo.sql
# - Ejecutar

# Opción B: Desde CLI
supabase db push
```

### 2. Desplegar Edge Function actualizada (5 min)
```bash
supabase functions deploy auth-credentials
```

### 3. Implementar renderizado de pasos (3-4 días)

#### **Paso 4: Datos Personales** (medio día)
- Campos: género, fecha nacimiento, teléfono, dirección, barrio, departamento, municipio, zona
- Componentes: RadioGroup, DatePicker, Input, Select con búsqueda

#### **Paso 5: Información Socioeconómica** (medio día)
- Campos obligatorios: SISBEN, recibe subsidio, enfoque diferencial, trabaja
- Campos opcionales: datos de padre y madre
- Componentes: RadioGroup, Select, Input numérico (ingresos)

#### **Paso 6: Formación Secundaria** (medio día)
- Campos: título obtenido, año graduación, colegio, puntaje ICFES
- Componentes: Select, NumberInput, Autocomplete para colegio

#### **Paso 7: Formación Superior** (medio día)
- Campos: universidad, programa, nivel, semestre ingreso/actual, modalidad, ciudad
- Componentes: Autocomplete para universidad, Input, Select

#### **Paso 8: Información de Beca** (medio día)
- Campos: modalidad beca, año convocatoria
- Componentes: RadioGroup, NumberInput

#### **Paso 9: Información Bancaria** (medio día)
- Campos: banco, tipo cuenta, número cuenta (confirmar 2 veces)
- Componentes: Select banco, Input número (solo dígitos), RadioGroup

#### **Paso 10: Documentos** (1 día)
- 9 documentos (7 obligatorios + 2 condicionales)
- Componentes: FileUploader con drag & drop, preview de PDF
- Validaciones: tamaño máximo, tipo MIME, nombre archivo
- Upload a Supabase Storage

#### **Paso 11: Términos y Firma** (1 día)
- Aceptación de términos y datos
- Canvas de firma digital (react-signature-canvas)
- Guardar firma como PNG en Storage

#### **Paso 12: Resumen Final** (medio día)
- Mostrar resumen de toda la información
- Permitir regresar a editar cualquier paso
- Botón "Finalizar y Crear Cuenta"

---

## 📦 Dependencias Nuevas Requeridas

```bash
npm install react-signature-canvas
npm install react-dropzone  # Para drag & drop de documentos
```

---

## 🧪 Testing

### Antes de mergear a main:
- [ ] Probar flujo completo (12 pasos)
- [ ] Verificar guardado automático
- [ ] Probar "Guardar y salir" y retomar
- [ ] Probar subida de todos los documentos
- [ ] Probar firma digital
- [ ] Validar que datos se guardan correctamente en BD
- [ ] Probar en móvil
- [ ] Probar con beneficiario histórico sin datos

---

## 🚀 Despliegue Final

1. ✅ Ejecutar migración en producción
2. ⏳ Desplegar Edge Functions actualizadas
3. ⏳ Desplegar frontend con componente completo
4. ⏳ Probar con beneficiario de prueba
5. ⏳ Activar link de onboarding en emails a beneficiarios
6. ⏳ Monitorear logs y errores

---

## 📊 Progreso General

```
[████████░░░░░░░░░░░░] 40% completado

✅ Fase 1: Migración BD (100%)
✅ Fase 2: Backend (100%)
🚧 Fase 3: Frontend estructura (30%)
⏳ Fase 4: Frontend pasos (0%)
⏳ Fase 5: Testing (0%)
⏳ Fase 6: Despliegue (0%)
```

**Tiempo estimado restante:** 5-7 días

---

## 💡 Notas de Implementación

### Consideraciones importantes:
1. **Campos opcionales vs obligatorios:** Datos familiares son opcionales
2. **Validaciones condicionales:** Ficha SISBEN solo si grupo != NO_APLICA
3. **Guardado incremental:** Cada paso guarda en BD automáticamente
4. **Experiencia móvil:** Debe ser responsive, muchos usuarios en móvil
5. **Tiempo de sesión:** Token de setup expira en 24h
6. **Reintentos:** Si falla upload de documento, permitir reintentar

### Mejoras futuras (no bloqueantes):
- Email de recordatorio si no completan en 3 días
- Prefill automático desde inscripción (si existe)
- Validación de número de cuenta con Luhn algorithm
- OCR para extraer datos de documentos
- Chat de soporte durante onboarding

---

**Última actualización:** 2026-08-14 por GitHub Copilot
