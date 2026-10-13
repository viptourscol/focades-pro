-- Verificar si la tabla existe
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'portal_documentos_cargue'
) as tabla_existe;

-- Ver todas las tablas que empiezan con portal_
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'portal_%'
ORDER BY table_name;
