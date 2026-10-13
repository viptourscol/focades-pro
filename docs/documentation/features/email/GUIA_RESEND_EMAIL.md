# 📧 Configuración de Envío de Emails con Resend

## 🚀 Descripción General

Este sistema automatiza el envío de emails de activación a beneficiarios usando **Resend** como proveedor de email. Resend es más moderno, rápido y fácil de configurar que SendGrid.

Incluye:
- ✅ Generación de setup tokens (24h de validez)
- ✅ Envío automático de emails con link de activación
- ✅ Auditoría completa de emails enviados
- ✅ Monitoreo en admin dashboard
- ✅ Reenvío de emails a beneficiarios

---

## 📋 Pre-requisitos

1. **Cuenta Resend** (https://resend.com)
   - Plan gratuito: 100 emails/día durante pruebas
   - Plan Pro: 10,000 emails/mes ($20/mes)
   - Muy confiable (100% uptime de Stripe)
   
2. **API Key de Resend** (obtenida en Dashboard - formato: `re_xxxxxxxxxxxxx`)

3. **Dominio verificado** (opcional pero recomendado para dominio personalizado)

---

## 🔧 Paso 1: Obtener API Key de Resend

### 1.1 Crear Cuenta
1. Ir a https://resend.com
2. Click: **Get Started** (o Sign In)
3. Completar email
4. Verificar email (llega en 1-2 minutos)

### 1.2 Generar API Key
1. Login en https://app.resend.com/api-keys
2. Click: **Create API Key**
3. Name: `focades-pro-activation`
4. Seleccionar: Full Access (por ahora)
5. Click: **Add API Key**
6. **COPIAR LA KEY** - aparece UNA SOLA VEZ
   ```
   re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
7. Guardar en lugar seguro

### 1.3 Verificar Dominio (Recomendado - 15 min)
Para no marcar emails como spam:

1. **Settings** → **Domains**
2. Click: **Add Domain**
3. Dominio: `focades.com` (tu dominio)
4. Copiar registros DNS sugeridos:
   - MX record
   - SPF record
   - DKIM record
5. Agregar a tu proveedor DNS (GoDaddy, Cloudflare, etc)
6. Resend verifica automáticamente (5-30 min)
7. Cuando esté ✅ Verified, listo

---

## 🔐 Paso 2: Configurar Supabase

### 2.1 Agregar Secret en Supabase
1. Ir a Supabase Dashboard
2. Proyecto: focades-pro
3. **Settings** → **Secrets**
4. Nuevo secret:
   - Nombre: `RESEND_API_KEY`
   - Valor: `re_xxxxxxxxxxxxx` (tu API key)
   - Click: Save

### 2.2 Verificar Edge Functions
- La Edge Function `send-setup-emails` debe estar actualizada
- URL: https://app.supabase.com/project/jwifxjzxdxjntbdqbyku/functions/send-setup-emails
- **Deploy** después de agregar el secret

---

## 🚀 Paso 3: Configurar Variables de Entorno Local

### 3.1 Crear/Editar `.env.local`
```bash
# En raíz del proyecto
SUPABASE_URL=https://ojnobfvwdpjcmdahgyjv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3.2 Para Script Node
```bash
# Copiar variables de entorno
export SUPABASE_URL=https://ojnobfvwdpjcmdahgyjv.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-key
export RESEND_API_KEY=re_xxxxxxxxxxxxx

# O en Windows (PowerShell):
$env:SUPABASE_SERVICE_ROLE_KEY="your-key"
$env:RESEND_API_KEY="re_xxxxxxxxxxxxx"
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

**Requisito:** `RESEND_API_KEY` debe estar configurada

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

## 🚀 Ventajas de Resend vs SendGrid

| Feature | Resend | SendGrid |
|---------|--------|----------|
| **Setup** | ⭐ Super simple | Complejo |
| **Costo** | ⭐ $20/mes (10k emails) | $15 (100/day) → $300+ |
| **API** | ⭐ Muy simple | Compleja |
| **Uptime** | ✅ 100% (Stripe) | 99.9% |
| **Soporte** | ✅ Rápido | Lento |
| **Webhooks** | ✅ Full | Full |
| **Dashboard** | ✅ Intuitivo | Abrumador |

---

## 🐛 Troubleshooting

### Problema: "RESEND_API_KEY no configurada"

**Solución:**
```bash
# Verificar variable está exportada
echo $RESEND_API_KEY

# Si está vacío:
export RESEND_API_KEY="re_your-actual-key"
```

### Problema: "Email no enviado (Resend no configurado)"

**Significa:** La Edge Function no tiene acceso a la API key

Soluciones:
1. Verificar secret en Supabase dashboard (Settings → Secrets)
2. Redeploy la Edge Function: `send-setup-emails`
3. Esperar 2 minutos para que se aplique
4. Verificar que el secret tiene el nombre exacto: `RESEND_API_KEY`

### Problema: Emails llegan a Spam

**Soluciones:**
1. Verificar dominio en Resend (debe estar ✅ Verified)
2. Resend maneja SPF/DKIM automáticamente
3. Si sigue fallando, contactar soporte@resend.com

### Problema: Rate Limit (429 Too Many Requests)

**Plan gratuito:** 100 emails/día  
**Plan Pro:** 10,000 emails/mes

El script ya incluye delays de 100ms entre emails.

Si aún ocurre:
```bash
# Reducir batch
node scripts/create-beneficiary-auth-tokens.mjs --send-emails --batch=5

# O ejecutar en 2-3 lotes diferentes:
node scripts/create-beneficiary-auth-tokens.mjs --send-emails --batch=50
# Esperar 2 horas
node scripts/create-beneficiary-auth-tokens.mjs --send-emails --batch=50
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
│ 4. EDGE FUNCTION ENVÍA EMAILS VIA RESEND                │
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

- [ ] Crear cuenta Resend
- [ ] Generar API Key
- [ ] Agregar secret en Supabase
- [ ] Verificar dominio en Resend (opcional pero recomendado)
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
- [ ] Webhooks de Resend para tracking en tiempo real
- [ ] Recordatorios automáticos (si no activa en 72h)
- [ ] SMS fallback si email falla
- [ ] Estadísticas de conversión
- [ ] A/B testing de subject lines

---

**Versión:** 1.0  
**Proveedor:** Resend (https://resend.com)  
**Última actualización:** 2026-08-13  
**Soporte:** contacta a tu team lead
