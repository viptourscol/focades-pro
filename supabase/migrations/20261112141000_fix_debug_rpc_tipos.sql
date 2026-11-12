-- ============================================================================
-- MIGRATION: Corregir tipos en funciones de debug
-- DATE: 2026-11-12
-- PURPOSE: Fijar error "Returned type text does not match expected type character varying"
-- ============================================================================

-- DROP old functions
DROP FUNCTION IF EXISTS public.debug_precargar_rp() CASCADE;
DROP FUNCTION IF EXISTS public.obtener_convocatorias_con_inscritos() CASCADE;
DROP FUNCTION IF EXISTS public.contar_inscritos_por_convocatoria_estado(UUID, VARCHAR) CASCADE;

-- Función para obtener información de debug sobre inscripciones y convocatorias
CREATE OR REPLACE FUNCTION public.debug_precargar_rp()
RETURNS TABLE(
  info_tipo TEXT,
  valor TEXT,
  cantidad BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Convocatorias disponibles
  RETURN QUERY
  SELECT 
    'CONVOCATORIA'::TEXT, 
    ('ID: ' || COALESCE(c.id::TEXT, '') || ' - ' || COALESCE(c.nombre, '') || ' (' || COALESCE(c.anio::TEXT, '') || ')')::TEXT,
    COUNT(i.id)::BIGINT
  FROM public.convocatorias c
  LEFT JOIN public.inscripciones i ON i.convocatoria_id = c.id
  GROUP BY c.id, c.nombre, c.anio
  ORDER BY c.anio DESC, c.nombre;

  -- Estados disponibles en inscripciones
  RETURN QUERY
  SELECT 
    'ESTADO'::TEXT, 
    COALESCE(TRIM(i.estado), 'NULL')::TEXT,
    COUNT(*)::BIGINT
  FROM public.inscripciones i
  GROUP BY i.estado
  ORDER BY COUNT(*) DESC;

END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_precargar_rp() TO authenticated;

-- Función mejorada para obtener convocatorias con conteo de inscritos por estado
CREATE OR REPLACE FUNCTION public.obtener_convocatorias_con_inscritos()
RETURNS TABLE(
  convocatoria_id UUID,
  convocatoria_nombre TEXT,
  convocatoria_anio INTEGER,
  estado TEXT,
  cantidad BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    COALESCE(c.nombre, '')::TEXT,
    c.anio,
    COALESCE(TRIM(i.estado), 'sin_estado')::TEXT,
    COUNT(i.id)::BIGINT
  FROM public.convocatorias c
  LEFT JOIN public.inscripciones i ON i.convocatoria_id = c.id
  GROUP BY c.id, c.nombre, c.anio, i.estado
  ORDER BY c.anio DESC, c.nombre, i.estado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_convocatorias_con_inscritos() TO authenticated;

-- Función para contar inscritos por convocatoria y estado
CREATE OR REPLACE FUNCTION public.contar_inscritos_por_convocatoria_estado(
  p_convocatoria_id UUID,
  p_estado VARCHAR(50)
)
RETURNS TABLE(
  cantidad BIGINT,
  primer_nombre TEXT,
  primer_numero_doc TEXT,
  hay_email BOOLEAN,
  hay_telefono BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(i.id)::BIGINT,
    MAX((i.datos_formulario->>'nombre_completo')::TEXT),
    MAX((i.datos_formulario->>'numero_documento')::TEXT),
    MAX(CASE WHEN (i.datos_formulario->>'email') IS NOT NULL AND (i.datos_formulario->>'email') <> '' THEN TRUE ELSE FALSE END)::BOOLEAN,
    MAX(CASE WHEN (i.datos_formulario->>'telefono') IS NOT NULL AND (i.datos_formulario->>'telefono') <> '' THEN TRUE ELSE FALSE END)::BOOLEAN
  FROM public.inscripciones i
  WHERE i.convocatoria_id = p_convocatoria_id
    AND LOWER(TRIM(COALESCE(i.estado, ''))) LIKE '%' || LOWER(TRIM(p_estado)) || '%';
END;
$$;

GRANT EXECUTE ON FUNCTION public.contar_inscritos_por_convocatoria_estado(UUID, VARCHAR) TO authenticated;
