# Configuración de Envío de Emails - Sistema de Tokens

## ⚠️ Problema Resuelto

**Problema:** Al regenerar tokens desde AdminTokensActivacion, el sistema generaba el token pero NO enviaba el email al beneficiario.

**Solución:** Integración automática con la Edge Function `send-setup-emails` para enviar emails automáticamente vía **Resend**.

---

## 🔧 Configuración Requerida

### 1. Variable de Entorno: RESEND_API_KEY

Para que los emails se envíen automáticamente, debes configurar la API Key de Resend en Supabase:

#### Pasos:

1. **Obtener API Key de Resend:**
   - Ve a: https://resend.com/
   - Crea una cuenta / Inicia sesión
   - Ve a "API Keys"
   - Copia tu API Key (comienza con `re_...`)

2. **Configurar en Supabase:**
   - Ve al Dashboard de Supabase: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku
   - Navega a: **Settings > Edge Functions > Secrets**
   - Agrega una nueva secret:
     - **Name:** `RESEND_API_KEY`
     - **Value:** `re_tu_api_key_aqui`
   - Guarda

3. **Verificar configuración:**
   - Ejecuta el script: `scripts/verificar-config-emails.sql`
   - O prueba regenerando un token en el panel de admin

---

## 📧 Cómo Funciona Ahora

### Flujo Automático:

1. **Admin regenera token** en `/admin/tokens-activacion`
2. Edge Function `auth-credentials` genera el token
3. **Automáticamente llama a** `send-setup-emails`
4. **Resend envía el email** al beneficiario
5. Admin ve confirmación:
   - ✅ "Token y Email Enviados!" (si funcionó)
   - ⚠️ "Token Generado" + error (si falló el email)

### Email Enviado:

- **Asunto:** 🔐 Activa tu Acceso - Portal FOCADES
- **Remitente:** Notificaciones FOCADES <notificaciones@focades.info>
- **Contenido:** HTML responsive con:
  - Botón de activación
  - Link directo al portal
  - Pasos a seguir
  - Información de soporte

---

## 🧪 Pruebas

### Opción 1: Desde el Panel Admin

1. Ve a: https://focades-pro.vercel.app/admin/tokens-activacion
2. Selecciona un beneficiario con email válido
3. Click en "Generar Token" / "Reenviar Token"
4. Verifica:
   - Mensaje dice "Email enviado"
   - Beneficiario recibe el email
   - Email llega en menos de 1 minuto

### Opción 2: Prueba Manual con cURL

```bash
curl -X POST https://jwifxjzxdxjntbdqbyku.supabase.co/functions/v1/auth-credentials \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_SERVICE_ROLE_KEY" \
  -d '{
    "method": "admin-resend-token",
    "beneficiario_id": "UUID_BENEFICIARIO",
    "admin_api_key": "focades-admin-2026"
  }'
```

Respuesta esperada:
```json
{
  "ok": true,
  "message": "Token regenerado y email enviado exitosamente",
  "email_sent": true,
  "activation_link": "https://focades-pro.vercel.app/beneficiario/completar-onboarding?token=..."
}
```

---

## 🔍 Logs y Debugging

### Ver logs de Edge Functions:

```bash
supabase functions logs auth-credentials --linked
supabase functions logs send-setup-emails --linked
```

### Buscar errores comunes:

```sql
-- Ver emails fallidos
SELECT * FROM portal_beneficiarios_email_log
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🛠️ Troubleshooting

### Email no llega:

1. **Verificar RESEND_API_KEY:**
   - Dashboard Supabase > Edge Functions > Secrets
   - Debe existir `RESEND_API_KEY` con valor válido

2. **Verificar email del beneficiario:**
   ```sql
   SELECT email FROM portal_beneficiarios WHERE id = 'UUID';
   ```
   - Debe ser un email válido
   - No debe estar vacío

3. **Ver logs en tiempo real:**
   - Regenera token
   - Inmediatamente ejecuta: `supabase functions logs auth-credentials --linked`
   - Busca líneas: `📧 Enviando email a:` o `❌ Error`

4. **Email en carpeta de spam:**
   - Pide al beneficiario revisar spam/correo no deseado
   - Dominio remitente: `focades.info`

### Email_sent: false

Si el admin ve "Email no enviado":

- **Causa 1:** RESEND_API_KEY no configurada
  - Solución: Configura la variable en Supabase (ver arriba)

- **Causa 2:** Email del beneficiario inválido
  - Solución: Actualiza el email en `portal_beneficiarios`

- **Causa 3:** Límite de rate en Resend
  - Solución: Espera 1 minuto y reintenta
  - Plan gratuito: 100 emails/día

- **Causa 4:** Error en Edge Function
  - Solución: Ver logs con `supabase functions logs send-setup-emails --linked`

---

## 📝 Archivos Modificados

- **Edge Function:** `supabase/functions/auth-credentials/index.ts`
  - Integración con `send-setup-emails`
  - Response incluye `email_sent` y `email_error`

- **Frontend:** `src/pages/AdminTokensActivacion.jsx`
  - Muestra estado de envío de email
  - Alerta diferente si email falla

- **Documentación:** Este archivo

---

## 📞 Soporte

Si los emails siguen sin llegar después de configurar RESEND_API_KEY:

1. Ejecuta: `scripts/verificar-config-emails.sql`
2. Revisa logs: `supabase functions logs auth-credentials --linked`
3. Contacta a soporte con los logs
