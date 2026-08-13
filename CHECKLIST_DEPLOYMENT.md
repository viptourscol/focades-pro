# ✅ CHECKLIST DE DEPLOYMENT - Sistema de Activación

**Estado:** 🟢 TODO IMPLEMENTADO - LISTO PARA DEPLOYMENT  
**Fecha:** 2026-08-13  
**Responsable:** [Tu nombre]

---

## 🔴 CRÍTICO - DEBE HACER AHORA

### 1️⃣ Deploy Edge Function a Supabase

**Tiempo estimado:** 5 minutos

```
✅ Requisito: auth-credentials Edge Function (ya actualizada)
✅ Requisito: send-setup-emails Edge Function (NUEVA)
```

**Pasos:**

1. **Ver estado actual:**
   ```
   URL: https://app.supabase.com/project/jwifxjzxdxjntbdqbyku/functions
   ```

2. **Deploy send-setup-emails (NUEVA):**
   - [ ] En terminal: `cd supabase/functions/send-setup-emails`
   - [ ] Ver código: `cat index.ts`
   - [ ] Copiar TODO el contenido
   - [ ] Ir a Supabase dashboard
   - [ ] **Crear nueva función:** `send-setup-emails`
   - [ ] Pegar código completo en editor
   - [ ] Click: **Deploy** (botón verde)
   - [ ] Esperar: Status ✅ **Active** (2-3 seg)
   - [ ] Verificar: No hay errores (rojo = error)

3. **Verificar auth-credentials:**
   - [ ] Función: `auth-credentials`
   - [ ] Estado: ✅ Active
   - [ ] Si status = ⚠️ : Hacer deploy nuevamente

4. **Hard refresh navegador:**
   ```
   Ctrl + Shift + R
   (No F5 - ese usa caché)
   ```

---

### 2️⃣ Configurar SendGrid

**Tiempo estimado:** 10 minutos

```
✅ Requisito: Cuenta SendGrid (gratis)
✅ Requisito: API Key
✅ Requisito: Verificar dominio (opcional pero recomendado)
```

**Pasos:**

1. **Crear cuenta:**
   - [ ] Ir a: https://sendgrid.com
   - [ ] Click: **Sign Up**
   - [ ] Email corporativo: `tu-email@focades.com`
   - [ ] Contraseña: `[segura, 12+ caracteres]`
   - [ ] Click: **Create Account**
   - [ ] Verificar email de confirmación
   - [ ] Complete profile

2. **Generar API Key:**
   - [ ] Login: https://app.sendgrid.com
   - [ ] Menu: **Settings** → **API Keys**
   - [ ] Click: **Create API Key**
   - [ ] Name: `focades-pro-activation`
   - [ ] Permissions: **Mail Send**
   - [ ] Click: **Create & Save**
   - [ ] **COPIAR LA KEY** (aparece UNA SOLA VEZ)
   - [ ] Guardar en lugar seguro

3. **Agregar Secret en Supabase:**
   - [ ] URL: https://app.supabase.com/project/jwifxjzxdxjntbdqbyku
   - [ ] Menu: **Settings** → **Secrets**
   - [ ] **New Secret:**
     - Name: `SENDGRID_API_KEY`
     - Value: `SG.xxxxxxxxxxxxxxxxxxxxx` (tu API key)
   - [ ] Click: **Save**
   - [ ] Verificar: Aparece en lista

4. **Verificar dominio (Recomendado - 15 min):**
   - [ ] SendGrid: **Settings** → **Sender Authentication**
   - [ ] Click: **Authenticate Your Domain**
   - [ ] Domain: `focades.com` (tu dominio)
   - [ ] Agregar registros DNS sugeridos
   - [ ] Esperar: 24-48h para validación
   - [ ] Verificar: Cuando esté ✅ Active

---

### 3️⃣ Ejecutar Migración de BD

**Tiempo estimado:** 2 minutos

```
✅ Requisito: Tabla email_log
✅ Requisito: View de activation status
```

**Pasos:**

1. **Opción A: Via Supabase Dashboard (Recomendado)**
   - [ ] URL: https://app.supabase.com/project/jwifxjzxdxjntbdqbyku
   - [ ] Menu: **SQL Editor**
   - [ ] Click: **New Query**
   - [ ] Copiar contenido de:
     ```
     supabase/migrations/202608130001_create_email_audit_log.sql
     ```
   - [ ] Pegar en editor
   - [ ] Click: **Run** (▶️)
   - [ ] Verificar: Success message ✅

2. **Opción B: Via Supabase CLI (Avanzado)**
   ```bash
   supabase db push
   ```

3. **Verificar tablas creadas:**
   - [ ] Ir a: **Database** → **Tables**
   - [ ] Buscar: `portal_beneficiarios_email_log`
   - [ ] Debe estar visible con columnas
   - [ ] Buscar view: `portal_beneficiarios_activation_status`
   - [ ] Debe estar en "Views" section

---

### 4️⃣ Test Básico - Email Individual

**Tiempo estimado:** 5 minutos

```
✅ Requisito: 1 beneficiario en BD
✅ Requisito: SendGrid configurado
```

**Pasos:**

1. **Obtener ID de beneficiario:**
   ```sql
   SELECT id, nombre_completo, email 
   FROM portal_beneficiarios 
   LIMIT 1;
   
   -- Copiar el ID
   ```

2. **Generar token manualmente:**
   ```sql
   INSERT INTO portal_auth_credentials (
     beneficiario_id,
     document_number,
     email_verified,
     setup_token,
     setup_token_expires_at
   ) VALUES (
     'UUID-DEL-BENEFICIARIO',
     '1234567890',
     'email@beneficiario.com',
     'test-token-32-caracteres-hex',
     NOW() + INTERVAL '24 hours'
   );
   ```

3. **Invocar Edge Function manualmente:**
   - [ ] Usar Postman o curl:
   ```bash
   curl -X POST \
     https://ojnobfvwdpjcmdahgyjv.supabase.co/functions/v1/send-setup-emails \
     -H 'Authorization: Bearer [TOKEN-SUPABASE]' \
     -H 'Content-Type: application/json' \
     -d '{
       "method": "send-setup-email",
       "beneficiario_id": "[UUID]"
     }'
   ```

4. **Verificar:**
   - [ ] Revisar email recibido
   - [ ] Email debe tener subject: "🔐 Activa tu Acceso - Portal FOCADES"
   - [ ] Debe contener link: `https://focades-pro.vercel.app/beneficiario/auth-setup?token=...`
   - [ ] Verificar tabla: `portal_beneficiarios_email_log`
   - [ ] Registro debe tener: `status = 'sent'`

---

## 🟡 IMPORTANTE - PRÓXIMAS 24 HORAS

### 5️⃣ Generar Setup Tokens para Todos

**Tiempo estimado:** 5-10 minutos (sin envío)  
**Tiempo total:** 30-45 minutos (con envío)

**Pasos:**

1. **Configurar variables de entorno (en tu máquina):**

   ```bash
   # En PowerShell (Windows):
   $env:SUPABASE_URL="https://ojnobfvwdpjcmdahgyjv.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY="[tu-service-role-key]"
   $env:SENDGRID_API_KEY="SG.xxxxxxxxxxxxxxx"
   
   # En Bash (Mac/Linux):
   export SUPABASE_URL="https://ojnobfvwdpjcmdahgyjv.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="[tu-service-role-key]"
   export SENDGRID_API_KEY="SG.xxxxxxxxxxxxxxx"
   ```

2. **Opción A: Solo generar tokens (sin envío)**

   ```bash
   cd scripts
   node create-beneficiary-auth-tokens.mjs
   
   # Output: beneficiarios-setup-tokens.csv
   # BD: 250+ registros creados en portal_auth_credentials
   ```

   - [ ] Ejecutar comando
   - [ ] Verificar: Success message
   - [ ] Archivo: `beneficiarios-setup-tokens.csv` (visible en root)
   - [ ] Revisar CSV: Nombres, documentos, emails

3. **Opción B: Generar + Enviar Emails (RECOMENDADO)**

   ```bash
   cd scripts
   node create-beneficiary-auth-tokens.mjs --send-emails
   
   # Output: Tokens + Emails enviados
   ```

   - [ ] Ejecutar comando
   - [ ] Monitorear: Emails enviándose (barra de progreso)
   - [ ] Verificar: `Emails enviados: XXX/XXX`
   - [ ] Revisar error count (debe ser 0 o muy bajo)

4. **Opción C: Dry-run (Simular sin cambios)**

   ```bash
   node create-beneficiary-auth-tokens.mjs --dry-run --send-emails
   
   # Simula TODO pero no guarda nada en BD
   ```

5. **Verificar resultados:**
   - [ ] Revisar CSV generado
   - [ ] Buscar tabla: `portal_auth_credentials`
   - [ ] Contar: `SELECT COUNT(*) FROM portal_auth_credentials;`
   - [ ] Revisar: `portal_beneficiarios_email_log` table
   - [ ] Status emails: todos `'sent'`?

---

### 6️⃣ Test Completo: Usuario Final

**Tiempo estimado:** 10-15 minutos

**Pasos:**

1. **Beneficiario recibe email:**
   - [ ] Revisar inbox (o spam)
   - [ ] Email con subject: "🔐 Activa tu Acceso - Portal FOCADES"
   - [ ] Contiene: Nombre, link de activación

2. **Beneficiario abre link:**
   - [ ] Click en `https://focades-pro.vercel.app/beneficiario/auth-setup?token=...`
   - [ ] Página carga correctamente
   - [ ] Paso 3 pre-llenado con token ✓

3. **Completa setup (todos 6 pasos):**
   - [ ] Paso 1: Documento + Email
   - [ ] Paso 2: Verificación email
   - [ ] Paso 3: Contraseña
   - [ ] Paso 4: Género + Teléfono
   - [ ] Paso 5: Universidad + Programa
   - [ ] Paso 6: Banco + Número Cuenta
   - [ ] ✅ Redirige a dashboard

4. **Verificar datos en BD:**
   ```sql
   SELECT * FROM portal_beneficiarios 
   WHERE email = '[email-beneficiario]';
   
   -- Verificar:
   -- perfil_completado_en: debe tener timestamp
   -- genero, telefono, nombre_universidad, programa_academico,
   -- nombre_banco, numero_cuenta: todos completos
   ```

5. **Verificar email en logs:**
   ```sql
   SELECT * FROM portal_beneficiarios_email_log
   WHERE recipient_email = '[email-beneficiario]'
   ORDER BY created_at DESC;
   
   -- Debe ver: setup-activation, status: sent
   ```

---

### 7️⃣ Verificar Admin Dashboard

**Tiempo estimado:** 2 minutos

**Pasos:**

1. **Acceder a Admin:**
   - [ ] URL: https://focades-pro.vercel.app/admin
   - [ ] Login como admin

2. **Abrir Monitor de Activación:**
   - [ ] Menú lateral: **Monitor de Activación**
   - [ ] Componente: `AdminBeneficiarioActivacionMonitor`
   - [ ] Debe cargar sin errores

3. **Verificar estadísticas:**
   - [ ] Total beneficiarios (debe ser > 0)
   - [ ] Con token (debe ser > 0)
   - [ ] Setup completo (debe incrementar)
   - [ ] Perfil completo (debe ver ejemplos)
   - [ ] Embudo de activación visible

4. **Verificar email logs:**
   - [ ] Tabla con últimos 20 emails
   - [ ] Ver status: "Enviado"
   - [ ] Fechas de envío correctas

5. **Test reenvío:**
   - [ ] Ingresar email de beneficiario
   - [ ] Click: **ENVIAR**
   - [ ] Mensaje: "Email reenviado"
   - [ ] Log debe actualizarse

---

## 🟢 OPCIONAL - MEJORAS ADICIONALES

### 8️⃣ Configurar Webhooks de SendGrid (Avanzado)

**Tiempo estimado:** 15 minutos  
**Beneficio:** Tracking real-time de entrega

- [ ] SendGrid: Settings → Mail Send → Event Webhook
- [ ] URL: `https://focades-pro.vercel.app/api/webhooks/sendgrid`
- [ ] Eventos: Seleccionar todos (bounce, complaint, delivered)
- [ ] Crear Edge Function: `sendgrid-webhook-handler`
- [ ] Actualizar tabla: email status via webhooks

---

### 9️⃣ Configurar Recordatorios Automáticos

**Tiempo estimado:** 30 minutos  
**Beneficio:** Reactivar beneficiarios inactivos

- [ ] Crear job: Buscar tokens no usados (>18h)
- [ ] Enviar email: "¿Olvidaste activar?"
- [ ] Con link nuevo
- [ ] Track: aceptación de recordatorios

---

### 🔟 Integración con CRM (Opcional)

**Tiempo estimado:** 1 hora  
**Beneficio:** Rastreo centralizado

- [ ] Conectar Supabase con HubSpot/Salesforce
- [ ] Sync: Estado de activación
- [ ] Sync: Email logs
- [ ] Crear custom reports

---

## 📋 VERIFICACIÓN FINAL

### Pre-Production Checklist

- [ ] ✅ Edge Functions deployed (auth-credentials + send-setup-emails)
- [ ] ✅ SendGrid configurado y testeado
- [ ] ✅ Supabase secrets agregados
- [ ] ✅ Migración BD ejecutada (tabla email_log)
- [ ] ✅ Script funciona sin errores
- [ ] ✅ Test email enviado y recibido
- [ ] ✅ Usuario completa 6 pasos sin problemas
- [ ] ✅ Admin dashboard ve estadísticas
- [ ] ✅ Reenvío de emails funciona
- [ ] ✅ Logs de email correctos en BD
- [ ] ✅ Perfil marcado como completado
- [ ] ✅ Sin errores en console
- [ ] ✅ Performance acceptable (< 2s carga)
- [ ] ✅ Mobile responsive
- [ ] ✅ Documentación leída y entendida

### Go-Live Checklist

- [ ] ✅ Comunicación a beneficiarios (email masivo)
- [ ] ✅ Soporte preparado (FAQ + scripts de respuesta)
- [ ] ✅ Monitor activado en dashboard
- [ ] ✅ Backups de BD antes de envío masivo
- [ ] ✅ Plan de rollback si hay problemas
- [ ] ✅ Número de teléfono soporte visible

---

## 🆘 TROUBLESHOOTING RÁPIDO

### Problema: "SENDGRID_API_KEY no configurada"
```
Solución:
1. Verificar en Supabase dashboard: Settings → Secrets
2. Redeploy send-setup-emails
3. Esperar 2 minutos
```

### Problema: Email no enviado
```
Solución:
1. Verificar status en tabla email_log
2. Ver error_message
3. Revisar SendGrid logs (Dashboard → Activity)
4. Comprobar dominio verificado
```

### Problema: Usuario no ve paso 6
```
Solución:
1. Hard refresh (Ctrl+Shift+R)
2. Revisar console (F12)
3. Verificar JS error
4. Re-deploy BeneficiarioAuthSetup.jsx
```

### Problema: Setup token expirado
```
Solución:
1. Admin: Dashboard → Reenviar Email
2. Genera nuevo token (24h nuevo)
3. Email con link actualizado
```

---

## ✨ SUCCESS INDICATORS

Sabrás que TODO está funcionando cuando:

✅ Beneficiarios reciben email  
✅ Email tiene link de activación  
✅ Link lleva a formulario de 6 pasos  
✅ Barra de progreso se actualiza  
✅ Pre-relleno funciona (universidad, etc)  
✅ Validaciones aparecen en tiempo real  
✅ Se puede llegar hasta paso 6  
✅ Botón "COMPLETAR" redirige a dashboard  
✅ BD se actualiza (perfil_completado_en)  
✅ Admin dashboard ve activaciones en vivo  
✅ Log de emails aparece correctamente  

---

## 📞 ESCALADA DE PROBLEMAS

| Problema | Contacto | Tiempo Respuesta |
|----------|----------|-----------------|
| Supabase down | Supabase Support | 30 min |
| SendGrid rate limit | SendGrid Support | 1 hora |
| Bug en UI | Developer Team | 2 horas |
| Beneficiario no recibe | Email admin | 1 día |

---

## 📅 Timeline Sugerido

| Fase | Duración | Fecha Estimada |
|------|----------|---|
| **Deployment** | 30 min | Hoy |
| **Testing** | 2 horas | Hoy |
| **Envío masivo** | 1-2 horas | Mañana |
| **Monitoreo (7 días)** | 30 min/día | Próx semana |
| **Análisis resultados** | 1 día | En 1 semana |

---

## 🎉 ¡LISTO PARA LANZAR!

Cuando tengas todo completado, **eres oficialmente el heredero del sistema de activación FOCADES**.

**Poder e responsabilidad van juntos.** 

- 📊 Monitorea diariamente
- 🐛 Resuelve issues rápido  
- 📈 Reporta métricas semanales
- 🚀 Itera y mejora continuamente

---

**Documento:** Checklist de Deployment  
**Versión:** 1.0 Final  
**Creado:** 2026-08-13  
**Estado:** 🟢 LISTO
