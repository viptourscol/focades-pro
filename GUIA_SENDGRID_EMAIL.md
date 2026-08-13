# 📧 Configuración de Envío de Emails con SendGrid

## 🚀 Descripción General

Este sistema automatiza el envío de emails de activación a beneficiarios usando **SendGrid** como proveedor de email. Incluye:

- ✅ Generación de setup tokens (24h de validez)
- ✅ Envío automático de emails con link de activación
- ✅ Auditoría completa de emails enviados
- ✅ Monitoreo en admin dashboard
- ✅ Reenvío de emails a beneficiarios

---

## 📋 Pre-requisitos

1. **Cuenta SendGrid** (https://sendgrid.com)
   - Plan gratuito: 100 emails/día
   - Plan Pro: Emails ilimitados
   
2. **API Key de SendGrid** (obtenida en Dashboard)

3. **Dominio verificado** (opcional pero recomendado para dominio personalizado)

---

## 🔧 Paso 1: Obtener API Key de SendGrid

### 1.1 Crear Cuenta
1. Ir a https://sendgrid.com
2. Registrarse con email corporativo
3. Verificar email
4. Completar perfil

### 1.2 Generar API Key
1. Login en https://app.sendgrid.com
2. Menú: **Settings** → **API Keys**
3. Click: **Create API Key**
4. Nombre: `focades-pro-activation`
5. Permisos: Seleccionar **Mail Send**
6. Copiar el key (aparece UNA SOLA VEZ)

### 1.3 Verificar Dominio (Recomendado)
Para no marcar emails como spam:

1. **Settings** → **Sender Authentication**
2. Click: **Authenticate Your Domain**
3. Seleccionar tu dominio (ej: focades.com)
4. Agregar los registros DNS sugeridos
5. Esperar 24-48h para validación

---

## 🔐 Paso 2: Configurar Supabase

### 2.1 Agregar Secret en Supabase
1. Ir a Supabase Dashboard
2. Proyecto: focades-pro
3. **Settings** → **Secrets**
4. Nuevo secret:
   - Nombre: `SENDGRID_API_KEY`
   - Valor: `SG.xxxxxxxxxxxxx` (tu API key)
   - Click: Save

### 2.2 Verificar Edge Functions
- La Edge Function `send-setup-emails` debe estar activa
- URL: https://app.supabase.com/project/jwifxjzxdxjntbdqbyku/functions/send-setup-emails

---

## 🚀 Paso 3: Configurar Variables de Entorno Local

### 3.1 Crear/Editar `.env.local`
```bash
# En raíz del proyecto
SUPABASE_URL=https://ojnobfvwdpjcmdahgyjv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SENDGRID_API_KEY=SG.your-sendgrid-api-key
```

### 3.2 Para Script Node
```bash
# Copiar variables de entorno
export SUPABASE_URL=https://ojnobfvwdpjcmdahgyjv.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-key
export SENDGRID_API_KEY=SG.your-sendgrid-api-key

# O en Windows (PowerShell):
$env:SUPABASE_SERVICE_ROLE_KEY="your-key"
$env:SENDGRID_API_KEY="SG.your-sendgrid-api-key"
```

---

## 📝 Paso 4: Crear Tabla de Auditoría

### 4.1 Ejecutar Migración
La migración ya existe: `202608130001_create_email_audit_log.sql`

Ejecutar manualmente en Supabase SQL Editor:
```sql
-- Copiar contenido de:
-- supabase/migrations/202608130001_create_email_audit_log.sql
-- Y ejecutar en Supabase dashboard
```

Tablas creadas:
- `portal_beneficiarios_email_log` - Auditoría de emails
- View: `portal_beneficiarios_activation_status` - Estado de activaciones

---

## 💻 Paso 5: Usar el Script de Generación

### 5.1 Generar Tokens (Sin enviar emails)
```bash
node scripts/create-beneficiary-auth-tokens.mjs
```

**Output:**
- CSV: `beneficiarios-setup-tokens.csv`
- Creadas credenciales en BD

### 5.2 Generar Tokens Y Enviar Emails
```bash
node scripts/create-beneficiary-auth-tokens.mjs --send-emails
```

**Requisito:** `SENDGRID_API_KEY` debe estar configurada

### 5.3 Opciones Adicionales
```bash
# Limitar a N beneficiarios
node scripts/create-beneficiary-auth-tokens.mjs --send-emails --batch=10

# Simulación sin cambios reales
node scripts/create-beneficiary-auth-tokens.mjs --dry-run --send-emails
```

---

## 📊 Paso 6: Monitorear desde Admin Dashboard

### 6.1 Acceder al Monitor
1. Ir a: Admin Panel → **Monitor de Activación**
2. Componente: `AdminBeneficiarioActivacionMonitor`

### 6.2 Ver Estadísticas
- **Total:** Total de beneficiarios
- **Token:** Cuántos tienen setup token generado
- **Setup:** Cuántos completaron setup
- **Perfil:** Cuántos completaron perfil
- **Problemas:** Cuentas bloqueadas

### 6.3 Reenviar Email Individual
```
Ingresar: correo@beneficiario.com
Click: ENVIAR
```

---

## 🔔 Paso 7: Configurar Webhooks de SendGrid (Avanzado)

Para rastrear entrega de emails en tiempo real:

### 7.1 Crear Webhook en SendGrid
1. **Settings** → **Mail Send** → **Event Webhook**
2. HTTP Post URL: `https://yourapp.com/api/webhooks/sendgrid`
3. Eventos: Seleccionar todos
4. Save

### 7.2 Crear Endpoint en Edge Function
Crear nueva función: `sendgrid-webhook-handler`

```typescript
Deno.serve(async (req) => {
  const events = await req.json()
  
  for (const event of events) {
    await supabase.functions.invoke('handle-email-webhook', {
      body: event
    })
  }
  
  return new Response(JSON.stringify({ ok: true }))
})
```

---

## 📧 Template del Email

El email enviado incluye:

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║             🔐 ACTIVA TU CUENTA - FOCADES                ║
║                                                          ║
║  Bienvenido [Beneficiario]                              ║
║                                                          ║
║  Tu cuenta ha sido creada y está lista para activarse.  ║
║                                                          ║
║  ⏰ IMPORTANTE: Este link expira en 24 HORAS             ║
║                                                          ║
║  [→ ACTIVAR MI CUENTA AHORA]                            ║
║                                                          ║
║  3 pasos rápidos:                                       ║
║    1️⃣  Verifica tu documento                            ║
║    2️⃣  Crea tu contraseña                               ║
║    3️⃣  Completa tu perfil (10 minutos)                  ║
║                                                          ║
║  ❓ Soporte: soporte@focades.com                        ║
║             +57 300 000 0000                            ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

---

## 🐛 Troubleshooting

### Problema: "SENDGRID_API_KEY no configurada"

**Solución:**
```bash
# Verificar variable está exportada
echo $SENDGRID_API_KEY

# Si está vacío:
export SENDGRID_API_KEY="SG.your-actual-key"
```

### Problema: "Email no enviado (SendGrid no configurado)"

**Significa:** La Edge Function no tiene acceso a la API key
1. Verificar secret en Supabase dashboard
2. Redeploy la Edge Function: `send-setup-emails`
3. Esperar 2 minutos para que se aplique

### Problema: Emails llegan a Spam

**Soluciones:**
1. Verificar dominio en SendGrid (DKIM + SPF)
2. Usar dominio personalizado (no @focades.com con servidor SendGrid)
3. Agregar DMARC record en DNS

### Problema: Rate Limit (429 Too Many Requests)

**Solución:**
El script ya incluye delays de 100ms entre emails. Si aún ocurre:
```bash
# Reducir batch
node scripts/create-beneficiary-auth-tokens.mjs --send-emails --batch=5
```

---

## 📊 Monitoreo Continuo

### Verificaciones Diarias
```sql
-- Ver estado de activaciones
SELECT * FROM portal_beneficiarios_activation_status
WHERE estado_activacion != 'completo'
ORDER BY created_at DESC;

-- Ver emails fallidos
SELECT * FROM portal_beneficiarios_email_log
WHERE status IN ('failed', 'bounced')
ORDER BY created_at DESC;

-- Ver cuentas bloqueadas
SELECT pb.nombre_completo, pac.locked_until, pac.failed_login_attempts
FROM portal_beneficiarios pb
JOIN portal_auth_credentials pac ON pb.id = pac.beneficiario_id
WHERE pac.locked_until > NOW();
```

### Dashboard Automático
Acceder a **Admin Panel** → **Monitor de Activación**
- Actualización cada 30 segundos
- Estadísticas en vivo
- Email logs
- Botón reenviar

---

## ✨ Flujo Completo

```
┌─────────────────────────────────────────────────────────┐
│ 1. ADMIN EJECUTA SCRIPT                                 │
│    node create-beneficiary-auth-tokens.mjs --send-emails│
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 2. SCRIPT GENERA TOKENS (24h válidos)                   │
│    ✓ Crea registros en portal_auth_credentials         │
│    ✓ Guarda en CSV para reference                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 3. SCRIPT INVOCA EDGE FUNCTION: send-setup-emails       │
│    - Método: send-batch                                 │
│    - Array de IDs de beneficiarios                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 4. EDGE FUNCTION ENVÍA EMAILS VIA SENDGRID              │
│    ✓ HTML personalizado                                │
│    ✓ Setup link con token único                        │
│    ✓ Registra en email_log                             │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 5. BENEFICIARIO RECIBE EMAIL                            │
│    📧 "🔐 Activa tu Acceso - Portal FOCADES"           │
│    Link: https://focades-pro.vercel.app/...?token=...  │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 6. BENEFICIARIO ABRE LINK                               │
│    → Accede a /beneficiario/auth-setup                  │
│    → Token pre-llenado (paso 3)                         │
│    → Sigue 6 pasos de setup + perfil                    │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 7. ADMIN MONITOREA PROGRESO                             │
│    Admin Dashboard → Monitor de Activación              │
│    ✓ Estadísticas en vivo                              │
│    ✓ Email logs                                        │
│    ✓ Beneficiarios con problemas                       │
│    ✓ Opción reenviar emails                            │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 Checklist de Implementación

- [ ] Crear cuenta SendGrid
- [ ] Generar API Key
- [ ] Agregar secret en Supabase
- [ ] Verificar dominio en SendGrid (opcional pero recomendado)
- [ ] Configurar variables de entorno local
- [ ] Ejecutar migración de tabla email_log
- [ ] Probar con 1 beneficiario: `node scripts/create-beneficiary-auth-tokens.mjs --send-emails --batch=1`
- [ ] Verificar email recibido
- [ ] Ejecutar para todos: `node scripts/create-beneficiary-auth-tokens.mjs --send-emails`
- [ ] Monitorear en Admin Dashboard
- [ ] Documentar resultados

---

## 🎯 Próximas Mejoras

- [ ] Plantillas de email personalizables
- [ ] Webhooks de SendGrid para tracking en tiempo real
- [ ] Recordatorios automáticos (si no activa en 72h)
- [ ] SMS fallback si email falla
- [ ] Estadísticas de conversión
- [ ] A/B testing de subject lines

---

**Versión:** 1.0  
**Última actualización:** 2026-08-13  
**Soporte:** contacta a tu team lead
