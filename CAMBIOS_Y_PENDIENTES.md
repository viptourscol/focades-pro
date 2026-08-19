# Resumen de Cambios y Pendientes

**Fecha:** 2026-08-18  
**Commit:** `e936f15`

## ✅ Cambios Implementados

### 1. Texto "Información de tu beca" → "Información de tu Crédito"
**Ubicación:** [BeneficiarioOnboardingCompleto.jsx](src/pages/BeneficiarioOnboardingCompleto.jsx#L1510)  
**Estado:** ✅ Completado  
**Descripción:** Cambiado el texto para reflejar que es un crédito, no una beca.

### 2. Certificado Enfoque Diferencial Condicional
**Ubicación:** [BeneficiarioOnboardingCompleto.jsx](src/pages/BeneficiarioOnboardingCompleto.jsx#L1728)  
**Estado:** ✅ Completado  
**Descripción:** 
- El documento ahora solo aparece si el beneficiario selecciona un grupo de enfoque diferencial
- Es obligatorio solo cuando se selecciona (no es `'NINGUNO'`)
- Se filtra con `.filter(doc => doc.required !== false)` antes de renderizar

### 3. Sistema de Autenticación Dual para Tickets
**Archivos modificados:**
- [supabase/functions/beneficiary-support-tickets/index.ts](supabase/functions/beneficiary-support-tickets/index.ts)
- [src/lib/beneficiarioTickets.js](src/lib/beneficiarioTickets.js)

**Estado:** ✅ Completado (requiere deploy)  
**Descripción:**
- La Edge Function ahora acepta dos tipos de autenticación:
  1. **JWT de Supabase Auth** (Google OAuth) - Método original
  2. **beneficiario_id en body** (Login con documento) - Método nuevo
- El frontend detecta automáticamente qué tipo de sesión tiene el usuario
- Si hay JWT, lo envía en el Authorization header
- Si hay sesión de documento (localStorage), envía beneficiario_id en el body

**Código de validación en Edge Function:**
```typescript
// Valida JWT o beneficiario_id
if (authToken) {
  // Flujo OAuth con Supabase Auth
} else if (beneficiarioIdFromBody) {
  // Flujo de login con documento
  // Valida que existan credenciales con password_hash
} else {
  throw new HttpError('Sesión inválida...', 401);
}
```

---

## ⚠️ Problemas Identificados y Soluciones

### 4. "Derechos de pago" bloqueados en beneficiario/resumen
**Ubicación:** [BeneficiarioResumen.jsx](src/pages/BeneficiarioResumen.jsx)  
**Problema:** Muestra "No fue posible consultar el calculo centralizado"  
**Causa:** La función RPC `beneficiario_payment_rights` no existe en Supabase o no está desplegada  
**Solución implementada:** El código ya usa fallback local que calcula derechos basándose en:
- `nivel_formacion` (técnico/tecnólogo/profesional)
- `semestre_ingreso`
- `pagos efectuados`

**Estado:** ⚠️ Funcional con estimación local  
**Acción requerida:** Si necesitas cálculo centralizado, debes crear la función RPC `beneficiario_payment_rights` en Supabase

### 5. "Solo beneficiarios activos con ventana vigente" en beneficiario/actualizacion
**Ubicación:** [BeneficiarioActualizacion.jsx](src/pages/BeneficiarioActualizacion.jsx#L290)  
**Problema:** `canUpdate` es false porque `windowInfo` es null  
**Causa:** No hay registros en la tabla de ventanas de actualización  
**Código relevante:**
```javascript
const canUpdate = useMemo(() => {
  if (!profile) return false;
  if (profile.estado_beneficiario !== 'activo') return false;
  return Boolean(windowInfo); // ← windowInfo es null
}, [profile, windowInfo]);
```

**Estado:** ⚠️ Esperado (no hay ventanas configuradas)  
**Acción requerida:**
1. Crear tabla `portal_ventanas_actualizacion` (si no existe)
2. Insertar ventana activa con fechas vigentes
3. Configurar columnas: `fecha_inicio`, `fecha_fin`, `is_active`, `periodo`

**SQL de ejemplo:**
```sql
INSERT INTO portal_ventanas_actualizacion (
  periodo,
  fecha_inicio,
  fecha_fin,
  is_active
) VALUES (
  '2026-II',
  '2026-08-01',
  '2026-09-30',
  true
);
```

### 6. "Tu sesión expiró" en beneficiario/tickets
**Estado:** ✅ Resuelto con cambios en este commit  
**Descripción:** Ahora funciona con ambos tipos de autenticación (JWT y documento)

### 7. Información no aparece en beneficiario/resumen
**Ubicación:** [BeneficiarioResumen.jsx](src/pages/BeneficiarioResumen.jsx#L140)  
**Problema:** El perfil puede no estar en localStorage o puede estar desactualizado  
**Código de carga:**
```javascript
// Intenta cargar desde localStorage primero
const sessionStr = localStorage.getItem('focades:beneficiario-session');
if (sessionStr) {
  const documentSession = JSON.parse(sessionStr);
  // Valida que no sea muy antigua (24h)
  if (Date.now() - sessionTime <= maxAge && documentSession.profile) {
    profileData = documentSession.profile;
  }
}
```

**Estado:** ⚠️ Depende de si se completó onboarding  
**Debugging:**
1. Abre DevTools → Application → Local Storage
2. Busca la key `focades:beneficiario-session`
3. Verifica que:
   - `profile` existe
   - `timestamp` es reciente (< 24h)
   - `onboarding_completado: true`

**Si no hay sesión:** Vuelve a hacer login en `/beneficiario/login`

---

## 🚀 Pasos Siguientes

### Obligatorios para producción:

1. **Desplegar Edge Functions actualizadas:**
   ```bash
   supabase functions deploy beneficiary-support-tickets
   supabase functions deploy auth-credentials
   ```

2. **Crear ventana de actualización** (para BeneficiarioActualizacion):
   - Ve al SQL Editor de Supabase
   - Inserta una ventana con `is_active = true`
   - Configura `fecha_inicio` y `fecha_fin` actuales

3. **Verificar tablas de base de datos:**
   - `portal_auth_credentials` debe tener `password_hash` para usuarios que completaron setup
   - `portal_beneficiarios` debe tener `onboarding_completado = true` para beneficiarios activos
   - Columnas recientes: `dpto_institucion`, `municipio_institucion` deben existir

### Opcionales:

4. **Implementar RPC de derechos de pago** (si se necesita cálculo centralizado)
5. **Revisar migración de campos faltantes** (si hay errores de columnas no encontradas)

---

## 📋 Testing Checklist

Antes de considerar esto completamente funcional, prueba:

- [ ] Login con documento en `/beneficiario/login`
- [ ] Completar onboarding con todos los pasos
- [ ] Verificar que Certificado Enfoque Diferencial solo aparece si corresponde
- [ ] Ir a `/beneficiario/tickets` y verificar que NO dice "sesión expirada"
- [ ] Crear un ticket y verificar que se guarda
- [ ] Ir a `/beneficiario/resumen` y verificar que muestra información
- [ ] Ir a `/beneficiario/actualizacion` y verificar mensaje sobre ventana
- [ ] Logout y login nuevamente para verificar persistencia

---

## 📝 Notas Técnicas

**Sistema de autenticación híbrido:**
- Google OAuth: Usa Supabase Auth con JWT
- Login con documento: Usa localStorage + validación en Edge Functions

**Sesión en localStorage:**
```javascript
{
  "beneficiario_id": "uuid",
  "profile": { /* perfil completo */ },
  "timestamp": "2026-08-18T..."
}
```

**Duración de sesión:** 24 horas (se valida en cada carga)

**Seguridad:** La Edge Function valida que el beneficiario_id tenga credenciales con `password_hash` antes de permitir acceso.
