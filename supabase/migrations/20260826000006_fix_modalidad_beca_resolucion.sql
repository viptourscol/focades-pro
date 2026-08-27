-- Corrige admin_beneficiarios_para_resolucion: la columna "modalidad" en
-- portal_beneficiarios contiene la modalidad de estudio (PRESENCIAL/VIRTUAL/
-- DISTANCIA), NO el tipo de beca. El tipo de beca (Sueños/Mérito) vive en
-- la columna "modalidad_beca". El frontend necesita este último valor para
-- clasificar el valor a pagar por modalidad de beca.

CREATE OR REPLACE FUNCTION admin_beneficiarios_para_resolucion(
  p_convocatoria_id uuid,
  p_ventana_id      bigint
)
RETURNS TABLE (
  id                  bigint,
  nombre_completo     text,
  tipo_documento      text,
  n_documento         text,
  modalidad           text,
  nivel_formacion     text,
  cuenta_bancaria     text,
  banco               text,
  tipo_cuenta         text,
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
    COALESCE(b.nombre_completo, '')     AS nombre_completo,
    COALESCE(b.tipo_documento, '')      AS tipo_documento,
    COALESCE(b.n_documento, '')         AS n_documento,
    COALESCE(b.modalidad_beca, '')      AS modalidad,           -- CORREGIDO: modalidad_beca (Sueños/Mérito)
    COALESCE(b.nivel_formacion, '')     AS nivel_formacion,
    COALESCE(b.numero_cuenta, '')       AS cuenta_bancaria,
    COALESCE(b.nombre_banco, '')        AS banco,
    COALESCE(b.tipo_cuenta_bancaria, '') AS tipo_cuenta,
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
  LEFT JOIN inscripciones i ON i.id = b.inscripcion_pk
  INNER JOIN portal_actualizaciones a
    ON  a.beneficiario_id = b.id
    AND a.ventana_id      = p_ventana_id
    AND a.estado          = 'aprobada'
  WHERE (
      b.convocatoria_id = p_convocatoria_id
      OR i.convocatoria_id = p_convocatoria_id
    )
    AND b.estado_beneficiario = 'activo'
    AND b.deleted_at IS NULL
  ORDER BY b.nombre_completo;
END;
$$;

COMMENT ON FUNCTION admin_beneficiarios_para_resolucion(uuid, bigint) IS
'Obtiene beneficiarios activos con actualización aprobada en una ventana específica.
El campo "modalidad" retornado corresponde a modalidad_beca (Sueños/Mérito), usado
por el frontend para calcular el valor a pagar según la modalidad de beca.';
