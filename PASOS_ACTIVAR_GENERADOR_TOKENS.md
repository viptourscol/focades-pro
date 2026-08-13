# ✅ CHECKLIST: PASOS PARA ACTIVAR GENERADOR DE TOKENS

**Última actualización:** 2026-08-13  
**Status Global:** 🟡 IMPLEMENTACIÓN COMPLETADA - FALTA DEPLOYMENT

---

## 📋 ESTADO ACTUAL

### ✅ COMPLETADO (Frontend)
```
✅ Componente React AdminTokenGeneratorPanel.jsx (450 líneas)
✅ Página AdminGeneradorTokens.jsx
✅ Rutas en App.jsx + AdminLayout.jsx
✅ Menú "Generar Tokens" en sidebar con icono ⚡
✅ Metadata en admin layout
✅ Sin errores de compilación
✅ Git commits y push exitosos (3 commits)
```

### 🟡 PENDIENTE DE DEPLOYMENT
```
🟡 Edge Function: send-setup-emails (código listo, no deployado)
🟡 Edge Function: auth-credentials (código listo, no deployado)
🟡 Base de datos: Migrations no ejecutadas
🟡 Supabase: RESEND_API_KEY no configurado en secrets
```

### 🔴 PENDIENTE DE TESTING
```
🔴 Test visual: Verificar que menu aparece
🔴 Test token: Generar 5 tokens desde UI
🔴 Test email: Verificar que emails se envían
🔴 Test escala: Procesar 100+ beneficiarios
```

---

## 🚀 PASOS PARA ACTIVAR (EN ORDEN)

### PASO 1: Verificar UI en Dashboard (5 min)
```
1. Abre: https://focades-pro.vercel.app/admin
2. Busca en el sidebar: "Generar Tokens" con icono ⚡
3. Haz clic
4. Debe cargar página con título:
   "Generador de Tokens"
   "Genera tokens de setup y envía emails de activación"
```

**Si funciona:** ✅ Continúa a PASO 2  
**Si NO aparece:** 
- Logout + Login
- Hard refresh: Ctrl+Shift+R
- Verifica estés logueado como ADMIN (no beneficiario)

---

### PASO 2: Deploy Edge Function - send-setup-emails (3 min)
```
1. Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions
2. Busca: "send-setup-emails"
3. Si ya existe:
   - Click: "Delete"
   - Espera confirmación
   - Luego continúa paso 4
4. Haz clic: "+ New Function"
5. Nombre: "send-setup-emails"
6. Copia TODO el código de:
   supabase/functions/send-setup-emails/index.ts
7. Pégalo en el editor del dashboard
8. Haz clic: "Deploy"
9. Espera: Status debe cambiar a ✅ "Active"
```

**Verificar:**
```
Status debe mostrar:
✅ Active
✅ Endpoint: /send-setup-emails
✅ Última actualización: Hoy
```

---

### PASO 3: Deploy Edge Function - auth-credentials (3 min)
```
1. Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions
2. Busca: "auth-credentials"
3. Si ya existe:
   - Click: "Delete"
   - Espera confirmación
   - Luego continúa paso 4
4. Haz clic: "+ New Function"
5. Nombre: "auth-credentials"
6. Copia TODO el código de:
   supabase/functions/auth-credentials/index.ts
7. Pégalo en el editor del dashboard
8. Haz clic: "Deploy"
9. Espera: Status debe cambiar a ✅ "Active"
```

**Verificar:**
```
Status debe mostrar:
✅ Active
✅ Endpoint: /auth-credentials
✅ Última actualización: Hoy
```

---

### PASO 4: Ejecutar Migrations (2 min)
```
1. Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/sql
2. Click: "+ New Query"
3. Copia TODO el código de:
   supabase/migrations/202608130001_create_email_audit_log.sql
4. Pégalo en el editor
5. Click: "Run" (Ctrl+Enter)
6. Espera: Debe mostrar ✅ "Success"
```

**Verificar:**
```
Debería ejecutar sin errores y crear:
✅ Table: portal_beneficiarios_email_log
✅ View: portal_beneficiarios_activation_status
✅ Indexes en columns: beneficiario_id, status, etc
```

---

### PASO 5: Configurar RESEND_API_KEY (2 min)
```
1. Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/settings/api
2. Click tab: "Secrets" (abajo)
3. Click: "+ Add new secret"
4. Nombre: RESEND_API_KEY
5. Value: (tu Resend API key real)
   Formato: re_xxxxxxxxxxxxxxxxxxxxx
   Obtenla en: https://app.resend.com/api-keys
6. Click: "Save"
7. Verifica que aparezca en lista con ✅
```

**Verificar:**
```
En la lista de secrets debe aparecer:
RESEND_API_KEY ✅ re_***...
SUPABASE_URL ✅ https://jwifxjzxdxjntbdqbyku.supabase.co
SUPABASE_SERVICE_ROLE_KEY ✅ eyJh...
```

---

### PASO 6: Hard Refresh del Browser (1 min)
```
1. En VS Code:
   - Presiona: Ctrl+Shift+R (hard refresh)
   O
2. En el browser:
   - Chrome: Ctrl+Shift+Delete
   - Firefox: Ctrl+Shift+R
   - Safari: Cmd+Option+E
3. Logout + Login como Admin
```

**Por qué:**
- Asegurar que JS cacheado se borre
- Supabase client cargue variables nuevas
- Evitar comportamientos raros

---

### PASO 7: Test Básico - Generar 5 Tokens (5 min)
```
1. Abre: https://focades-pro.vercel.app/admin/generador-tokens
2. Espera a que carguen las estadísticas
   (debe mostrar: Total, Con tokens, Sin tokens)
3. Configura:
   - Cantidad: 5 (benef sin tokens)
   - Enviar emails: NO (por ahora)
   - Incluir existentes: NO
4. Haz clic: "Generar Tokens"
5. Confirma en alert: "Generar tokens"
6. Espera a que complete
```

**Qué debe pasar:**
```
✅ Barra de progreso: 0% → 100%
✅ Logs muestren:
   - Iniciando generación
   - X beneficiarios encontrados
   - [1/5] Token generado: Nombre
   - [2/5] Token generado: Nombre
   - ...
   - COMPLETADO: 5 exitosos, 0 errores
✅ Estadísticas se actualicen
   - Sin tokens: -5
   - Con tokens: +5
```

**Si hay errores:**
```
❌ "Cannot invoke send-setup-emails"
   → Edge Function no está deployada
   → Vuelve a PASO 2

❌ "Database error inserting token"
   → Migrations no ejecutadas
   → Vuelve a PASO 4

❌ "RESEND_API_KEY not found"
   → Variable no configurada
   → Vuelve a PASO 5
```

---

### PASO 8: Test Email - Con 5 Beneficiarios (10 min)
```
1. Abre: https://focades-pro.vercel.app/admin/generador-tokens
2. Configura:
   - Cantidad: 5 (próximos sin tokens)
   - Enviar emails: SI ✓
   - Incluir existentes: NO
3. Haz clic: "Generar Tokens"
4. Confirma en alert: "Generar tokens"
5. Espera a que complete
```

**Qué debe pasar:**
```
✅ Barra progresa
✅ Logs muestren:
   - [1/5] Token generado
   - Email enviado: email@example.com
   - [2/5] Token generado
   - Email enviado: email@example.com
   - ...
✅ Después de 5-10 segundos
   - Los 5 beneficiarios reciben emails
```

**Verificar emails:**
```
1. Abre inbox del beneficiario
2. Busca email de: activacion@focades.info
3. Asunto debe tener: "FOCADES - Setup de tu cuenta"
4. Email debe tener link similar a:
   https://focades-pro.vercel.app/beneficiario/auth-setup?token=abc123...

5. Click en link
6. Debe llevar a pantalla: "Verificar Documento"
7. Ingresa documento del beneficiario
8. Sistema debe obtener token y continuar
```

**Si emails NO llegan:**
```
1. Revisar Resend dashboard: https://app.resend.com
   - Activity log debe mostrar los emails enviados
   - Status debe ser "Delivered" o "Sent"

2. Revisar BD (Supabase SQL):
   SELECT * FROM portal_beneficiarios_email_log 
   WHERE status != 'sent'
   
3. Si status = 'failed', ver error_message para detalles
```

---

### PASO 9: Test Escala - Con 50+ Beneficiarios (60 min)
```
1. Abre: https://focades-pro.vercel.app/admin/generador-tokens
2. Configura:
   - Cantidad: 50 (o todos sin tokens)
   - Enviar emails: SI ✓
   - Incluir existentes: NO
3. Haz clic: "Generar Tokens"
4. Confirma en alert: "Generar tokens"
5. NO CIERRES LA PESTAÑA
6. Deja que complete (puede tomar 10-15 min)
```

**Monitorear:**
```
✅ Barra progresa continuamente
✅ Logs se actualizan en tiempo real
✅ Cada email lista: "Email enviado"
✅ Al final: "COMPLETADO: 50 exitosos, 0 errores"
```

**Después de completar:**
```
1. Abre: AdminBeneficiarioActivacionMonitor
   Admin → Activación Monitor (si existe)
   
2. Verifica:
   - Estadísticas actualizadas
   - 50 tokens generados registrados
   - 50 emails en log con status='sent'
   
3. Abre SQL editor de Supabase:
   SELECT COUNT(*) as total_enviados FROM 
   portal_beneficiarios_email_log 
   WHERE status = 'sent' AND created_at > now() - interval '1 hour'
   
   Debe mostrar: 50 (o la cantidad que generaste)
```

---

### PASO 10: Producción - Todos los Beneficiarios (120 min)
```
SOLO DESPUÉS DE CONFIRMAR QUE TODO FUNCIONA

1. Abre: https://focades-pro.vercel.app/admin/generador-tokens
2. Estadísticas mostrarán:
   - Total: 250 (ej)
   - Con tokens: 50
   - Sin tokens: 200
3. Configura:
   - Cantidad: 200 (todos sin tokens)
   - Enviar emails: SI ✓
   - Incluir existentes: NO
4. Haz clic: "Generar Tokens"
5. Confirma en alert
6. Espera a completar (30-60 min dependiendo de cantidad)
```

**Monitorear:**
```
✅ NO CIERRES LA PESTAÑA
✅ Verifica logs cada 5 min
✅ Si hay errores, los seguirá intentando
✅ Al final: Resumen completo
```

**Después:**
```
1. Verifica que TODOS los beneficiarios reciben email
2. Algunos pueden tomar 5-10 min si hay rate limiting
3. Revisa Resend dashboard para confirmar envío
4. Verifica DB tiene 200 nuevos registros en email_log
```

---

## 🎯 CHECKLIST RÁPIDO

```
ANTES DE INICIAR:
☐ Abierto Supabase Dashboard
☐ Logueado como ADMIN en focades-pro
☐ Tienes RESEND_API_KEY (de https://app.resend.com)
☐ Leíste este documento completamente

PASO A PASO:
☐ PASO 1: Verificar UI (menu aparece)
☐ PASO 2: Deploy send-setup-emails Edge Function
☐ PASO 3: Deploy auth-credentials Edge Function
☐ PASO 4: Ejecutar migrations SQL
☐ PASO 5: Configurar RESEND_API_KEY en secrets
☐ PASO 6: Hard refresh del browser
☐ PASO 7: Test básico (5 tokens sin emails)
☐ PASO 8: Test email (5 tokens CON emails)
☐ PASO 9: Test escala (50+ beneficiarios)
☐ PASO 10: Producción (todos los beneficiarios)

VERIFICACIONES FINALES:
☐ Edge Functions status = Active
☐ Migrations ejecutadas sin errores
☐ RESEND_API_KEY configurado en Supabase
☐ Emails se reciben en inbox del beneficiario
☐ Setup token valida documento
☐ Flujo 6-step funciona completamente
☐ Tokens válidos por 24 horas
☐ Email logs registran todos los eventos
```

---

## 📞 TROUBLESHOOTING

### Problema: Menu "Generar Tokens" no aparece
**Solución:**
1. Logout + Login
2. Hard refresh: Ctrl+Shift+R
3. Verifica estés logueado como ADMIN
4. Verifica no estés en modo incógnito

### Problema: "Cannot invoke send-setup-emails"
**Solución:**
1. Abre Supabase Dashboard → Functions
2. Verifica que "send-setup-emails" existe
3. Status debe ser: ✅ Active
4. Si no: Deploy el Edge Function manualmente (PASO 2)

### Problema: "Database error inserting token"
**Solución:**
1. Verifica que las migrations ejecutaron correctamente
2. Abre Supabase → SQL Editor
3. Ejecuta: `SELECT * FROM portal_auth_credentials LIMIT 1`
4. Si tabla NO existe: Ejecuta migrations (PASO 4)

### Problema: Emails no llegan
**Solución:**
1. Verifica RESEND_API_KEY es válido
2. Abre Resend Dashboard: https://app.resend.com
3. Busca los emails enviados en Activity
4. Si status = "Failed": ver error_message
5. Si llegan a SPAM: agregar a contactos
6. Si NO aparecen en Resend: RESEND_API_KEY no configuro

### Problema: "Email address not verified"
**Solución:**
1. Dominio focades.info debe estar verificado en Resend
2. Abre: https://app.resend.com/domains
3. Si focades.info no aparece: Agrega el dominio
4. Verifica DNS records (Cloudflare)
5. Espera a que se verifique (15-30 min)

### Problema: Tokens expiran muy rápido
**Solución:**
1. Tokens deben ser válidos 24 horas
2. Si expiración es menor: revisar código de generación
3. En AdminTokenGeneratorPanel.jsx:
   - Busca: `setupTokenExpiration`
   - Debe ser: `new Date(Date.now() + 24*60*60*1000)`

### Problema: Progreso se congela
**Solución:**
1. NO cierres la pestaña
2. Espera 5 minutos más
3. Si sigue congelada: Abre Console (F12) y busca errores
4. Si error en Network: Verifica Edge Functions están Active

---

## 📊 ESTADÍSTICAS ESPERADAS

Después de completar PASO 10:
```
Portal Beneficiarios: ~250-300
├─ Con tokens: ~250-300 (100%)
├─ Emails enviados: ~250-300
├─ Emails delivered: ~240-290 (96%+)
└─ Beneficiarios logueados: ~5-10

Email Stats:
├─ Status = sent: ~250-300
├─ Status = failed: <5
├─ Status = bounced: <2
└─ Tasa éxito: >97%

Setup Status:
├─ Setup tokens generados: ~250-300
├─ Setup completado: ~0-5 (depende quién hace test)
├─ Perfil completado: ~0-5
└─ Cuentas activadas: ~0-5
```

---

## 🎓 RESUMEN

El **Generador de Tokens Visual** es un admin panel que:
1. ✅ Genera setup tokens criptográficamente seguros
2. ✅ Envía emails automáticamente via Resend
3. ✅ Rastrea progreso en tiempo real
4. ✅ Registra auditoría completa en BD
5. ✅ NO requiere terminal/CLI

**Después de estos pasos:**
- Todos los beneficiarios tendrán tokens válidos por 24h
- Recibirán emails con link único de setup
- Podrán completar perfil en 6 pasos
- Se garantiza 100% data completeness

**Tiempo total:** 2-3 horas (la mayoría esperando)  
**Complejidad:** Media (solo seguir pasos)  
**Riesgo:** Bajo (puedes regenerar tokens)  

---

**Última revisión:** 2026-08-13 15:45  
**Status:** 🟢 LISTO PARA SEGUIR PASOS
