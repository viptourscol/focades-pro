-- SQL para actualizar roles de los usuarios admin restantes
-- Ejecuta esto en: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/sql

-- Admin Contabilidad
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_contabilidad"]'::jsonb
)
WHERE email = 'alvarez.mesa.rosa09@gmail.com';

-- Admin Pagos
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_pagos"]'::jsonb
)
WHERE email = 'mesaalvarezrosa@gmail.com';

-- Admin Visualización
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin_visualizacion"]'::jsonb
)
WHERE email = 'tiago.sop90@gmail.com';

-- Verificar cambios
SELECT 
  email,
  raw_user_meta_data->'roles' as roles
FROM auth.users
WHERE email IN (
  'reyterjannyer@gmail.com',
  'ingjadermartinezbarrios@gmail.com',
  'alvarez.mesa.rosa09@gmail.com',
  'mesaalvarezrosa@gmail.com',
  'tiago.sop90@gmail.com'
)
ORDER BY email;
