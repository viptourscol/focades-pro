-- Reemplaza admin_beneficiarios_para_resolucion para buscar la convocatoria
-- tanto desde portal_beneficiarios.convocatoria_id (si existe) como desde
-- inscripciones.convocatoria_id (a través de inscripcion_pk), cubriendo
-- beneficiarios creados antes de que se poblara el campo convocatoria_id.

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
    COALESCE(b.nombre_completo, '')  AS nombre_completo,
    COALESCE(b.tipo_documento, '')   AS tipo_documento,
    COALESCE(b.n_documento, '')      AS n_documento,
    COALESCE(b.modalidad, '')        AS modalidad,
    COALESCE(b.nivel_formacion, '')  AS nivel_formacion,
    COALESCE(b.cuenta_bancaria, '')  AS cuenta_bancaria,
    COALESCE(b.banco, '')            AS banco,
    COALESCE(b.tipo_cuenta, '')      AS tipo_cuenta,
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
  -- Busca la convocatoria directamente en el beneficiario O vía la inscripción original
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
