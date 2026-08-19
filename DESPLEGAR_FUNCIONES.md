# 🚀 Cómo Desplegar Edge Functions

**Problema actual:** La función `auth-credentials` está desplegada pero con código antiguo, causando error 500 al actualizar perfiles.

**Solución:** Re-desplegar la función con el código actualizado que incluye mejor logging y manejo de errores.

---

## Opción 1: Instalar Supabase CLI (Recomendado)

### Windows con npm:
```powershell
npm install -g supabase
```

### Windows con Scoop:
```powershell
# Instalar Scoop si no lo tienes
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# Agregar bucket de Supabase
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git

# Instalar Supabase CLI
scoop install supabase
```

### Después de instalar:
```powershell
# 1. Login en Supabase
supabase login

# 2. Linkar proyecto (solo primera vez)
supabase link --project-ref jwifxjzxdxjntbdqbyku

# 3. Desplegar funciones actualizadas
supabase functions deploy auth-credentials
supabase functions deploy beneficiary-support-tickets
```

---

## Opción 2: Dashboard de Supabase (Manual)

1. Ve a [https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions](https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions)

2. Haz clic en la función **`auth-credentials`**

3. Haz clic en **"Deploy"** o **"Edit"**

4. Copia y pega el contenido de este archivo:
   ```
   supabase/functions/auth-credentials/index.ts
   ```

5. Haz clic en **"Deploy"**

6. Repite para **`beneficiary-support-tickets`** con:
   ```
   supabase/functions/beneficiary-support-tickets/index.ts
   ```

---

## Opción 3: Usar GitHub Actions (Automatizado)

Si configuras GitHub Actions, las funciones se desplegarán automáticamente en cada push.

### Crear `.github/workflows/deploy-supabase.yml`:
```yaml
name: Deploy Supabase Functions

on:
  push:
    branches:
      - main
    paths:
      - 'supabase/functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      
      - name: Deploy functions
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_ID: jwifxjzxdxjntbdqbyku
        run: |
          supabase functions deploy auth-credentials
          supabase functions deploy beneficiary-support-tickets
```

### Configurar secreto en GitHub:
1. Ve a Settings → Secrets and variables → Actions
2. Crea nuevo secreto: `SUPABASE_ACCESS_TOKEN`
3. Obtén el token desde: https://supabase.com/dashboard/account/tokens

---

## 📋 Verificar Deployment

Después de desplegar, verifica que funcione:

### 1. Ver logs en Supabase:
```
Dashboard → Edge Functions → auth-credentials → Logs
```

### 2. Probar desde el navegador:
Abre DevTools (F12) → Console → Intenta completar onboarding

Deberías ver en los logs de Supabase:
```
🔍 DEBUG update-profile: { beneficiario_id: '...', has_profile_data: true, ... }
🔍 Campos a actualizar: ['genero', 'fecha_nacimiento', ...]
✅ Perfil actualizado exitosamente
```

### 3. Si ves errores, busca en los logs:
```
❌ Error updating profile: { code: '...', message: '...', details: '...', hint: '...' }
```

Esto te dirá exactamente qué columna falta en la tabla o qué dato es inválido.

---

## 🔥 URGENTE: Desplegar ahora

**Funciones críticas que necesitan deployment:**

1. ✅ **`auth-credentials`** - Login, registro, actualización de perfil
   - Commit: `422db6f` (con logging mejorado)
   - Archivo: `supabase/functions/auth-credentials/index.ts`

2. ✅ **`beneficiary-support-tickets`** - Soporte de tickets
   - Commit: `e936f15` (con autenticación dual)
   - Archivo: `supabase/functions/beneficiary-support-tickets/index.ts`

**Sin estas funciones desplegadas:**
- ❌ Los beneficiarios NO pueden completar el onboarding
- ❌ Los perfiles NO se actualizan
- ❌ Los tickets NO funcionan con login de documento

---

## 🆘 Si sigues teniendo problemas

1. **Revisa los logs de Supabase** para ver el error específico
2. **Verifica que todas las columnas existan** en la tabla `portal_beneficiarios`:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'portal_beneficiarios'
   ORDER BY ordinal_position;
   ```
3. **Compara con los campos** que se intentan actualizar en `allowedFields`

---

## 📝 Comandos rápidos (después de instalar CLI)

```powershell
# Desplegar TODO de una vez
supabase functions deploy

# Desplegar solo una función
supabase functions deploy auth-credentials

# Ver logs en tiempo real
supabase functions logs auth-credentials --follow

# Ver funciones desplegadas
supabase functions list
```
