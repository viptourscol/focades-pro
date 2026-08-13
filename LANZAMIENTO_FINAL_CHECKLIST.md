# 🚀 CHECKLIST FINAL - Lanzamiento del Sistema de Activación

**Estado:** Supabase ✅ + Resend ✅ + Cloudflare ✅ + focades.info ✅  
**Fecha:** 2026-08-13  
**Listo para:** Generar tokens y enviar emails masivos

---

## 📋 VERIFICACIÓN DE INFRAESTRUCTURA

### ✅ Resend
- [x] Cuenta Resend creada
- [x] API Key generada y configurada en Supabase
- [x] Dominio focades.info verificado en Resend
- [x] Email `activacion@focades.info` listo para usar
- [x] Pruebas de envío exitosas

### ✅ Supabase
- [x] Secret `RESEND_API_KEY` agregado
- [x] Edge Function `send-setup-emails` actualizada
- [x] Tabla `portal_beneficiarios_email_log` creada
- [x] View `portal_beneficiarios_activation_status` disponible
- [x] Conexión funcional probada

### ✅ Cloudflare
- [x] Dominio focades.info apuntando a Cloudflare
- [x] Registros MX/SPF/DKIM configurados
- [x] SSL automático habilitado
- [x] Resend integrado como mailbox

### ✅ Frontend
- [x] BeneficiarioAuthSetup.jsx - 6 pasos completos
- [x] AdminBeneficiarioActivacionMonitor - Dashboard de monitoreo
- [x] Scripts de generación de tokens listos

---

## 🎯 PRÓXIMOS PASOS (ORDEN EXACTO)

### PASO 1: Deploy Edge Function a Supabase (2 min)

**Estado:** Código actualizado, listo para deploy

```bash
# URL: https://app.supabase.com/project/jwifxjzxdxjntbdqbyku/functions/send-setup-emails

Instrucciones:
1. Ir a Supabase Dashboard
2. Functions → send-setup-emails
3. Copy código de: supabase/functions/send-setup-emails/index.ts
4. Pegar en editor
5. Click: Deploy (botón verde)
6. Esperar status: ✅ ACTIVE
7. Cerrar y hard refresh (Ctrl+Shift+R)
```

✅ **Verificación:** status = "Active" (no error)

---

### PASO 2: Test de Email Individual (5 min)

**Opción A: Via Script (Recomendado)**

```bash
# Configurar variables primero
$env:SUPABASE_URL="https://ojnobfvwdpjcmdahgyjv.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="[tu-service-role-key]"
$env:RESEND_API_KEY="[tu-resend-api-key]"

# Ejecutar test
node scripts/test-resend-email.mjs

# Output esperado:
# ✅ TEST COMPLETADO EXITOSAMENTE
# ✅ Email enviado a: beneficiario@email.com
```

✅ **Verificación:** Email recibido en inbox (o spam)

**Opción B: Via Postman o curl**

```bash
curl -X POST \
  https://api.resend.com/emails \
  -H 'Authorization: Bearer re_xxxxxxxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "test@focades.info",
    "to": "beneficiario@email.com",
    "subject": "🧪 Test FOCADES",
    "html": "<p>Test email</p>"
  }'
```

---

### PASO 3: Generar Tokens Setup (30-60 min)

**3.1 Generar SOLO tokens (sin envío)**

```bash
$env:SUPABASE_URL="https://ojnobfvwdpjcmdahgyjv.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="[tu-service-role-key]"

node scripts/create-beneficiary-auth-tokens.mjs

# Output:
# ✨ SETUP TOKENS GENERADOS
# Total generado: XXX beneficiarios
# Archivo: beneficiarios-setup-tokens.csv
```

✅ **Verificación:**
- Archivo CSV creado
- Verificar BD: tabla `portal_auth_credentials` tiene nuevos registros

**3.2 OPCIÓN: Generar + Enviar Emails (recomendado)**

```bash
$env:SUPABASE_URL="https://ojnobfvwdpjcmdahgyjv.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="[tu-service-role-key]"
$env:RESEND_API_KEY="[tu-resend-api-key]"

# Test con 5 beneficiarios primero
node scripts/create-beneficiary-auth-tokens.mjs --send-emails --batch=5

# Si funciona, ejecutar para todos
node scripts/create-beneficiary-auth-tokens.mjs --send-emails
```

✅ **Verificación:**
- Emails enviados: 0 errores
- Tabla `email_log`: status = 'sent'
- Beneficiarios reciben email en 1-2 minutos

---

### PASO 4: Monitorear Activaciones (30 segundos)

**4.1 Acceder al Dashboard de Admin**

```
URL: https://focades-pro.vercel.app/admin
Menu: Monitor de Activación
```

✅ **Debe mostrar:**
- Total beneficiarios (>0)
- Tokens generados (%)
- Emails enviados (log)
- Status en vivo

**4.2 Ver estadísticas en vivo**

```sql
-- En Supabase SQL Editor
SELECT * FROM portal_beneficiarios_activation_status
ORDER BY created_at DESC LIMIT 10;

-- Debe mostrar estado de cada beneficiario
```

---

### PASO 5: Test End-to-End (15 min)

**5.1 Beneficiario recibe email**
- [ ] Email llega en inbox
- [ ] No está en spam
- [ ] Contiene link con token

**5.2 Beneficiario abre link**
- [ ] URL: `https://focades-pro.vercel.app/beneficiario/auth-setup?token=...`
- [ ] Página carga sin errores
- [ ] Paso 3 pre-llenado con token

**5.3 Completa setup (6 pasos)**
- [ ] Paso 1: Documento verificado ✓
- [ ] Paso 2: Email confirmado ✓
- [ ] Paso 3: Contraseña creada ✓
- [ ] Paso 4: Datos personales ✓
- [ ] Paso 5: Datos académicos ✓
- [ ] Paso 6: Datos bancarios ✓
- [ ] Redirecciona a dashboard ✓

**5.4 Verificar BD**

```sql
-- Email del beneficiario de test
SELECT 
  perfil_completado_en, 
  genero, 
  telefono,
  nombre_universidad,
  numero_cuenta
FROM portal_beneficiarios 
WHERE email = 'test@example.com';

-- Debe mostrar todos los datos completos ✓
```

---

## 📊 MONITOREO EN VIVO

### Dashboard Admin
**URL:** https://focades-pro.vercel.app/admin/monitor-activacion

Muestra:
- ✅ Total beneficiarios
- ✅ Tokens generados (%)
- ✅ Setup completado (%)
- ✅ Perfiles completos (%)
- ✅ Emails enviados (log últimas 20)
- ✅ Beneficiarios con problemas

### Queries SQL para monitoreo diario

```sql
-- Emails no enviados
SELECT * FROM portal_beneficiarios_email_log 
WHERE status != 'sent' 
ORDER BY created_at DESC;

-- Cuentas bloqueadas (5 intentos fallidos)
SELECT pb.nombre_completo, pac.failed_login_attempts, pac.locked_until
FROM portal_beneficiarios pb
JOIN portal_auth_credentials pac ON pb.id = pac.beneficiario_id
WHERE pac.locked_until > NOW();

-- Perfiles incompletos
SELECT COUNT(*) as incomplete_profiles
FROM portal_beneficiarios 
WHERE perfil_completado_en IS NULL;

-- Tasa de activación
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN perfil_completado_en IS NOT NULL THEN 1 ELSE 0 END) as completed,
  ROUND(100 * SUM(CASE WHEN perfil_completado_en IS NOT NULL THEN 1 ELSE 0 END)::numeric / COUNT(*), 2) as completion_rate
FROM portal_beneficiarios;
```

---

## 🔍 TROUBLESHOOTING RÁPIDO

| Problema | Solución |
|----------|----------|
| ❌ Edge Function no funciona | Deploy nuevamente en Supabase dashboard |
| ❌ Email no enviado | Verificar RESEND_API_KEY en Supabase secrets |
| ❌ Email va a spam | Verificar dominio focades.info verificado en Resend |
| ❌ Setup link expirado | Token válido 24h, usar botón "Reenviar" en admin |
| ❌ Usuario ve error en paso 6 | Hard refresh (Ctrl+Shift+R) |
| ❌ BD muestra valores NULL | Verificar que formulario se envió completo |

---

## 📱 Test End-to-End Con Beneficiario Real

### Ejemplo: María (documento: 1234567890)

```
1️⃣ Genera token:
   node scripts/create-beneficiary-auth-tokens.mjs --send-emails --batch=1

2️⃣ María recibe email:
   From: activacion@focades.info
   Subject: 🔐 Activa tu Acceso - Portal FOCADES
   Link: https://focades-pro.vercel.app/beneficiario/auth-setup?token=...

3️⃣ María abre link y completa setup (10 min):
   Paso 1: 1234567890 + email
   Paso 2: Verifica email
   Paso 3: Contraseña123!
   Paso 4: Género + Teléfono
   Paso 5: Universidad (pre-llenado) + Programa
   Paso 6: Banco + Número Cuenta
   → ¡Bienvenida al Portal! ✅

4️⃣ Verificar en BD:
   SELECT * FROM portal_beneficiarios WHERE n_documento='1234567890'
   → perfil_completado_en = NOW() ✓
   → Todos los datos completos ✓

5️⃣ Admin ve en dashboard:
   - Tokens generados: +1
   - Setup completado: +1
   - Perfil completo: +1
```

---

## 🎉 SEÑALES DE ÉXITO

✅ Email recibido en 1-2 minutos  
✅ Link de activación funciona  
✅ Beneficiario completa 6 pasos sin errores  
✅ Base de datos se actualiza correctamente  
✅ Admin dashboard muestra estadísticas  
✅ Botón "Reenviar" funciona  
✅ Emails van a inbox (no spam)  

---

## 📅 TIMELINE

| Fase | Duración | Fecha Estimada |
|------|----------|---|
| **Deploy Edge Function** | 2 min | Ahora |
| **Test Email Individual** | 5 min | Ahora |
| **Generar Tokens** | 30-60 min | Ahora |
| **Test End-to-End** | 15 min | Ahora |
| **Monitoreo (7 días)** | 5 min/día | Próx semana |

---

## 💼 DECISIÓN FINAL: ¿EJECUTAR AHORA?

Si respondiste SÍ a todo esto:
- [x] Resend configurado con focades.info
- [x] Supabase connected
- [x] Edge Function ready
- [x] Test email funciona

**ENTONCES:** Ejecuta el script completo

```bash
node scripts/create-beneficiary-auth-tokens.mjs --send-emails
```

**RESULTADO:** Todos los beneficiarios reciben email de activación en 2-3 minutos

---

## 📞 SOPORTE

Si algo falla:
1. Revisar troubleshooting arriba ⬆️
2. Ver logs en Supabase
3. Contactar soporte@focades.com
4. Ver GUIA_RESEND_EMAIL.md para más detalles

---

**¿LISTO PARA LANZAR?** 🚀

Si todo está verde ✅ arriba, ejecuta:

```bash
node scripts/create-beneficiary-auth-tokens.mjs --send-emails
```

¡Vamos! 🎉
