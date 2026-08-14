-- ============================================
-- VERIFICACIÓN POST-DEPLOYMENT
-- ============================================
-- Ejecuta este script en Supabase SQL Editor después del deployment
-- para confirmar que todo está correctamente configurado

-- 1. Verificar nuevas columnas en portal_beneficiarios
SELECT 
  'Nuevas columnas agregadas' AS check_name,
  COUNT(*) AS total_columnas,
  CASE 
    WHEN COUNT(*) >= 5 THEN '✅ OK'
    ELSE '❌ FALTA'
  END AS status
FROM information_schema.columns 
WHERE table_name = 'portal_beneficiarios' 
  AND column_name IN (
    'fecha_nacimiento', 'sisben_grupo', 'titulo_obtenido', 
    'institucion_superior', 'onboarding_completado', 
    'acepta_terminos_at', 'acepta_datos_at'
  );

-- 2. Verificar función check_perfil_completitud
SELECT 
  'Función check_perfil_completitud' AS check_name,
  COUNT(*) AS existe,
  CASE 
    WHEN COUNT(*) = 1 THEN '✅ OK'
    ELSE '❌ NO EXISTE'
  END AS status
FROM information_schema.routines 
WHERE routine_name = 'check_perfil_completitud';

-- 3. Verificar políticas RLS para documentos
SELECT 
  'Políticas RLS documentos' AS check_name,
  COUNT(*) AS total_policies,
  CASE 
    WHEN COUNT(*) >= 2 THEN '✅ OK'
    ELSE '❌ FALTAN'
  END AS status
FROM pg_policies 
WHERE tablename = 'portal_beneficiario_documentos_historicos'
  AND policyname IN ('beneficiarios_upload_onboarding_docs', 'beneficiarios_read_own_docs');

-- 4. Verificar índices creados
SELECT 
  'Índices de búsqueda' AS check_name,
  COUNT(*) AS total_indexes,
  CASE 
    WHEN COUNT(*) >= 5 THEN '✅ OK'
    ELSE '❌ FALTAN'
  END AS status
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'portal_beneficiarios'
  AND indexname LIKE 'idx_beneficiarios_%';

-- 5. Verificar tabla portal_beneficiario_documentos_historicos existe
SELECT 
  'Tabla documentos históricos' AS check_name,
  COUNT(*) AS existe,
  CASE 
    WHEN COUNT(*) = 1 THEN '✅ OK'
    ELSE '❌ NO EXISTE'
  END AS status
FROM information_schema.tables 
WHERE table_name = 'portal_beneficiario_documentos_historicos';

-- 6. Verificar tabla portal_auth_credentials existe
SELECT 
  'Tabla auth_credentials' AS check_name,
  COUNT(*) AS existe,
  CASE 
    WHEN COUNT(*) = 1 THEN '✅ OK'
    ELSE '❌ NO EXISTE'
  END AS status
FROM information_schema.tables 
WHERE table_name = 'portal_auth_credentials';

-- 7. Probar función check_perfil_completitud con beneficiario de ejemplo
-- (Reemplaza el ID con un beneficiario real de tu base de datos)
SELECT 
  'Test función completitud' AS check_name,
  CASE 
    WHEN (SELECT check_perfil_completitud(1))::text LIKE '%completo%' THEN '✅ OK'
    ELSE '❌ ERROR'
  END AS status;

-- 8. Listar beneficiarios con onboarding pendiente
SELECT 
  'Beneficiarios con onboarding pendiente' AS check_name,
  COUNT(*) AS total,
  '📊 INFO' AS status
FROM portal_beneficiarios
WHERE onboarding_completado IS NULL OR onboarding_completado = false;

-- 9. Verificar storage bucket 'soportes' existe
SELECT 
  'Bucket soportes en Storage' AS check_name,
  COUNT(*) AS existe,
  CASE 
    WHEN COUNT(*) >= 1 THEN '✅ OK'
    ELSE '⚠️  REVISAR'
  END AS status
FROM storage.buckets
WHERE name = 'soportes';

-- ============================================
-- RESUMEN FINAL
-- ============================================
SELECT 
  '🎯 DEPLOYMENT STATUS' AS resumen,
  CASE 
    WHEN (
      SELECT COUNT(*) FROM information_schema.columns 
      WHERE table_name = 'portal_beneficiarios' 
        AND column_name IN ('fecha_nacimiento', 'sisben_grupo', 'onboarding_completado')
    ) >= 3 THEN '✅ LISTO PARA USAR'
    ELSE '❌ REVISAR ERRORES ARRIBA'
  END AS estado;
