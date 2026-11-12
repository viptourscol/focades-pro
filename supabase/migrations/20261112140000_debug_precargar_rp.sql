-- ============================================================================
-- MIGRATION: Funciones de debug para precarga de RP
-- DATE: 2026-11-12
-- PURPOSE: Traer información de estados y convocatorias reales
-- ============================================================================

-- Función para obtener información de debug sobre inscripciones y convocatorias
CREATE OR REPLACE FUNCTION public.debug_precargar_rp()
RETURNS TABLE(
  info_tipo TEXT,
  valor VARCHAR(200),
  cantidad INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Convocatorias disponibles
  RETURN QUERY
  SELECT 'CONVOCATORIA'::TEXT, 'ID: ' || c.id::TEXT || ' - ' || c.nombre || ' (' || c.anio::TEXT || ')'::VARCHAR(200), COUNT(i.id)::INTEGER
  FROM public.convocatorias c
  LEFT JOIN public.inscripciones i ON i.convocatoria_id = c.id
  GROUP BY c.id, c.nombre, c.anio
  ORDER BY c.anio DESC, c.nombre;

  -- Estados disponibles en inscripciones
  RETURN QUERY
  SELECT 'ESTADO'::TEXT, COALESCE(i.estado, 'NULL')::VARCHAR(200), COUNT(*)::INTEGER
  FROM public.inscripciones i
  GROUP BY i.estado
  ORDER BY COUNT(*) DESC;

  -- Verificar estructura de datos_formulario (primeros 5)
  RETURN QUERY
  SELECT 'DATOS_FORMULARIO_KEYS'::TEXT, 
         (json_object_keys(i.datos_formulario))::VARCHAR(200),
         COUNT(*)::INTEGER
  FROM public.inscripciones i
  LIMIT 5;

END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_precargar_rp() TO authenticated;

-- Función mejorada para obtener convocatorias con conteo de inscritos por estado
CREATE OR REPLACE FUNCTION public.obtener_convocatorias_con_inscritos()
RETURNS TABLE(
  convocatoria_id UUID,
  convocatoria_nombre VARCHAR(200),
  convocatoria_anio INTEGER,
  estado VARCHAR(50),
  cantidad INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.nombre,
    c.anio,
    COALESCE(i.estado, 'sin_estado'),
    COUNT(i.id)::INTEGER
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
  cantidad INTEGER,
  primer_nombre VARCHAR(200),
  primer_numero_doc VARCHAR(20),
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
    COUNT(i.id)::INTEGER,
    MAX((i.datos_formulario->>'nombre_completo')::VARCHAR(200)),
    MAX((i.datos_formulario->>'numero_documento')::VARCHAR(20)),
    MAX(CASE WHEN (i.datos_formulario->>'email') IS NOT NULL AND (i.datos_formulario->>'email') <> '' THEN TRUE ELSE FALSE END)::BOOLEAN,
    MAX(CASE WHEN (i.datos_formulario->>'telefono') IS NOT NULL AND (i.datos_formulario->>'telefono') <> '' THEN TRUE ELSE FALSE END)::BOOLEAN
  FROM public.inscripciones i
  WHERE i.convocatoria_id = p_convocatoria_id
    AND LOWER(TRIM(COALESCE(i.estado, ''))) LIKE '%' || LOWER(p_estado) || '%';
END;
$$;

GRANT EXECUTE ON FUNCTION public.contar_inscritos_por_convocatoria_estado(UUID, VARCHAR) TO authenticated;
