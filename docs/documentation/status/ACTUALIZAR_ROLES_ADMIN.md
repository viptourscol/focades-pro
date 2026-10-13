# Actualizar Roles de Usuarios Admin

## Opción 1: Ejecutar SQL en Dashboard de Supabase (MÁS FÁCIL)

1. Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/sql/new
2. Copia y pega el SQL de abajo
3. Ejecuta

## SQL para Ejecutar

```sql
-- PASO 1: Verificar usuarios actuales y sus roles
SELECT 
  id,
  email,
  raw_user_meta_data->'roles' as roles,
  created_at
FROM auth.users
WHERE email IS NOT NULL
ORDER BY created_at DESC;

-- PASO 2: Actualizar roles (ejecutar este bloque completo)

-- Admin Educación
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_educacion"]'::jsonb
)
WHERE email = 'educación@focades.info';

-- Admin Presupuesto
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_presupuesto"]'::jsonb
)
WHERE email = 'presupuesto@focades.info';

-- Admin Contabilidad
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_contabilidad"]'::jsonb
)
WHERE email = 'contabilidad@focades.info';

-- Admin Pagos
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_pagos"]'::jsonb
)
WHERE email = 'pagos@focades.info';

-- Admin Visualización
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_visualizacion"]'::jsonb
)
WHERE email = 'visualizacion@focades.info';

-- PASO 3: Verificar cambios
SELECT 
  email,
  raw_user_meta_data->'roles' as roles
FROM auth.users
WHERE email LIKE '%@focades.info'
   OR email LIKE '%educación%'
   OR email LIKE '%presupuesto%'
   OR email LIKE '%contabilidad%'
   OR email LIKE '%pagos%'
   OR email LIKE '%visualizacion%'
ORDER BY email;
```

## Si los usuarios NO existen

Si los usuarios con esos correos no existen en `auth.users`, necesitas crearlos primero:

```sql
-- Crear usuarios (reemplaza con los correos correctos)
-- Esto genera invitations que pueden ser aceptadas para setup
```

O usa el dashboard de Supabase:
1. Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/auth/users
2. Click en "Invite" 
3. Agrega los correos

## Opción 2: Obtener SERVICE ROLE KEY y ejecutar script

1. Ve a: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/settings/api
2. Copia la clave "service_role" (la más larga)
3. Ejecuta:
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY="paste-your-key-here"
   node scripts/update-admin-roles.mjs
   ```

## Notas

- Los roles deben estar en formato array: `["admin_educacion"]`
- El frontend lee: `user.user_metadata?.roles`
- Las Edge Functions leen el array y toman el primer elemento: `roles[0]`
