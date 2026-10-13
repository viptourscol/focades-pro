-- Script: Verificar y configurar roles para usuarios admin
-- Este script verifica qué usuarios tienen qué roles configurados

-- 1. Ver todos los usuarios y sus roles actuales
SELECT 
  id,
  email,
  raw_user_meta_data->'roles' as roles_actual,
  raw_user_meta_data
FROM auth.users
WHERE email LIKE '%focades%' OR email LIKE '%admin%'
ORDER BY created_at DESC
LIMIT 10;

-- 2. Actualizar usuarios con roles específicos (EJECUTAR UNO A UNO SEGÚN CORRESPONDA)

-- Para admin_educacion (educación@focades.info)
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_educacion"]'::jsonb
)
WHERE email = 'educación@focades.info';

-- Para admin_presupuesto (presupuesto@focades.info)
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_presupuesto"]'::jsonb
)
WHERE email = 'presupuesto@focades.info';

-- Para admin_contabilidad (contabilidad@focades.info)
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_contabilidad"]'::jsonb
)
WHERE email = 'contabilidad@focades.info';

-- Para admin_pagos (pagos@focades.info)
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_pagos"]'::jsonb
)
WHERE email = 'pagos@focades.info';

-- Para admin_visualizacion (visualizacion@focades.info)
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_visualizacion"]'::jsonb
)
WHERE email = 'visualizacion@focades.info';

-- 3. VERIFICAR: Ver los cambios
SELECT 
  email,
  raw_user_meta_data->'roles' as roles
FROM auth.users
WHERE email LIKE '%focades%' OR email LIKE '%admin%'
ORDER BY created_at DESC;
