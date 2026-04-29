-- Migration: Relajar validación de correo en validate_historicos_batch
-- Fecha: 2026-03-25
-- Descripción: Correo pasa de error bloqueante a advertencia.
--              Beneficiarios sin correo pueden importarse pero quedan
--              en categoría 'sin_correo' y no pueden activar portal
--              hasta que el admin agregue el correo manualmente.

CREATE OR REPLACE FUNCTION public.validate_historicos_batch(
  p_lote_data jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_errores text[] := ARRAY[]::text[];
  v_advertencias text[] := ARRAY[]::text[];
  v_beneficiarios jsonb;
  v_beneficiario jsonb;
  v_idx integer;
BEGIN
  -- Validar estructura básica
  IF p_lote_data IS NULL THEN
    v_errores := array_append(v_errores, 'Datos de lote no pueden ser nulos');
    RETURN jsonb_build_object(
      'valido', false,
      'errores', v_errores,
      'advertencias', v_advertencias,
      'total_validado', 0
    );
  END IF;

  -- Validar que sea array de beneficiarios
  IF NOT (p_lote_data @> '[]'::jsonb) THEN
    v_errores := array_append(v_errores, 'Datos debe ser un array de beneficiarios');
    RETURN jsonb_build_object(
      'valido', false,
      'errores', v_errores,
      'advertencias', v_advertencias,
      'total_validado', 0
    );
  END IF;

  v_beneficiarios := p_lote_data;
  v_idx := 0;

  -- Validar cada registro
  FOR v_beneficiario IN SELECT jsonb_array_elements(v_beneficiarios)
  LOOP
    v_idx := v_idx + 1;

    -- Campos obligatorios (solo nombre y cédula bloquean)
    IF (v_beneficiario->>'nombre') IS NULL OR length(trim(v_beneficiario->>'nombre')) = 0 THEN
      v_errores := array_append(v_errores, 'Fila ' || v_idx || ': nombre es obligatorio');
    END IF;

    IF (v_beneficiario->>'cedula') IS NULL OR length(trim(v_beneficiario->>'cedula')) = 0 THEN
      v_errores := array_append(v_errores, 'Fila ' || v_idx || ': cédula es obligatoria');
    END IF;

    -- Correo: ahora es advertencia (no bloquea la importación)
    IF (v_beneficiario->>'correo') IS NULL OR length(trim(v_beneficiario->>'correo')) = 0 THEN
      v_advertencias := array_append(v_advertencias, 'Fila ' || v_idx || ': sin correo — el beneficiario no podrá activar el portal hasta que se registre uno');
    ELSIF NOT (v_beneficiario->>'correo' ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') THEN
      v_advertencias := array_append(v_advertencias, 'Fila ' || v_idx || ': correo con formato dudoso: ' || (v_beneficiario->>'correo'));
    END IF;

    -- Validar cédula formato (si es colombiana esperamos XX.XXX.XXX o similar)
    IF (v_beneficiario->>'cedula') IS NOT NULL AND NOT (v_beneficiario->>'cedula' ~ '^[0-9]{6,15}$') THEN
      v_advertencias := array_append(v_advertencias, 'Fila ' || v_idx || ': cédula con formato no estándar: ' || (v_beneficiario->>'cedula'));
    END IF;

    -- Límite de registros por validación (de seguridad)
    IF v_idx > 10000 THEN
      v_errores := array_append(v_errores, 'Límite máximo de 10000 registros excedido');
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'valido', array_length(v_errores, 1) IS NULL OR array_length(v_errores, 1) = 0,
    'errores', v_errores,
    'advertencias', v_advertencias,
    'total_validado', v_idx
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
