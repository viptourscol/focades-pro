# 🔒 R2 SECURITY IMPLEMENTATION - NEXT STEPS

**Status:** Code implementation complete ✅
**Date:** October 2, 2026

---

## 📋 CHECKLIST FINAL

### ✅ COMPLETADO (Código)

- [x] 3 Supabase Functions creadas con presigned URLs
- [x] r2-secure.js creado (client seguro sin credenciales)
- [x] 12 componentes actualizados para usar r2-secure.js
- [x] Credenciales removidas de .env, .env.local, .env.production.local
- [x] certificadoPazYSalvo.js actualizado a async getPublicUrlR2
- [x] Todos los cambios committed a git (commit: ce54e2c)

### ⏳ PENDIENTE (Configuración Manual)

#### Fase 1: Configurar Supabase Functions (15 min)

Cada una de las 3 NUEVAS funciones necesita 4 variables de entorno:

**Para: `get-presigned-upload-url`**
```
R2_ACCESS_KEY_ID = 316580a617ece85e36f746653265e92f
R2_SECRET_ACCESS_KEY = 4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40
R2_ENDPOINT = https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com
R2_BUCKET = focades-pro
```

**Para: `get-presigned-download-url`**
(Mismas 4 variables)

**Para: `delete-from-r2`**
(Mismas 4 variables)

**Pasos:**
1. Ir a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions
2. Hacer click en cada función (get-presigned-upload-url primero)
3. Encontrar sección "Environment Variables" o "Secrets"
4. Agregar 4 variables
5. Click "Deploy"
6. Repetir para las otras 2 funciones

#### Fase 2: Verificar que Funciones Serverless Existentes Tienen Variables (5 min)

Las siguientes funciones YA TIENEN código R2, pero necesitan verificar que tengan variables de entorno:

- `subsanar-actualizacion-beneficiario`
- `admin-document-action`
- `enviar-actualizacion-beneficiario`
- `generate-beneficiario-onboarding-docs`
- `generate-inscripcion-docs`
- `import-historicos-lote`

Verificar que cada una tenga las 4 variables R2_* configuradas. Si no las tienen, agregarlas.

#### Fase 3: Configurar Bucket R2 en Cloudflare (5 min)

1. Ir a: https://dash.cloudflare.com/?to=/:account/r2/overview
2. Seleccionar bucket: `focades-pro`
3. **Settings → Visibility**
   - Cambiar a: **PRIVATE** (si está en Public)
   - Save

4. **Settings → CORS**
   - Agregar CORS header para tu dominio:
   ```
   Allowed Origins: https://focades-pro.vercel.app, http://localhost:5173
   Allowed Methods: GET, PUT, POST, DELETE, HEAD, OPTIONS
   Allowed Headers: Content-Type, Authorization, x-amz-*
   Max Age: 3600
   ```

#### Fase 4: Revocar Credenciales Viejas en Cloudflare (3 min)

⚠️ **IMPORTANTE: Hacer después de verificar que todo funciona**

1. Cloudflare Dashboard → R2 → Account API Tokens
2. Buscar el token con ID: `316580a617ece85e36f746653265e92f` (parte de accessKeyId)
3. Crear NUEVO token de acceso (con permisos R2 solo)
4. Verificar que nuevo token funciona en Supabase Functions
5. Revocar el token viejo
6. Esperar ~30 segundos para propagación

---

## 📊 TESTING DESPUÉS DE CONFIGURACIÓN

### Test 1: Upload (Admin)
```
1. Admin Panel → Documentación
2. Click "Cargar Documento"
3. Seleccionar archivo PDF
4. Hacer click "Subir"
5. ✅ Archivo debe aparecer en R2 (verificar en Cloudflare Dashboard)
6. ✅ Archivo NO debe estar en Supabase Storage
```

### Test 2: Download (Beneficiario)
```
1. Beneficiario → Ver documento
2. Click "Descargar"
3. ✅ Descarga debe funcionar (presigned URL válida)
4. ✅ Verificar en DevTools → no hay credenciales expuestas
```

### Test 3: Security Check
```
1. Abrir DevTools (F12)
2. Application tab → LocalStorage / SessionStorage
3. Buscar: "VITE_R2_SECRET" → ❌ NO DEBE ENCONTRARSE
4. Ir a Variables de entorno local:
   - .env.local, .env.production.local → ❌ NO deben tener VITE_R2_SECRET_ACCESS_KEY
5. Inspeccionar Network tab durante upload:
   - POST a /functions/v1/get-presigned-upload-url → presignedUrl en respuesta
   - PUT a presignedUrl (R2) → upload con firma AWS, sin credenciales en headers visibles
```

### Test 4: Bucket Privacy
```
curl -I "https://focades-pro.82fdb4a6fd4628d720932bee674b6f7d.r2.dev/any-file.pdf"
# ✅ Response debe ser: 403 Forbidden
# ❌ Si es 200 OK, bucket sigue público → ir a Fase 3
```

---

## 🔑 CREDENCIALES ACTUALES

**Acceso Actual (válido hasta que lo revoquemos):**
```
Access Key ID: 316580a617ece85e36f746653265e92f
Secret: 4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40
Endpoint: https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com
Bucket: focades-pro
Public URL: https://focades-pro.82fdb4a6fd4628d720932bee674b6f7d.r2.dev
```

**Después de revocar (Fase 4):**
- Crear nuevas credenciales
- Reemplazar en Supabase Functions
- Verificar todo sigue funcionando
- Revocar las viejas

---

## ⚠️ COSAS IMPORTANTES

1. **NO agregar `VITE_R2_ACCESS_KEY_ID` o `VITE_R2_SECRET_ACCESS_KEY` al frontend**
   - Vercel build incluiría valores en JavaScript público
   - Devtools las expondría
   - Only server-side (Supabase Functions)

2. **Presigned URLs expiran automáticamente**
   - Upload: 1 hora (3600 seg)
   - Download: 24 horas (86400 seg)
   - Archive: 7 días (604800 seg)
   - Después del vencimiento: 403 Forbidden (normal)

3. **Logs en Supabase Functions**
   - Todas las operaciones R2 se registran
   - Ver en: Dashboard → Functions → [nombre] → Logs

4. **Si algo falla después de cambios:**
   - Verificar variables de entorno en Supabase Functions
   - Verificar Network tab en DevTools (¿qué error retorna presigned URL?)
   - Verificar Cloudflare R2 Dashboard → Logs
   - Rollback: `git revert ce54e2c` si es necesario

---

## 📞 SOPORTE

Si encontras errores:

1. **Error: "Missing R2 environment variables"**
   - Variables no configuradas en Supabase Function
   - Ver Fase 1

2. **Error: "Invalid token"**
   - Usuario no autenticado
   - Asegurar que está logeado en Supabase

3. **Error: "Admin access required"**
   - Solo admin puede usar delete-from-r2
   - Verificar que usuario está en tabla portal_admin_users

4. **Upload funciona pero archivo no aparece en R2**
   - Verificar que presigned URL fue usada correctamente
   - Presigned URL solo sirve para la ruta especificada

5. **Bucket aún público después de cambiar a Private**
   - Esperar 5 minutos (propagación Cloudflare)
   - Verificar que cambio fue guardado (click Save)

---

## ✅ RESUMEN SEGURIDAD DESPUÉS DE COMPLETAR TODAS LAS FASES

| Aspecto | Antes | Después |
|---------|-------|---------|
| Credenciales en cliente | ❌ SÍ (VULNERABLE) | ✅ NO |
| DevTools ve secretos | ❌ SÍ (VULNERABLE) | ✅ NO |
| Acceso sin autenticación | ❌ SÍ | ✅ NO |
| Presigned URLs | ⚠️ No usadas | ✅ AWS Signature V4 |
| Bucket público | ❌ SÍ | ✅ PRIVATE |
| Auditoría | ❌ Manual | ✅ Automática (logs) |
| Admin operations | ⚠️ Sin verificar | ✅ Verificadas |

---

**Tiempo estimado total: ~30 minutos**

**Próximo paso: Comienza con Fase 1 - Configurar Supabase Functions**

Avísame cuando completes cada fase 👇
