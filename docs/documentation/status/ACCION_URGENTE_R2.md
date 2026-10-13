# 🚨 ACCIÓN INMEDIATA: Archivos SIGUEN Yendo a Supabase

**Confirmado:** Los últimos documentos subsanados (1/10/2026 10:57 p.m.) están en Supabase Storage.

**Razón:** La función serverless en Supabase tiene código VIEJO que sube a Supabase en lugar de R2.

---

## ✅ SOLUCIÓN (10 minutos):

### PASO 1: Abre Supabase Dashboard
```
https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions
```

### PASO 2: Haz click en función `subsanar-actualizacion-beneficiario`

### PASO 3: REEMPLAZA el código

En el editor, borra TODO y pega este código:
[Ver archivo: `/tmp/codigo-r2-correcto.ts`]

O copia del archivo local:
`supabase/functions/subsanar-actualizacion-beneficiario/index.ts`

**Diferencia clave que buscas:**
- ❌ VIEJO: `.storage.from('soportes').upload(...)`
- ✅ NUEVO: `aws.sign(uploadRequest)`

### PASO 4: Configura 4 Variables de Entorno

En **Environment Variables** de la función, agrega:

```
R2_ACCESS_KEY_ID
316580a617ece85e36f746653265e92f

R2_SECRET_ACCESS_KEY
4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40

R2_ENDPOINT
https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com

R2_BUCKET
focades-pro
```

### PASO 5: DEPLOY
Click en "Deploy" en Supabase Dashboard

---

## 🧪 VERIFICACIÓN (Inmediata)

Después de deploy, prueba una subsanación:
1. Abre portal beneficiario
2. Carga un nuevo documento de subsanación
3. Verifica:
   - ❌ NO aparece en Supabase Storage
   - ✅ Aparece en Cloudflare R2 Dashboard
   - ✅ BD tiene path `soportes/beneficiarios/...`

---

## ¿POR QUÉ PASÓ?

1. Commit anterior (bcf1aa1) revertió el código a Supabase Storage
2. Ese código se quedó en Supabase Functions
3. Git push solo actualiza Vercel (React), NO Supabase Functions
4. Supabase Functions necesita redeploy manual o CLI

---

## NOTA:

Si tienes dudas en Supabase Dashboard:
- Menú lateral → **Functions** → **subsanar-actualizacion-beneficiario**
- Busca el editor de código
- Busca botón **Deploy**

**¿Necesitas más ayuda?** Pregunta en Slack o contacta al equipo dev.
