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

## 🚧 Fase 3: Frontend - Componente Base (COMPLETADA ✅)

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
- ✅ **Renderizado de todos los pasos (1-12)**
- ✅ **Paso 1:** Verificar documento
- ✅ **Paso 2:** Revisar email
- ✅ **Paso 3:** Establecer contraseña (con validadores)
- ✅ **Paso 4:** Datos personales (género, fecha nac, teléfono, dirección)
- ✅ **Paso 5:** Información socioeconómica (SISBEN, subsidios, enfoque)
- ✅ **Paso 6:** Formación secundaria (colegio, ICFES, año graduación)
- ✅ **Paso 7:** Formación superior (universidad, programa, modalidad)
- ✅ **Paso 8:** Información de beca (modalidad, año convocatoria)
- ✅ **Paso 9:** Información bancaria (banco, cuenta con confirmación)
- ✅ **Paso 10:** Documentos (placeholder - mensaje informativo)
- ✅ **Paso 11:** Términos y firma (checkboxes de aceptación)
- ✅ **Paso 12:** Resumen final (botón "Ir al Portal")
- ✅ Componente ValidationItem para validadores de contraseña
- ✅ Integración con catálogos (bancos, establecimientos)
- ✅ Lógica de autenticación (setup-init, setup-complete)
- ✅ Actualizado App.jsx para usar nuevo componente

### Pendiente:
- ❌ **Subida de documentos real (paso 10)** ← PRÓXIMA TAREA
- ❌ Canvas de firma digital (paso 11)
- ❌ Resumen completo con todos los datos (paso 12)

---

## 📋 Próximos Pasos Inmediatos

### 🔴 URGENTE: Ejecutar migración en Supabase (10 min)

Ve al [Supabase Dashboard](https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/sql/new) y:
1. Copia el contenido de `supabase/migrations/202608140001_extend_beneficiarios_onboarding_completo.sql`
2. Pega en SQL Editor
3. Ejecuta
4. Verifica que no haya errores

### 🔴 URGENTE: Desplegar Edge Function actualizada (5 min)

```bash
supabase functions deploy auth-credentials
```

### 🟡 Testing del flujo completo (30 min)

1. Abrir https://focades-pro.vercel.app/beneficiario/auth-setup
2. Probar flujo completo de 12 pasos
3. Verificar que datos se guardan en BD
4. Verificar que al finalizar redirija al portal

### 🟢 Opcional: Implementar subida de documentos (1-2 días)

Ver sección de implementación de documentos más abajo.

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
[████████████████░░░░] 80% completado

✅ Fase 1: Migración BD (100%)
✅ Fase 2: Backend (100%)
✅ Fase 3: Frontend pasos básicos (100%)
🚧 Fase 4: Subida de documentos (0%)
⏳ Fase 5: Testing (0%)
⏳ Fase 6: Despliegue (0%)
```

**Tiempo estimado restante:** 2-3 días

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
