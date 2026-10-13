# 🚨 URGENTE: Reemplazar Código en Supabase Functions

**Problema:** La función serverless en Supabase tiene código VIEJO que sube a Supabase Storage.

**Solución:** Reemplazar el código con la versión que usa R2.

---

## Pasos (5 minutos):

### 1. Abre Supabase Dashboard
https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions

### 2. Busca la función: `subsanar-actualizacion-beneficiario`

### 3. VE ACTUAL (Lo que está roto):
Verás código que contiene:
```typescript
// ❌ VIEJO - Sube a Supabase Storage
const { error: uploadError } = await supabase.storage
  .from('soportes')
  .upload(nuevoPath, buffer, { ... })
```

### 4. REEMPLAZA CON NUEVO CÓDIGO:
Copia TODO el contenido del archivo local:
`supabase/functions/subsanar-actualizacion-beneficiario/index.ts`

Este código contiene `aws.sign()` en lugar de `.storage.from()`.

### 5. Pega en el editor de Supabase Dashboard

### 6. CONFIGURA VARIABLES DE ENTORNO (si no están):

En la sección **Environment Variables** de la función, agrega:
```
R2_ACCESS_KEY_ID = 316580a617ece85e36f746653265e92f
R2_SECRET_ACCESS_KEY = 4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40
R2_ENDPOINT = https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com
R2_BUCKET = focades-pro
```

### 7. DEPLOY
- Click en "Deploy" o similar para guardar cambios

### 8. VERIFICA
Prueba una subsanación nuevo documento. Debe:
- ✅ Ir a R2 (URL: `soportes/beneficiarios/...`)
- ✅ NO aparecer en Supabase Storage
- ✅ Aparecer en Cloudflare R2 Dashboard

---

## Código a Copiar

Abre este archivo local con todos los cambios:

**Ruta:** `supabase/functions/subsanar-actualizacion-beneficiario/index.ts`

Copia TODO el contenido y reemplaza en Supabase Dashboard.

---

## Diferencia Clave

| Viejo (Supabase Storage) | Nuevo (R2) |
|---|---|
| `supabase.storage.from('soportes').upload()` | `aws.sign(uploadRequest)` |
| Almacena en Supabase | Almacena en Cloudflare R2 |
| Inseguro (credenciales en cliente) | Seguro (credenciales solo servidor) |

---

## ¿Tienes dudas?

Si no encuentras el editor en Supabase Dashboard, busca:
- Menu lateral → Functions
- O: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions
