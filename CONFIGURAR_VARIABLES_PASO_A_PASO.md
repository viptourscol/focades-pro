# 🚀 GUÍA PASO A PASO: Configurar Variables de Entorno en Supabase

**Tiempo estimado:** 10-15 minutos

---

## ✅ Paso 1: Abre Supabase Dashboard

1. Ve a: https://supabase.com/dashboard
2. Selecciona tu proyecto: **Focades-Pro**
3. En el menú lateral, busca **Edge Functions**

---

## ✅ Paso 2: Configura la Primera Función

**Función:** `subsanar-actualizacion-beneficiario` (PRIORIDAD ALTA)

### 2.1. Haz click en la función
- En la lista de funciones, busca: `subsanar-actualizacion-beneficiario`
- Haz click para abrirla

### 2.2. Busca "Environment Variables" 
- En el editor de la función, debe haber una sección llamada:
  - "Environment Variables" O
  - "Secrets" O
  - "Settings"

### 2.3. Agrega 4 variables
Para CADA una de estas 4 variables, haz click en "Add variable" o "+":

#### Variable 1:
```
Name:  R2_ACCESS_KEY_ID
Value: 316580a617ece85e36f746653265e92f
```

#### Variable 2:
```
Name:  R2_SECRET_ACCESS_KEY
Value: 4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40
```

#### Variable 3:
```
Name:  R2_ENDPOINT
Value: https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com
```

#### Variable 4:
```
Name:  R2_BUCKET
Value: focades-pro
```

### 2.4. Guarda y Deploy
- Busca botón "Deploy" o "Save & Deploy"
- Click para guardar cambios

---

## ✅ Paso 3: Repite para las Otras 5 Funciones

Repite exactamente los mismos pasos para CADA una de estas funciones:

1. ✅ `subsanar-actualizacion-beneficiario` (YA HECHA)
2. `admin-document-action`
3. `enviar-actualizacion-beneficiario`
4. `generate-beneficiario-onboarding-docs`
5. `generate-inscripcion-docs`
6. `import-historicos-lote`

---

## 🎯 Checklist de Verificación

Después de configurar cada función, verifica:

- [ ] `subsanar-actualizacion-beneficiario` → 4 variables ✅ → Desplegada
- [ ] `admin-document-action` → 4 variables ✅ → Desplegada
- [ ] `enviar-actualizacion-beneficiario` → 4 variables ✅ → Desplegada
- [ ] `generate-beneficiario-onboarding-docs` → 4 variables ✅ → Desplegada
- [ ] `generate-inscripcion-docs` → 4 variables ✅ → Desplegada
- [ ] `import-historicos-lote` → 4 variables ✅ → Desplegada

---

## 🔍 ¿Dónde está el botón de Environment Variables?

### Si usas el editor en Supabase Dashboard:

**Opción 1:** En la pestaña superior
```
Code | Settings | Logs
             ↑
        Aquí pueden estar
```

**Opción 2:** En el panel lateral derecho
```
Function Details
├─ Secrets / Environment Variables
├─ Logs
└─ Settings
```

**Opción 3:** Icono de engranaje (⚙️)
```
Busca un icono de engranaje en la esquina superior derecha
```

---

## 🆘 Si no encuentras Environment Variables

**Alternativa 1: Usar la URL directa**
```
https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions/subsanar-actualizacion-beneficiario/settings
```

**Alternativa 2: Usar Supabase CLI**
```bash
# Si tienes CLI instalado:
supabase functions deploy subsanar-actualizacion-beneficiario --env-file .env.local
```

---

## ✨ Después de Configurar Todo

### Prueba de Subsanación
1. Accede al portal de beneficiarios
2. Busca una actualización en estado "subsanacion"
3. Reemplaza un documento
4. Espera ~2 segundos
5. Verifica en [Cloudflare R2 Dashboard](https://dash.cloudflare.com/?to=/:account/r2/overview):
   - ✅ Archivo aparece en R2
   - ✅ Ruta es: `soportes/beneficiarios/...`
   - ❌ NO debe estar en Supabase Storage

### Prueba de Admin
1. Accede a admin/beneficiarios
2. Busca un beneficiario con documentos
3. Reemplaza un documento en la ficha
4. Verifica en R2 Dashboard
5. ✅ Documento nuevo en R2

---

## ⏰ Tiempo Esperado

- Por función: ~2 minutos (agregar 4 variables + Deploy)
- Total para 6 funciones: ~12 minutos
- Verificación: ~3 minutos

**Total: ~15 minutos**

---

## 📞 ¿Preguntas o Problemas?

Si algo no funciona:

1. **Verifica los nombres exactos** de las variables (sin espacios, mayúsculas exactas)
2. **Copia valores completos** sin espacios adicionales
3. **Deploy siempre después** de agregar variables
4. **Espera 30 segundos** después de deploy para que tome efecto

Si falla subsanación después, revisa los logs:
```
Dashboard → Edge Functions → subsanar-actualizacion-beneficiario → Logs
```

Busca mensajes tipo:
- ✅ `Missing R2 environment variables` → Variables no están configuradas
- ✅ `Failed to upload to R2` → Credenciales incorrectas
- ✅ `Error interno del servidor` → Otro problema

---

**Listo para empezar?** ✨ Abre el Dashboard ahora 👇

https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions
