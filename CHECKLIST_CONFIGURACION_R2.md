# 📋 CHECKLIST: Configuración de Variables R2 en Supabase Functions

## 🎯 Objetivo
Configurar 4 variables de entorno en 6 funciones serverless para que usen Cloudflare R2 en lugar de Supabase Storage.

---

## 📍 PASO 1: Abre el Dashboard

**URL:**
```
https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions
```

**O manualmente:**
1. Ve a: https://supabase.com/dashboard
2. Selecciona: **Focades-Pro**
3. Menú izquierdo: **Edge Functions**

---

## 🔧 PASO 2: Configura Cada Función

Para CADA función en la lista abajo:

### 2.1 Haz click en el nombre de la función
### 2.2 Busca "Environment Variables" o "Secrets"
### 2.3 Agrega estas 4 variables:

```
┌─────────────────────────────────────────────────────────────┐
│ R2_ACCESS_KEY_ID                                            │
├─────────────────────────────────────────────────────────────┤
│ 316580a617ece85e36f746653265e92f                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ R2_SECRET_ACCESS_KEY                                        │
├─────────────────────────────────────────────────────────────┤
│ 4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a49 │
│ 57b8f40                                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ R2_ENDPOINT                                                 │
├─────────────────────────────────────────────────────────────┤
│ https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestor │
│ age.com                                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ R2_BUCKET                                                   │
├─────────────────────────────────────────────────────────────┤
│ focades-pro                                                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Haz click en "Deploy" o "Save & Deploy"

---

## ✅ CHECKLIST de 6 Funciones

```
PRIORIDAD ALTA:
☐ subsanar-actualizacion-beneficiario
  - Cuando beneficiarios reenvían documentos de subsanación
  - ⚠️ ESTE ES EL QUE SIGUE GUARDANDO EN SUPABASE
  
OTRAS:
☐ admin-document-action
  - Cuando admin reemplaza documentos en fichas
  
☐ enviar-actualizacion-beneficiario
  - Cuando beneficiarios envían actualización
  
☐ generate-beneficiario-onboarding-docs
  - Genera documentos de onboarding
  
☐ generate-inscripcion-docs
  - Genera documentos de inscripción
  
☐ import-historicos-lote
  - Importa documentos históricos en lote
```

---

## ⏱️ Tiempo por Función

```
Por función:
  - Abrir: 5 seg
  - Agregar 4 variables: 1 min
  - Deploy: 10 seg
  ─────────────
  Subtotal: ~1.5 minutos

Total para 6: ~9 minutos
Verificación: ~3 minutos
═════════════════════════════════
TOTAL ESTIMADO: ~12 minutos
```

---

## 🧪 PASO 3: Verifica Después

### Opción 1: Prueba Manual (RECOMENDADO)
```
1. Accede al portal de beneficiarios
2. Busca una actualización en "subsanacion"
3. Reemplaza un documento
4. Espera 2-3 segundos
5. Abre Cloudflare R2 Dashboard:
   https://dash.cloudflare.com/?to=/:account/r2/overview
6. Verifica que el archivo esté en R2
7. Verifica que NO esté en Supabase Storage
```

### Opción 2: Script de Verificación
```bash
node scripts/verify-r2-env-vars.mjs
```

---

## 📊 Tabla Rápida de Variables

| Variable | Valor |
|----------|-------|
| `R2_ACCESS_KEY_ID` | `316580a617ece85e36f746653265e92f` |
| `R2_SECRET_ACCESS_KEY` | `4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40` |
| `R2_ENDPOINT` | `https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com` |
| `R2_BUCKET` | `focades-pro` |

---

## 🆘 Troubleshooting

### Problema: No encuentro "Environment Variables"
**Solución:** Busca en el menú de Settings o usa URL directa:
```
https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions/[NOMBRE]/settings
```

### Problema: Subsanación SIGUE yendo a Supabase
**Verificar:**
- [ ] ¿Configuraste `subsanar-actualizacion-beneficiario`?
- [ ] ¿Desplegaste después de agregar variables?
- [ ] ¿Pasaron 30 segundos desde el deploy?
- [ ] Revisa los logs: Dashboard → Functions → subsanar-actualizacion-beneficiario → Logs

### Problema: Error "Missing R2 environment variables"
**Significado:** Las variables no están en la función
**Solución:** Vuelve a configurarlas y redeploy

### Problema: Error "Failed to upload to R2"
**Significado:** Las variables están mal o las credenciales no son válidas
**Solución:** Copia exactamente los valores de arriba

---

## 📚 Documentos de Referencia

- **Guía Detallada:** `CONFIGURAR_VARIABLES_PASO_A_PASO.md`
- **Resumen Técnico:** `TODAS_FUNCIONES_ACTUALIZADAS_A_R2.md`
- **Script de Validación:** `scripts/verify-r2-env-vars.mjs`

---

## ✨ Después de Completar

### Lo que debería pasar:
✅ Todos los documentos nuevos van a R2
✅ Nada va a Supabase Storage
✅ La BD tiene paths correctos en R2
✅ Credenciales solo en servidor (seguro)

### Verificar en R2 Dashboard:
- `soportes/beneficiarios/...` - documentos de subsanación
- `soportes/expedientes/...` - documentos de inscripción
- `soportes/beneficiarios_historicos/...` - documentos históricos

---

## 🚀 LISTO?

**Abre el Dashboard ahora:**
https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions

**Tiempo:** ~12 minutos
**Prioridad:** ALTA (subsanacion sigue en Supabase)
**Estado:** Código 100% listo, solo falta configuración

---

**¿Necesitas que te ayude con algo específico?**
Escribe si algo no es claro.
