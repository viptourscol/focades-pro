-- DEBUG: Verificar documentos para beneficiario 2961

-- 1. Documentos en portal_beneficiario_documentos_historicos
SELECT 
  id,
  beneficiario_id,
  titulo,
  tipo_documento,
  storage_path,
  created_at
FROM public.portal_beneficiario_documentos_historicos
WHERE beneficiario_id = 2961
ORDER BY created_at DESC;

-- 2. Documentos en inscripciones_documentos (si existen)
SELECT 
  id,
  inscripcion_id,
  nombre_original,
  tipo_documento,
  storage_path,
  uploaded_at
FROM public.inscripciones_documentos
WHERE inscripcion_id IN (
  SELECT inscripcion_pk FROM public.portal_beneficiarios WHERE id = 2961
)
ORDER BY uploaded_at DESC;

-- 3. Búsqueda específica del documento problemático
SELECT 
  id,
  beneficiario_id,
  titulo,
  tipo_documento
FROM public.portal_beneficiario_documentos_historicos
WHERE id = '986a7085-3eee-4a64-9347-3c7a777b6a63';

-- 4. Verificar si el beneficiario existe
SELECT id, nombre_completo, inscripcion_pk
FROM public.portal_beneficiarios
WHERE id = 2961;
