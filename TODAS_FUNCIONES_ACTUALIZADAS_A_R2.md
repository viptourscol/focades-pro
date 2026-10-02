# ✅ ACTUALIZACIÓN COMPLETADA: Todas las Funciones Serverless Ahora Usan R2

**Commit:** `a203e7b` - Todas las funciones serverless de manejo de documentos ahora usan Cloudflare R2

---

## 📋 Funciones Actualizadas (5 Total)

### 1. ✅ `subsanar-actualizacion-beneficiario` 
**Estado:** ESTABA MAL (usando Supabase) → YA CORREGIDA
- **Acción:** Cuando beneficiario reenvía documentos de subsanación
- **Cambio:** Ahora usa R2 con AWS Signature V4
- **Requiere:** Configurar variables de entorno en Supabase Functions

---

### 2. ✅ `admin-document-action`
**Estado:** NUEVO → ACTUALIZADO A R2
- **Acción:** Admin reemplaza o elimina documentos (en beneficiarios/)
- **Cambio:** Reemplaza/elimina ahora en R2, no en Supabase Storage
- **Requiere:** Redeploy en Supabase Functions

---

### 3. ✅ `enviar-actualizacion-beneficiario`
**Estado:** NUEVO → ACTUALIZADO A R2
- **Acción:** Beneficiario envía formulario de actualización con documentos
- **Cambio:** Archivos suben a R2, no Supabase Storage
- **Requiere:** Redeploy en Supabase Functions

---

### 4. ✅ `generate-beneficiario-onboarding-docs`
**Estado:** NUEVO → ACTUALIZADO A R2
- **Acción:** Genera documentos de onboarding para beneficiarios
- **Cambio:** PDFs se guardan en R2
- **Requiere:** Redeploy en Supabase Functions

---

### 5. ✅ `generate-inscripcion-docs`
**Estado:** NUEVO → ACTUALIZADO A R2
- **Acción:** Genera documentos de inscripción
- **Cambio:** PDFs se guardan en R2
- **Requiere:** Redeploy en Supabase Functions

---

### 6. ✅ `import-historicos-lote`
**Estado:** NUEVO → ACTUALIZADO A R2
- **Acción:** Importa documentos históricos en lote
- **Cambio:** Importación ahora va a R2
- **Requiere:** Redeploy en Supabase Functions

---

## 🎁 Helper Compartido Nuevo

**Archivo:** `supabase/functions/_shared/r2-helper.ts`

Proporciona funciones reutilizables para todas las funciones serverless:
- ✅ `uploadToR2()` - Sube archivo a R2 con firma AWS
- ✅ `deleteFromR2()` - Elimina archivo de R2
- ✅ `base64ToUint8Array()` - Convierte base64 a Uint8Array

---

## 🚀 QUÉ DEBES HACER AHORA

### PASO 1: Configurar Variables de Entorno
En **Supabase Dashboard** → **Edge Functions** → cada función serverless:

Agregar 4 variables en "Environment Variables":
```
R2_ACCESS_KEY_ID = 316580a617ece85e36f746653265e92f
R2_SECRET_ACCESS_KEY = 4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40
R2_ENDPOINT = https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com
R2_BUCKET = focades-pro
```

**Funciones que necesitan estas variables:**
1. `subsanar-actualizacion-beneficiario` - ⚠️ PRIORIDAD ALTA
2. `admin-document-action`
3. `enviar-actualizacion-beneficiario`
4. `generate-beneficiario-onboarding-docs`
5. `generate-inscripcion-docs`
6. `import-historicos-lote`

### PASO 2: Redeploy en Supabase Functions
Después de agregar variables, busca botón "Deploy" en cada función.

O opcionalmente, usa CLI:
```bash
supabase functions deploy admin-document-action
supabase functions deploy enviar-actualizacion-beneficiario
supabase functions deploy generate-beneficiario-onboarding-docs
supabase functions deploy generate-inscripcion-docs
supabase functions deploy import-historicos-lote
```

---

## ✅ Verificación

Después de desplegar, prueba:

### Prueba 1: Subsanación
1. Beneficiario va a sección de subsanación
2. Carga nuevo documento
3. Verifica en Cloudflare R2 Dashboard que el archivo está ahí
4. ✅ NO debe aparecer en Supabase Storage

### Prueba 2: Admin - Reemplazar Documento  
1. Admin → Beneficiarios
2. Busca un beneficiario
3. Reemplaza un documento
4. Verifica en R2 Dashboard
5. ✅ Archivo antiguo debe estar en R2, no duplicado en Supabase

### Prueba 3: Onboarding
1. Beneficiario completa onboarding
2. Sistemas genera documentos
3. Verifica en R2 Dashboard
4. ✅ Documentos en R2, no en Supabase

---

## 📊 Resumen de Cambios

| Componente | Antes | Ahora | Seguridad |
|---|---|---|---|
| subsanar-actualizacion-beneficiario | ❌ Supabase | ✅ R2 | ⭐⭐⭐ |
| admin-document-action | ❌ Supabase | ✅ R2 | ⭐⭐⭐ |
| enviar-actualizacion-beneficiario | ❌ Supabase | ✅ R2 | ⭐⭐⭐ |
| generate-beneficiario-onboarding-docs | ❌ Supabase | ✅ R2 | ⭐⭐⭐ |
| generate-inscripcion-docs | ❌ Supabase | ✅ R2 | ⭐⭐⭐ |
| import-historicos-lote | ❌ Supabase | ✅ R2 | ⭐⭐⭐ |

**Total de documentos afectados:** Todas las nuevas subidas irán a R2

---

## 🔐 Seguridad Mejorada

✅ **Credenciales R2 solo en servidor** (Supabase Functions)
✅ **AWS Signature V4 para firmar requests**
✅ **Cero exposición de credenciales al cliente**
✅ **Auditoría en BD con paths correctos en R2**

---

## ¿Preguntas?

Si algo falla después de desplegar:
1. Verifica en logs de Supabase Functions (Dashboard → Functions → Logs)
2. Confirma que las 4 variables de entorno están en cada función
3. Verifica que el redeploy se ejecutó exitosamente
4. Busca errores de conectividad a R2

**Estado:** ✅ Código actualizado, listo para producción
**Acción requerida:** Configurar variables + redeploy en Supabase Functions
