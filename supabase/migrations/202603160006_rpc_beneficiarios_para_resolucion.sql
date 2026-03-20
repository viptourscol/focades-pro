-- RPC 1: Beneficiarios activos con actualización aprobada para una convocatoria y ventana específica.
-- Usada para generar la lista de la resolución de pago.
CREATE OR REPLACE FUNCTION admin_beneficiarios_para_resolucion(
  p_convocatoria_id uuid,
  p_ventana_id      bigint
)
RETURNS TABLE (
  id               bigint,
  nombre_completo  text,
  tipo_documento   text,
  n_documento      text,
  modalidad        text,
  nivel_formacion  text,
  cuenta_bancaria  text,
  banco            text,
  tipo_cuenta      text,
  control_pagos_texto text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_portal_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores pueden consultar este reporte.';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    COALESCE(b.nombre_completo, '') AS nombre_completo,
    COALESCE(b.tipo_documento, '')  AS tipo_documento,
    COALESCE(b.n_documento, '')     AS n_documento,
    COALESCE(b.modalidad, '')       AS modalidad,
    COALESCE(b.nivel_formacion, '') AS nivel_formacion,
    COALESCE(b.cuenta_bancaria, '') AS cuenta_bancaria,
    COALESCE(b.banco, '')           AS banco,
    COALESCE(b.tipo_cuenta, '')     AS tipo_cuenta,
    (
      (
        SELECT COUNT(*)::int
        FROM portal_beneficiario_pagos p
        WHERE p.beneficiario_id = b.id
          AND p.estado = 'efectuado'
      ) + 1
    )::text
    || '/'
    || payment_cap_for_level(COALESCE(b.nivel_formacion, 'profesional'))::text
    AS control_pagos_texto
  FROM portal_beneficiarios b
  INNER JOIN portal_actualizaciones a
    ON  a.beneficiario_id = b.id
    AND a.ventana_id      = p_ventana_id
    AND a.estado          = 'aprobada'
  WHERE b.convocatoria_id    = p_convocatoria_id
    AND b.estado_beneficiario = 'activo'
    AND b.deleted_at IS NULL
  ORDER BY b.nombre_completo;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_beneficiarios_para_resolucion(uuid, bigint) TO authenticated;


-- RPC 2: Estadísticas históricas de admitidos por convocatoria.
-- Cuenta aspirantes con estado='Admitido', desglosados por modalidad.
CREATE OR REPLACE FUNCTION admin_resolucion_convocatoria_stats(
  p_convocatoria_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total   integer;
  v_suenos  integer;
  v_merito  integer;
BEGIN
  IF NOT is_portal_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores pueden consultar este reporte.';
  END IF;

  SELECT
    COUNT(*)::int                                                                              AS total,
    COUNT(*) FILTER (WHERE datos_formulario->>'modalidad' ILIKE '%sue%')::int               AS suenos,
    COUNT(*) FILTER (WHERE datos_formulario->>'modalidad' ILIKE '%m%rito%')::int            AS merito
  INTO v_total, v_suenos, v_merito
  FROM inscripciones
  WHERE convocatoria_id = p_convocatoria_id
    AND estado = 'Admitido';

  RETURN jsonb_build_object(
    'total_admitidos',    COALESCE(v_total, 0),
    'admitidos_suenos',   COALESCE(v_suenos, 0),
    'admitidos_merito',   COALESCE(v_merito, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_resolucion_convocatoria_stats(uuid) TO authenticated;
