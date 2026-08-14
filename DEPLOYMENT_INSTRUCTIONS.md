# 🚀 Instrucciones de Despliegue - Onboarding Completo

## 📋 Checklist Pre-Despliegue
- [x] Migración SQL creada: `202608140001_extend_beneficiarios_onboarding_completo.sql`
- [x] Edge Function actualizada: `auth-credentials/index.ts`
- [x] Frontend actualizado: `BeneficiarioOnboardingCompleto.jsx`
- [x] Dependencias agregadas: `react-signature-canvas`
- [x] Config.toml actualizado

## 🗄️ PASO 1: Desplegar Migración SQL

### Método 1: Dashboard de Supabase (Recomendado)

1. **Abre tu proyecto en Supabase**:
   - Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku

2. **Abre el SQL Editor**:
   - Click en "SQL Editor" en el menú lateral
   - Click en "+ New query"

3. **Copia y pega el contenido completo** del archivo:
   - `supabase/migrations/202608140001_extend_beneficiarios_onboarding_completo.sql`
   - Son 238 líneas de SQL

4. **Ejecuta la migración**:
   - Click en "Run" (o presiona Ctrl+Enter)
   - Espera confirmación (debería tomar ~5-10 segundos)

5. **Verifica que no haya errores**:
   - Si todo está OK, verás mensaje de éxito
   - Si hay error, copia el mensaje completo

### Método 2: Supabase CLI (Alternativo)

Si tienes Supabase CLI instalado:

```bash
# Asegúrate de estar en el directorio del proyecto
cd C:/Users/USUARIO/Documents/Proyectos/focades-pro

# Link al proyecto (solo la primera vez)
supabase link --project-ref jwifxjzxdxjntbdqbyku

# Aplica la migración
supabase db push
```

### ✅ Verificación de Migración

Ejecuta este SQL en el SQL Editor para verificar:

```sql
-- Verificar que las columnas se crearon
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'portal_beneficiarios' 
  AND column_name IN (
    'fecha_nacimiento', 'sisben_grupo', 'titulo_obtenido', 
    'institucion_superior', 'onboarding_completado'
  );

-- Verificar que la función existe
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'check_perfil_completitud';

-- Verificar políticas RLS
SELECT policyname 
FROM pg_policies 
WHERE tablename = 'portal_beneficiario_documentos_historicos'
  AND policyname IN ('beneficiarios_upload_onboarding_docs', 'beneficiarios_read_own_docs');
```

Deberías ver:
- ✅ 5 columnas listadas
- ✅ 1 función
- ✅ 2 políticas

---

## 🔧 PASO 2: Desplegar Edge Function `auth-credentials`

### Método 1: Dashboard de Supabase (Recomendado)

1. **Abre Edge Functions**:
   - Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions

2. **Busca la función `auth-credentials`**:
   - Si existe, click en ella
   - Si no existe, click en "Create a new function"

3. **Actualiza/Crea la función**:
   - **Name**: `auth-credentials`
   - **Verify JWT**: ❌ Deshabilitado (false)
   - Click en el tab "Code Editor"

4. **Copia y pega el código**:
   - Abre el archivo: `supabase/functions/auth-credentials/index.ts`
   - Copia TODO el contenido (aproximadamente 250 líneas)
   - Pégalo en el editor del Dashboard

5. **Despliega**:
   - Click en "Deploy" o "Save"
   - Espera confirmación (~10-30 segundos)

### Método 2: Supabase CLI (Alternativo)

```bash
# Desplegar solo auth-credentials
supabase functions deploy auth-credentials

# O desplegar todas las funciones
supabase functions deploy
```

### ✅ Verificación de Edge Function

Prueba la función con este cURL (reemplaza `{ANON_KEY}` y `{DOCUMENTO}`):

```bash
curl -X POST 'https://jwifxjzxdxjntbdqbyku.supabase.co/functions/v1/auth-credentials' \
  -H 'Authorization: Bearer sb_publishable_em5D2P5WLzyhacklDGpXBA_GfQniMHk' \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "setup-init",
    "document_number": "1234567890",
    "email": "test@example.com"
  }'
```

Deberías recibir:
- ✅ `{"ok": false, "error": "Documento no encontrado..."}` (si el documento no existe)
- ✅ O un objeto con `setup_token` y `beneficiario` completo si el documento existe

---

## 🎨 PASO 3: Desplegar Frontend a Vercel

### Opción A: Push a Git (Auto-deploy)

```bash
# Asegúrate de estar en la rama main
git status

# Agrega todos los cambios
git add .

# Commit con mensaje descriptivo
git commit -m "feat: Implementar onboarding completo con documentos y firma digital"

# Push a GitHub
git push origin main
```

Vercel detectará el push y desplegará automáticamente (~2-3 minutos).

### Opción B: Deploy Manual desde Vercel Dashboard

1. Ve a: https://vercel.com/dashboard
2. Busca tu proyecto `focades-pro`
3. Click en "Deployments"
4. Click en "Redeploy" en el último deployment
5. Selecciona "Use existing Build Cache"
6. Click en "Redeploy"

### ✅ Verificación de Frontend

1. **Instala dependencias localmente** (si no lo hiciste):
   ```bash
   npm install
   ```

2. **Prueba localmente**:
   ```bash
   npm run dev
   ```
   - Abre: http://localhost:5173
   - Navega a: `/beneficiario/auth-setup?token=test123`
   - Verifica que veas los 11 pasos

3. **Verifica en producción**:
   - Espera a que Vercel termine el deployment
   - Abre: https://focades-pro.vercel.app
   - Genera un token desde el admin panel
   - Prueba el flujo completo de onboarding

---

## 🧪 PASO 4: Testing End-to-End

### 4.1 Generar Token de Prueba

1. Ve al Admin Panel: https://focades-pro.vercel.app/admin
2. Login como admin
3. Navega a "Beneficiarios Históricos"
4. Busca un beneficiario de prueba
5. Click en "Generar Token de Activación"
6. Copia el link generado

### 4.2 Completar Onboarding

1. **Abre el link en incognito/private**
2. **Paso 1**: Verifica documento → Debería pre-cargar datos
3. **Paso 2**: Revisa email
4. **Paso 3**: Establece contraseña (min 8 chars, mayúscula, número, especial)
5. **Paso 4-7**: Completa datos personales, socioeconómicos, educación
6. **Paso 8**: Ingresa info bancaria
7. **Paso 9**: Sube 7-9 documentos PDF (< 10MB cada uno)
8. **Paso 10**: Acepta términos y firma digitalmente
9. **Paso 11**: Revisa resumen y finaliza

### 4.3 Verificar en Base de Datos

```sql
-- Ver datos del beneficiario
SELECT 
  id, nombre_completo, email, onboarding_completado,
  genero, fecha_nacimiento, sisben_grupo, titulo_obtenido,
  institucion_superior, nombre_banco, acepta_terminos_at
FROM portal_beneficiarios 
WHERE n_documento = '1234567890'; -- Reemplaza con documento de prueba

-- Ver documentos subidos
SELECT 
  titulo, tipo_documento, archivo_mime_type, 
  archivo_size_bytes, created_at
FROM portal_beneficiario_documentos_historicos
WHERE beneficiario_id = (
  SELECT id FROM portal_beneficiarios WHERE n_documento = '1234567890'
)
ORDER BY created_at DESC;

-- Ver credenciales
SELECT document_number, has_completed_setup, last_login_at
FROM portal_auth_credentials
WHERE document_number = '1234567890';
```

### 4.4 Verificar Storage

1. Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/storage/buckets/soportes
2. Navega a: `beneficiarios_historicos/{beneficiario_id}/`
3. Deberías ver:
   - `documentos/` → 7-9 archivos PDF
   - `firma-digital-{timestamp}.png` → Imagen de firma

---

## 🐛 Troubleshooting

### Error: "Column already exists"
- **Causa**: La migración ya se ejecutó parcialmente
- **Solución**: La migración usa `ADD COLUMN IF NOT EXISTS`, así que es seguro re-ejecutarla

### Error: "Policy already exists"
- **Causa**: Las políticas RLS ya existen
- **Solución**: La migración usa `DROP POLICY IF EXISTS`, es seguro re-ejecutarla

### Error: "No se pudo subir documento"
- **Causa**: Políticas RLS de Storage no configuradas
- **Solución**: Verifica que las políticas existan en `storage.objects`

### Error: "firma_digital is required"
- **Causa**: Canvas de firma vacío
- **Solución**: Verifica que `react-signature-canvas` esté instalado y funcionando

### Frontend no muestra cambios
- **Causa**: Cache de Vercel
- **Solución**: 
  1. Forzar redeploy sin cache
  2. O esperar ~5 minutos para propagación de CDN

### Edge Function retorna 500
- **Causa**: Variables de entorno faltantes o código con error
- **Solución**:
  1. Ve a Edge Functions → Logs
  2. Busca el error específico
  3. Verifica que `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` estén configuradas

---

## 📊 Métricas de Éxito

Después del deployment, deberías ver:

- ✅ **Migración aplicada**: 40 columnas nuevas en `portal_beneficiarios`
- ✅ **Edge Function actualizada**: Retorna beneficiario completo en `setup-init`
- ✅ **Frontend desplegado**: 11 pasos visibles
- ✅ **Documentos funcionando**: PDFs suben a Storage
- ✅ **Firma funcionando**: PNG se guarda en Storage
- ✅ **RLS funcionando**: Beneficiarios solo ven sus propios datos

---

## 🎯 Próximos Pasos (Post-Deployment)

1. **Comunicar a beneficiarios**:
   - Enviar email masivo con links de activación
   - Incluir instrucciones claras
   - Mencionar documentos requeridos

2. **Monitorear**:
   - Revisar logs de Edge Functions diariamente
   - Verificar uploads de documentos
   - Atender tickets de soporte

3. **Optimizaciones futuras**:
   - Agregar drag & drop para documentos
   - Implementar preview de PDFs
   - Agregar compresión de imágenes de firma
   - Dashboard de progreso para admin

---

## 📞 Soporte

Si encuentras algún problema durante el deployment:
1. Revisa los logs en Supabase Dashboard
2. Verifica la consola del navegador para errores frontend
3. Consulta esta documentación
4. Contacta al equipo de desarrollo

**¡Éxito con el deployment! 🚀**
