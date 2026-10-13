# 🚨 URGENTE: Configurar Variables de Entorno R2 en Supabase Functions

**Problema:** Los documentos de subsanación se siguen guardando en Supabase Storage porque las variables de entorno de R2 NO ESTÁN configuradas en Supabase Functions.

**Solución:** Debes configurar manualmente en Supabase Dashboard.

---

## Pasos a Seguir:

### 1. Ir al Supabase Dashboard
- Abre: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku
- (Reemplaza con tu proyecto si es diferente)

### 2. Ir a Edge Functions
En el menú lateral:
- **Edge Functions** → Encontrar la función `subsanar-actualizacion-beneficiario`

### 3. Configurar las 4 Variables de Entorno

En la sección "Environment Variables" o similar, agrega estas 4 variables:

| Variable | Valor |
|----------|-------|
| `R2_ACCESS_KEY_ID` | `316580a617ece85e36f746653265e92f` |
| `R2_SECRET_ACCESS_KEY` | `4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40` |
| `R2_ENDPOINT` | `https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com` |
| `R2_BUCKET` | `focades-pro` |

### 4. Deploy
- Presiona "Deploy" o similar para aplicar los cambios

### 5. Redeploy la Función
- Puede que necesites redeploy manual de la función (busca botón "Redeploy" o similar)

---

## Verificación

Después de configurar, prueba una subsanación nuevo documento. Debería:

1. ✅ Guardarse en R2 (URL con "soportes/beneficiarios/...")
2. ✅ NO aparecer en Supabase Storage
3. ✅ Actualizar la BD correctamente

---

## ¿Por qué pasó esto?

La función serverless estaba deployada pero sin las variables de entorno configuradas.

El commit anterior (bcf1aa1) había revertido a Supabase Storage como fallback.

Ahora HEAD usa R2, pero Supabase Functions necesita las credenciales para poder hacerlo.

---

## Código de la Función

La función está en:
`supabase/functions/subsanar-actualizacion-beneficiario/index.ts`

Leyendo estas variables:
```typescript
const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
const r2Endpoint = Deno.env.get('R2_ENDPOINT')
const r2Bucket = Deno.env.get('R2_BUCKET')
```

---

## Contacto

Si algo no funciona, verifica:
- ✅ Las variables estén EXACTAMENTE como aparecen arriba (sin espacios)
- ✅ La función esté desplegada después de agregar variables
- ✅ Revisar logs de Supabase Functions para errores
