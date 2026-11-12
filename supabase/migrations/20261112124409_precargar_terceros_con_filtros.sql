-- ============================================================================
-- MIGRATION: Precarga de Terceros con Filtros Avanzados
-- DATE: 2026-11-12
-- PURPOSE: Permitir precarga de beneficiarios terceros filtrando por estado y modalidad
-- ============================================================================

-- Reemplaza la función anterior para aceptar filtros opcionales
CREATE OR REPLACE FUNCTION public.precargar_terceros_convocatoria(
  p_documento_id UUID,
  p_estado_beneficiario VARCHAR(50) DEFAULT 'activo',
  p_modalidad_beca VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE(
  cantidad_precargada INTEGER,
  mensaje TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc RECORD;
  v_insertados INTEGER := 0;
  v_mensaje TEXT;
BEGIN
  IF NOT public.fn_tiene_rol('admin_educacion') THEN
    RAISE EXCEPTION 'Solo admin_educacion puede precargar terceros';
  END IF;

  -- Obtener documento y validar
  SELECT id, convocatoria_id, tipo_documento, estado
    INTO v_doc
    FROM public.portal_documentos_cargue
   WHERE id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado: %', p_documento_id;
  END IF;

  IF v_doc.tipo_documento <> 'terceros' OR v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se puede precargar un documento TERCEROS en estado borrador';
  END IF;

  -- Crear tabla temporal para la precarga
  CREATE TEMP TABLE IF NOT EXISTS tmp_precarga_terceros (
    beneficiario_id BIGINT PRIMARY KEY,
    identificacion VARCHAR(15) NOT NULL,
    nombre VARCHAR(200),
    estado_beneficiario VARCHAR(50),
    modalidad_beca VARCHAR(50)
  ) ON COMMIT DROP;
  TRUNCATE tmp_precarga_terceros;

  -- Insertar beneficiarios con filtros
  INSERT INTO tmp_precarga_terceros (beneficiario_id, identificacion, nombre, estado_beneficiario, modalidad_beca)
  SELECT DISTINCT ON (b.id)
         b.id,
         b.n_documento,
         LEFT(b.nombre_completo, 200),
         b.estado_beneficiario,
         b.modalidad_beca
    FROM public.inscripciones i
    JOIN public.portal_beneficiarios b ON b.inscripcion_pk = i.id
   WHERE i.convocatoria_id = v_doc.convocatoria_id
     AND i.promovido_a_beneficiario = TRUE
     AND b.estado_beneficiario = p_estado_beneficiario  -- Filtro por estado
     AND (p_modalidad_beca IS NULL OR b.modalidad_beca = p_modalidad_beca)  -- Filtro por modalidad (opcional)
     AND b.n_documento ~ '^\d{1,15}$'
   ORDER BY b.id;

  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  -- Si no hay datos, retornar aviso
  IF v_insertados = 0 THEN
    RETURN QUERY SELECT 0::INTEGER, 'No se encontraron beneficiarios que cumplan los criterios especificados'::TEXT;
    RETURN;
  END IF;

  -- Insertar en tabla de auditoría de cargue
  INSERT INTO public.portal_cargue_beneficiarios_terceros (documento_cargue_id, beneficiario_id, numero_identificacion)
  SELECT p_documento_id, t.beneficiario_id, t.identificacion
    FROM tmp_precarga_terceros t
  ON CONFLICT (documento_cargue_id, beneficiario_id) DO NOTHING;

  -- Insertar en tabla de valores a cargar
  INSERT INTO public.portal_valores_cargue (documento_id, identificacion, nombre_beneficiario)
  SELECT p_documento_id, t.identificacion, t.nombre
    FROM tmp_precarga_terceros t
   WHERE NOT EXISTS (
     SELECT 1 FROM public.portal_valores_cargue v
      WHERE v.documento_id = p_documento_id
        AND v.identificacion = t.identificacion
   );

  -- Actualizar contador de registros en documento
  UPDATE public.portal_documentos_cargue
     SET cantidad_registros = (
       SELECT COUNT(*) FROM public.portal_valores_cargue 
       WHERE documento_id = p_documento_id
     )
   WHERE id = p_documento_id;

  -- Preparar mensaje de confirmación
  v_mensaje := 'Precargados ' || v_insertados || ' beneficiarios (' || 
               COALESCE(p_modalidad_beca, 'todas modalidades') || ', estado: ' || p_estado_beneficiario || ')';

  RETURN QUERY SELECT v_insertados::INTEGER, v_mensaje::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 0::INTEGER, 'Error en precarga: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.precargar_terceros_convocatoria(UUID, VARCHAR, VARCHAR) TO authenticated;

-- Mantener backward compatibility con la versión anterior (sin parámetros opcionales)
CREATE OR REPLACE FUNCTION public.precargar_terceros_convocatoria(p_documento_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resultado RECORD;
BEGIN
  SELECT cantidad_precargada INTO v_resultado
    FROM public.precargar_terceros_convocatoria(p_documento_id, 'activo', NULL);
  
  RETURN v_resultado.cantidad_precargada;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error en precarga: %', SQLERRM;
  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.precargar_terceros_convocatoria(UUID) TO authenticated;
