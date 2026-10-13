-- Verificar la estructura y datos de tabla portal_documentos_cargue
SELECT * FROM portal_documentos_cargue LIMIT 10;

-- Si está vacía, verificar si la tabla existe
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'portal_documentos_cargue';

-- Ver todas las convocatorias que existen
SELECT DISTINCT convocatoria_id FROM portal_documentos_cargue;
