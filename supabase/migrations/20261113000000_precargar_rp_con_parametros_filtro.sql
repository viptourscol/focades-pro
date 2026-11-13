-- ============================================================================
-- MIGRATION: Mejorar precargar_rp_convocatoria con parámetros de filtro
-- DATE: 2026-11-13
-- PURPOSE: Aceptar convocatoria_id y estado como parámetros desde el modal
-- ============================================================================

-- Eliminar funciones viejas (CASCADE elimina dependencias)
DROP FUNCTION IF EXISTS public.precargar_rp_convocatoria(UUID, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.precargar_rp_convocatoria(UUID) CASCADE;

-- Versión mejorada que acepta convocatoria_id y estado como parámetros
CREATE OR REPLACE FUNCTION public.precargar_rp_convocatoria(
  p_documento_id UUID,
  p_convocatoria_id UUID DEFAULT NULL,
  p_estado VARCHAR(50) DEFAULT 'admitido',
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
  v_debug_count INTEGER := 0;
  v_convocatoria_id_usar UUID;
  v_estado_buscar VARCHAR(50);
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

  -- Usar convocatoria del parámetro si se proporciona, sino usar del documento
  v_convocatoria_id_usar := COALESCE(p_convocatoria_id, v_doc.convocatoria_id);
  
  IF v_convocatoria_id_usar IS NULL THEN
    RAISE EXCEPTION 'No se especificó convocatoria. Debe seleccionar una convocatoria antes de precargar.';
  END IF;

  -- Normalizar estado
  v_estado_buscar := COALESCE(TRIM(LOWER(p_estado)), 'admitido');

  RAISE NOTICE 'Precarga iniciada: documento=%, convocatoria=%, estado=%, modalidad=%', 
    p_documento_id, v_convocatoria_id_usar, v_estado_buscar, COALESCE(p_modalidad_beca, 'todas');

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

  -- Debug: Ver cuántos registros hay en la convocatoria
  SELECT COUNT(*) INTO v_debug_count
  FROM public.inscripciones i
  WHERE i.convocatoria_id = v_convocatoria_id_usar;
  
  RAISE NOTICE 'Total inscripciones en convocatoria: %', v_debug_count;

  -- Debug: Ver cuántos en el estado específico
  SELECT COUNT(*) INTO v_debug_count
  FROM public.inscripciones i
  WHERE i.convocatoria_id = v_convocatoria_id_usar
    AND LOWER(TRIM(COALESCE(i.estado, ''))) LIKE '%' || v_estado_buscar || '%';
  
  RAISE NOTICE 'Inscritos en estado "%": %', v_estado_buscar, v_debug_count;

  -- Insertar aspirantes con filtros: convocatoria + estado + (modalidad opcional)
  INSERT INTO tmp_precarga_rp (
    inscripcion_id, identificacion, nombre, modalidad_beca,
    tipo_identificacion, email, telefono, direccion, ciudad
  )
  SELECT DISTINCT ON (i.id)
         i.id,
         COALESCE(
           NULLIF((i.datos_formulario->>'numero_documento')::VARCHAR(15), ''),
           NULLIF((i.datos_formulario->>'cedula')::VARCHAR(15), ''),
           NULLIF((i.datos_formulario->>'numero_id')::VARCHAR(15), ''),
           NULLIF((i.datos_formulario->>'identification_number')::VARCHAR(15), ''),
           ''
         ),
         COALESCE(
           NULLIF((i.datos_formulario->>'nombre_completo')::VARCHAR(200), ''),
           NULLIF((i.datos_formulario->>'primer_nombre')::VARCHAR(200) || ' ' ||
                  (i.datos_formulario->>'primer_apellido')::VARCHAR(200), ' '),
           NULLIF((i.datos_formulario->>'nombre')::VARCHAR(200), ''),
           'Sin nombre'
         ),
         (i.datos_formulario->>'modalidad_beca')::VARCHAR(50),
         COALESCE((i.datos_formulario->>'tipo_documento')::VARCHAR(10), 
                  (i.datos_formulario->>'tipo_identificacion')::VARCHAR(10), 'CC'),
         COALESCE((i.datos_formulario->>'email')::VARCHAR(100), ''),
         COALESCE((i.datos_formulario->>'telefono')::VARCHAR(20), 
                  (i.datos_formulario->>'phone')::VARCHAR(20), ''),
         COALESCE((i.datos_formulario->>'direccion')::VARCHAR(255), 
                  (i.datos_formulario->>'address')::VARCHAR(255), ''),
         COALESCE((i.datos_formulario->>'ciudad')::VARCHAR(100), 
                  (i.datos_formulario->>'city')::VARCHAR(100), '')
    FROM public.inscripciones i
   WHERE i.convocatoria_id = v_convocatoria_id_usar
     AND LOWER(TRIM(COALESCE(i.estado, ''))) LIKE '%' || v_estado_buscar || '%'
     AND (p_modalidad_beca IS NULL OR 
          LOWER(COALESCE((i.datos_formulario->>'modalidad_beca')::VARCHAR(50), '')) = LOWER(p_modalidad_beca))
   ORDER BY i.id;

  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  RAISE NOTICE 'Registros encontrados: %', v_insertados;

  -- Si no hay datos, retornar aviso
  IF v_insertados = 0 THEN
    RETURN QUERY SELECT 0::INTEGER, 
      'No se encontraron aspirantes en estado "' || v_estado_buscar || '" para la convocatoria seleccionada. Verifica que existan datos en inscripciones con ese estado.'::TEXT;
    RETURN;
  END IF;

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
  v_mensaje := 'Precargados ' || v_insertados || ' aspirantes (estado: ' || v_estado_buscar || 
               ', modalidad: ' || COALESCE(p_modalidad_beca, 'todas') || ')';

  RETURN QUERY SELECT v_insertados::INTEGER, v_mensaje::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 0::INTEGER, 'Error en precarga: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.precargar_rp_convocatoria(UUID, UUID, VARCHAR, VARCHAR) TO authenticated;
