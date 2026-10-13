# ESTRATEGIA COMPLETA DE MIGRACIÓN DE BENEFICIARIOS

## 📊 FASE 1: PREPARACIÓN (1-2 días antes del lanzamiento)

### Step 1: Ejecutar migraciones de BD
```bash
# Aplica en Supabase las 2 migraciones:
# 1. 202608120002_extend_portal_beneficiarios.sql (agrega campos académicos/bancarios)
# 2. 202608120001_portal_auth_credentials.sql (ya ejecutada)

# Verificar en Supabase SQL Editor
```

### Step 2: Importar CSV de beneficiarios
```bash
# Coloca el CSV en la raíz del proyecto (o donde lo tengas)
SUPABASE_URL=https://ojnobfvwdpjcmdahgyjv.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=tu_key_aqui \
node scripts/import-beneficiarios.mjs "Hoja de cálculo sin título - Hoja 1.csv"

# Genera:
# - beneficiarios-import-report.json (estadísticas)
# - Inserta ~150 beneficiarios en portal_beneficiarios
# - Pre-llena campos: nombre, email, documento, teléfono, universidad, programa, banco, etc.
```

**Resultado esperado:**
```
✅ Leídos 150 registros
✅ 150 registros válidos
⏭️  150 ya existen (primer run) / 0 duplicados (siguientes runs)
📤 150 nuevos importados
📄 Reporte guardado: beneficiarios-import-report.json
```

### Step 3: Generar setup tokens para beneficiarios
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/create-beneficiary-auth-tokens.mjs

# Genera:
# - beneficiarios-setup-tokens.csv (links con tokens 24h)
# - Inserta setup_token + setup_token_expires_at en portal_auth_credentials
# - Token ejemplos: ?token=abc123def456...
```

### Step 4: Configurar servicio de email (CRÍTICO)
- [ ] Crear cuenta SendGrid / Mailgun / Resend
- [ ] Obtener API Key
- [ ] Agregar a Supabase environment variables: `SENDGRID_API_KEY`
- [ ] Modificar Edge Function `auth-credentials/index.ts` método `setup-init`:
  - En lugar de retornar token, ENVIAR email
  - Email template con link: `https://app.focades.com/beneficiario/auth-setup?token=XXX`

---

## 🚀 FASE 2: LANZAMIENTO (Día D - 8 AM)

### Step 5: Campana de email masiva
```
De: noreply@focades.com
Para: todos los beneficiarios (150+)
Asunto: 🔑 Activa tu acceso al Portal FOCADES

Hola {NOMBRE},

Te damos la bienvenida al Portal FOCADES. Para acceder, necesitas
completar un rápido setup de 3 pasos.

🔗 ACTIVA TU ACCESO AHORA:
https://app.focades.com/beneficiario/auth-setup?token={SETUP_TOKEN}

⏰ El link expira en 24 horas

Si tienes problemas, contacta a: soporte@focades.com

---

Equipo FOCADES
```

**Opciones de envío:**
- SendGrid (recomendado): Integración nativa con Supabase
- Mailgun: API simple
- Resend: Especializado en transaccional

---

## 👤 FASE 3: PRIMER LOGIN DEL BENEFICIARIO

### Timeline: Días 1-7 post-lanzamiento

#### 🔗 Step 1: Beneficiario recibe email + hace clic en link
```
Email → Clic → URL: /beneficiario/auth-setup?token=abc123
```

#### 📝 Step 2: Formulario BeneficiarioAuthSetup (3 pasos)
```
PASO 1: Verificación de Documento
  Input: Número documento, Email
  Backend: Valida token no expiró
  ✅ Token generado (se envía en FASE 1)

PASO 2: Confirmación de Email
  Pantalla: "Email enviado a juan@gmail.com"
  (En testing se muestra en pantalla)

PASO 3: Crear Contraseña
  Input: Contraseña (8+ chars), Confirmar
  Backend: Hashea con bcrypt, guarda en BD
  ✅ Marca setup_completed_at = NOW()
  ↓ Redirige a /beneficiario/login
```

#### 🔐 Step 3: Login exitoso
```
URL: /beneficiario/login
Input: Documento + Contraseña (O Continuar con Google)
Backend: 
  - Valida documento en portal_auth_credentials
  - Compara password contra bcrypt hash
  - Crea sesión Supabase
  - Redirige a /beneficiario/completar-perfil (NUEVO)
```

#### 📋 Step 4: NUEVA PÁGINA - Completar Perfil (FIRST-TIME ONLY)
```
URL: /beneficiario/completar-perfil
Beneficiario ve: 3 tabs
  1. 👤 PERSONAL
     - Género* (Masculino/Femenino/Otro)
     - Teléfono* (10 dígitos)
  
  2. 📚 ACADÉMICA
     - Institución procedencia (pre-llenada del CSV)
     - Universidad* (pre-llenada del CSV)
     - Programa académico* (pre-llenada del CSV)
     - Tipo educación (PROFESIONAL/TECNOLOGICO/TECNICO)
     - Modalidad beca (MÉRITO/SUEÑOS, pre-llenada)
     - Año convocatoria (pre-llenada)
  
  3. 💳 BANCARIA
     - Banco* (dropdown, pre-llenada del CSV)
     - Tipo cuenta (AHORROS/CORRIENTE)
     - Número cuenta* (pre-llenada del CSV)

Validaciones:
  - Campos requeridos: *, NO pueden estar vacíos
  - Teléfono: 10 dígitos
  - Cuenta: Solo números
  - Banco: Seleccionado

Acciones:
  [Cancelar] → Vuelve a /beneficiario/login
  [Guardar y continuar] →
    - Valida formulario
    - Guarda en BD: portal_beneficiarios
    - Marca: perfil_completado_en = NOW()
    - Redirige a /beneficiario (home)
    ✅ PERFIL COMPLETO
```

#### 🏠 Step 5: Acceso al portal
```
URL: /beneficiario
Dashboard con:
  - Resumen de beneficio
  - Actualizaciones pendientes
  - Información académica
  - Estado bancario
```

---

## 📊 BASE DE DATOS: FLUJO DE DATOS

### TABLA: portal_beneficiarios (Importada del CSV)
```
ID | N_DOCUMENTO | NOMBRE | EMAIL | TELEFONO | ESTADO_BENEFICIARIO | GENERO | UNIVERSIDAD | PROGRAMA | BANCO | NUMERO_CUENTA | PERFIL_COMPLETADO_EN | GENERO | ...
1  | 1001409006  | Juan   | ...   | 320...   | ACTIVO              | NULL  | NULL        | NULL     | NULL  | NULL          | NULL                 | NULL   | ...
        ↓ (import CSV)
        ↓ (user setuptoken)
        ↓ (user complete setup)
        ↓ (user login, complete profile)
1  | 1001409006  | Juan   | ...   | 320...   | ACTIVO              | M     | UdeA        | Ingenie  | BBC   | 123456789     | 2026-08-12T14:30:00  | M      | ...
```

### TABLA: portal_auth_credentials (Credenciales alternativas)
```
ID | BENEFICIARIO_ID | DOCUMENT_NUMBER | PASSWORD_HASH | SETUP_TOKEN | SETUP_COMPLETED_AT | EMAIL_VERIFIED
1  | 1               | 1001409006      | NULL          | abc123...   | NULL               | juan@gmail.com
        ↓ (user complete setup)
1  | 1               | 1001409006      | $2a$12$...    | NULL        | 2026-08-12T12:00   | juan@gmail.com
```

---

## 🔄 FLUJOS ALTERNATIVOS

### Beneficiario OLVIDA LINK (24h expirado)
```
1. Va a /beneficiario/login
2. Click: "¿No tienes acceso?"
3. Ingresa documento + email
4. Backend: Genera nuevo setup_token
5. Envía email con nuevo link (24h)
6. Vuelve al flow normal
```

### Beneficiario OLVIDA CONTRASEÑA
```
1. Va a /beneficiario/login → Tab "Documento + Contraseña"
2. Click: "¿Olvidaste tu contraseña?"
3. Ingresa email
4. Backend: Genera password_reset_token (1h)
5. Envía email con link de reset
6. User hace clic, nueva password, vuelve a login
```

### Beneficiario SALSA PASO DE COMPLETAR PERFIL
```
BeneficiarioAuthGuard verifica: 
  - SELECT perfil_completado_en FROM portal_beneficiarios WHERE id = ?
  - Si NULL → REDIRIGE A /beneficiario/completar-perfil
  - No puede acceder a /beneficiario hasta completar
```

---

## 📈 ESTADÍSTICAS DE ÉXITO

### Métricas a monitorear (primeros 7 días):
- [ ] Total beneficiarios importados: 150
- [ ] Setup links enviados: 150
- [ ] Setup links abiertos: X (% tasa de apertura)
- [ ] Setup completados: X (% tasa de conversión)
- [ ] Perfiles completados: X
- [ ] Logins exitosos: X
- [ ] Errores más comunes: (ver portal_auth_login_attempts)

### Queries útiles para admin:
```sql
-- Beneficiarios sin setup completado
SELECT * FROM portal_beneficiarios 
WHERE perfil_completado_en IS NULL
ORDER BY created_at DESC;

-- Setup tokens activos (no expirados)
SELECT * FROM portal_auth_credentials 
WHERE setup_token IS NOT NULL 
  AND setup_token_expires_at > NOW()
ORDER BY setup_token_expires_at DESC;

-- Últimos 10 intentos de login (fallidos)
SELECT * FROM portal_auth_login_attempts 
WHERE success = false 
ORDER BY created_at DESC 
LIMIT 10;

-- Cuentas bloqueadas (5+ intentos fallidos)
SELECT * FROM portal_auth_credentials 
WHERE locked_until > NOW();
```

---

## 🚨 PLAN DE CONTINGENCIA

### Si falla email service (SendGrid down):
1. Usar backup: Mailgun API
2. Alternativa manual: Admin panel envía links por GUI
3. Temporal: Setup links manuales sin expiry (SOLO DEV)

### Si beneficiario no recibe email:
1. Check spam/promotions
2. Admin resends setup token
3. Fallback: Link en SMS (si disponible)

### Si alguien olvida password y email:
1. Requiere verificación de documento + teléfono
2. Admin help desk valida identidad
3. Admin resets password manualmente

---

## ✅ CHECKLIST PRE-LANZAMIENTO

- [ ] Migraciones SQL ejecutadas en Supabase
- [ ] CSV importado, 150 beneficiarios en BD
- [ ] Setup tokens generados
- [ ] Email service configurado (SendGrid/Mailgun)
- [ ] Edge Functions desplegadas
- [ ] BeneficiarioCompletarPerfil componente renderiza
- [ ] Login flow redirige a completar-perfil
- [ ] Rutas /beneficiario/completar-perfil funciona
- [ ] RLS policies correctas (solo users ven su data)
- [ ] Beneficiarios pueden setup + login + complete profile
- [ ] Admin panel para ver setup status
- [ ] Monitoring activo (Sentry/LogRocket)
- [ ] Support team entrenado (FAQ, resend token)

---

## 📞 ESCALATION CONTACTS

**Tech Issues:**
- Backend: [DevOps contact]
- Frontend: [Frontend lead]

**Data Issues:**
- Admin: [Admin contact]
- Support: [Support manager]

**Email Issues:**
- SendGrid: [SendGrid support account]
- Backup: [Mailgun account]
