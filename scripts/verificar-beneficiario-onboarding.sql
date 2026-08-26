-- Verificar estado de onboarding de un beneficiario
-- Usar con: npx supabase db execute --file scripts/verificar-beneficiario-onboarding.sql

SELECT 
  pb.id,
  pb.nombre_completo,
  pb.email,
  pb.n_documento,
  pb.onboarding_completado,
  pb.estado_beneficiario,
  pac.id as credential_id,
  CASE 
    WHEN pac.password_hash IS NOT NULL THEN 'SÍ'
    ELSE 'NO'
  END as tiene_password,
  pac.setup_completed_at,
  pac.created_at as credential_created_at
FROM portal_beneficiarios pb
LEFT JOIN portal_auth_credentials pac ON pb.id = pac.beneficiario_id
WHERE pb.email = 'jannyermartinez@gmail.com';
