-- ============================================================================
-- MIGRATION: Precarga de RP (Resolución y Promoción) con Filtros Avanzados
-- DATE: 2026-11-12
-- PURPOSE: Permitir precarga de aspirantes ADMITIDOS filtrando por modalidad
-- NOTE: RP carga ASPIRANTES ADMITIDOS de la convocatoria seleccionada, no beneficiarios
-- ============================================================================

-- Función RPC para precargar RP con filtros opcionales por modalidad
CREATE OR REPLACE FUNCTION public.precargar_rp_convocatoria(
  p_documento_id UUID,
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
    RAISE EXCEPTION 'Solo admin_educacion puede precargar RP';
  END IF;

  -- Obtener documento y validar
  SELECT id, convocatoria_id, tipo_documento, estado
    INTO v_doc
    FROM public.portal_documentos_cargue
   WHERE id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado: %', p_documento_id;
  END IF;

  IF v_doc.tipo_documento <> 'rp' OR v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se puede precargar un documento RP en estado borrador';
  END IF;

  -- Crear tabla temporal para la precarga
  CREATE TEMP TABLE IF NOT EXISTS tmp_precarga_rp (
    inscripcion_id BIGINT PRIMARY KEY,
    identificacion VARCHAR(15) NOT NULL,
    nombre VARCHAR(200),
    modalidad_beca VARCHAR(50),
    tipo_identificacion VARCHAR(10),
    email VARCHAR(100),
    telefono VARCHAR(20),
    direccion VARCHAR(255),
    ciudad VARCHAR(100)
  ) ON COMMIT DROP;
  TRUNCATE tmp_precarga_rp;

  -- Insertar aspirantes ADMITIDOS con filtros
  -- Los datos vienen de la tabla inscripciones filtrada por:
  -- 1. Convocatoria seleccionada
  -- 2. Estado = 'admitido'
  -- 3. Modalidad de beca (opcional)
  INSERT INTO tmp_precarga_rp (
    inscripcion_id, identificacion, nombre, modalidad_beca,
    tipo_identificacion, email, telefono, direccion, ciudad
  )
  SELECT DISTINCT ON (i.id)
         i.id,
         COALESCE(
           (i.datos_formulario->>'numero_documento')::VARCHAR(15),
           ''
         ),
         COALESCE(
           (i.datos_formulario->>'nombre_completo')::VARCHAR(200),
           (i.datos_formulario->>'primer_nombre')::VARCHAR(200) || ' ' ||
           (i.datos_formulario->>'primer_apellido')::VARCHAR(200),
           'Sin nombre'
         ),
         (i.datos_formulario->>'modalidad_beca')::VARCHAR(50),
         COALESCE((i.datos_formulario->>'tipo_documento')::VARCHAR(10), 'CC'),
         COALESCE((i.datos_formulario->>'email')::VARCHAR(100), ''),
         COALESCE((i.datos_formulario->>'telefono')::VARCHAR(20), ''),
         COALESCE((i.datos_formulario->>'direccion')::VARCHAR(255), ''),
         COALESCE((i.datos_formulario->>'ciudad')::VARCHAR(100), '')
    FROM public.inscripciones i
   WHERE i.convocatoria_id = v_doc.convocatoria_id
     AND LOWER(TRANSLATE(COALESCE(i.estado, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = 'admitido'
     AND (p_modalidad_beca IS NULL OR 
          (i.datos_formulario->>'modalidad_beca')::VARCHAR(50) = p_modalidad_beca)
     AND (i.datos_formulario->>'numero_documento')::VARCHAR(15) ~ '^\d{1,15}$'
   ORDER BY i.id;

  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  -- Si no hay datos, retornar aviso
  IF v_insertados = 0 THEN
    RETURN QUERY SELECT 0::INTEGER, 'No se encontraron aspirantes admitidos que cumplan los criterios especificados'::TEXT;
    RETURN;
  END IF;

  -- Insertar en tabla de auditoría de cargue (si existe)
  BEGIN
    INSERT INTO public.portal_cargue_beneficiarios_terceros (documento_cargue_id, numero_identificacion)
    SELECT p_documento_id, t.identificacion
      FROM tmp_precarga_rp t
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Si la tabla no existe o hay error, continuar
    NULL;
  END;

  -- Insertar en tabla de valores a cargar (incluyendo nuevos campos)
  INSERT INTO public.portal_valores_cargue (
    documento_id, identificacion, nombre_beneficiario, 
    tipo_identificacion, email, telefono, direccion, ciudad
  )
  SELECT 
    p_documento_id, t.identificacion, t.nombre,
    t.tipo_identificacion, t.email, t.telefono, t.direccion, t.ciudad
    FROM tmp_precarga_rp t
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
  v_mensaje := 'Precargados ' || v_insertados || ' aspirantes admitidos (' || 
               COALESCE(p_modalidad_beca, 'todas modalidades') || ')';

  RETURN QUERY SELECT v_insertados::INTEGER, v_mensaje::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 0::INTEGER, 'Error en precarga: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.precargar_rp_convocatoria(UUID, VARCHAR) TO authenticated;

-- Mantener backward compatibility con versión sin parámetros
CREATE OR REPLACE FUNCTION public.precargar_rp_convocatoria(p_documento_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resultado RECORD;
BEGIN
  SELECT cantidad_precargada INTO v_resultado
    FROM public.precargar_rp_convocatoria(p_documento_id, NULL);
  
  RETURN v_resultado.cantidad_precargada;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error en precarga: %', SQLERRM;
  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.precargar_rp_convocatoria(UUID) TO authenticated;
