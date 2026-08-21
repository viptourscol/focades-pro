-- Script para verificar configuración de envío de emails
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar si existe la tabla de logs de email
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'portal_beneficiarios_email_log'
) AS "tabla_email_log_existe";

-- 2. Ver últimos emails enviados (si existe la tabla)
SELECT 
  beneficiario_id,
  email_type,
  recipient_email,
  status,
  sent_at,
  error_message,
  created_at
FROM public.portal_beneficiarios_email_log
ORDER BY created_at DESC
LIMIT 10;

-- 3. Estadísticas de emails por estado
SELECT 
  status,
  email_type,
  COUNT(*) as total
FROM public.portal_beneficiarios_email_log
GROUP BY status, email_type
ORDER BY total DESC;

-- 4. Verificar beneficiarios con email válido para pruebas
SELECT 
  b.id,
  b.nombre_completo,
  b.email,
  c.setup_token IS NOT NULL as tiene_token,
  c.setup_completed_at IS NOT NULL as cuenta_activada
FROM portal_beneficiarios b
LEFT JOIN portal_auth_credentials c ON c.beneficiario_id = b.id
WHERE b.email IS NOT NULL 
  AND b.email != ''
  AND b.email ILIKE '%@%'
ORDER BY b.created_at DESC
LIMIT 5;
