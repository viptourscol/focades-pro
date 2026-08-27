-- Fix: Corregir tipo de columna semestre_ingreso a integer
-- El problema: semestre_ingreso se creó como integer pero luego se intentó agregar como text
-- Esto causa error en compute_beneficiario_payment_rights: "COALESCE types text and integer cannot be matched"

-- Verificar y convertir semestre_ingreso a integer si está como text
DO $$
BEGIN
  -- Intentar alterar la columna a integer
  -- Si ya es integer, no hace nada
  -- Si es text, convierte valores válidos a integer
  BEGIN
    ALTER TABLE public.portal_beneficiarios 
    ALTER COLUMN semestre_ingreso TYPE integer 
    USING CASE 
      WHEN semestre_ingreso IS NULL THEN NULL
      WHEN semestre_ingreso ~ '^\d+$' THEN semestre_ingreso::integer
      ELSE NULL 
    END;
    
    RAISE NOTICE 'semestre_ingreso convertido a integer';
  EXCEPTION
    WHEN undefined_column THEN
      RAISE NOTICE 'semestre_ingreso no existe, se creará como integer';
      ALTER TABLE public.portal_beneficiarios ADD COLUMN semestre_ingreso integer;
    WHEN OTHERS THEN
      RAISE NOTICE 'semestre_ingreso ya es integer o error: %', SQLERRM;
  END;
END $$;

-- Asegurar que la columna existe y es integer
ALTER TABLE public.portal_beneficiarios 
ADD COLUMN IF NOT EXISTS semestre_ingreso integer;

-- Recrear la función compute_beneficiario_payment_rights con casts explícitos para seguridad
CREATE OR REPLACE FUNCTION public.compute_beneficiario_payment_rights(
  p_beneficiario_id bigint,
  p_exclude_payment_id bigint DEFAULT NULL
)
RETURNS TABLE (
  beneficiario_id bigint,
  nivel_formacion text,
  nivel_normalizado text,
  modalidad text,
  semestre_ingreso integer,
  semestre_referencia integer,
  tope_pagos integer,
  derecho_inicial integer,
  ajustes_netos integer,
  derecho_total integer,
  pagos_efectuados integer,
  pagos_restantes integer,
  estado_beneficiario text,
  es_elegible boolean,
  motivo_bloqueo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_beneficiario public.portal_beneficiarios%ROWTYPE;
  v_nivel_normalizado text;
  v_tope integer;
  v_semestre_base integer;
  v_derecho_inicial integer;
  v_ajustes integer := 0;
  v_pagos_efectuados integer := 0;
  v_derecho_total integer;
  v_pagos_restantes integer;
  v_es_elegible boolean := FALSE;
  v_motivo_bloqueo text := NULL;
BEGIN
  SELECT *
  INTO v_beneficiario
  FROM public.portal_beneficiarios
  WHERE id = p_beneficiario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Beneficiario no encontrado.';
  END IF;

  v_nivel_normalizado := public.normalize_beneficiario_level(v_beneficiario.nivel_formacion);
  v_tope := public.payment_cap_for_level(v_beneficiario.nivel_formacion);
  
  -- Fix: Asegurar que ambos valores sean integer antes del COALESCE
  v_semestre_base := GREATEST(
    COALESCE(
      v_beneficiario.semestre_ingreso::integer,
      v_beneficiario.semestre_actual::integer,
      1
    ),
    1
  );

  IF v_tope IS NULL THEN
    v_derecho_inicial := 0;
    v_motivo_bloqueo := 'Nivel de formacion no configurado para derechos de pago.';
  ELSE
    v_derecho_inicial := GREATEST(0, v_tope - (v_semestre_base - 1));
  END IF;

  SELECT COALESCE(SUM(a.ajuste_pagos), 0)
  INTO v_ajustes
  FROM public.portal_beneficiario_pago_ajustes a
  WHERE a.beneficiario_id = p_beneficiario_id
    AND a.is_active = TRUE;

  SELECT COUNT(*)
  INTO v_pagos_efectuados
  FROM public.portal_beneficiario_pagos p
  WHERE p.beneficiario_id = p_beneficiario_id
    AND p.estado = 'efectuado'
    AND (p_exclude_payment_id IS NULL OR p.id <> p_exclude_payment_id);

  v_derecho_total := GREATEST(0, v_derecho_inicial + v_ajustes);
  v_pagos_restantes := GREATEST(0, v_derecho_total - v_pagos_efectuados);

  IF v_beneficiario.deleted_at IS NOT NULL THEN
    v_es_elegible := FALSE;
    v_motivo_bloqueo := COALESCE(v_motivo_bloqueo, 'Beneficiario eliminado logicamente.');
  ELSIF COALESCE(v_beneficiario.estado_beneficiario, 'activo') <> 'activo' THEN
    v_es_elegible := FALSE;
    v_motivo_bloqueo := COALESCE(v_motivo_bloqueo, 'El beneficiario no esta en estado activo.');
  ELSIF v_tope IS NULL THEN
    v_es_elegible := FALSE;
  ELSIF v_pagos_restantes <= 0 THEN
    v_es_elegible := FALSE;
    v_motivo_bloqueo := COALESCE(v_motivo_bloqueo, 'El beneficiario ya agotó sus cupos de pago.');
  ELSE
    v_es_elegible := TRUE;
  END IF;

  RETURN QUERY
  SELECT
    v_beneficiario.id,
    v_beneficiario.nivel_formacion,
    v_nivel_normalizado,
    v_beneficiario.modalidad,
    v_beneficiario.semestre_ingreso,
    v_semestre_base,
    v_tope,
    v_derecho_inicial,
    v_ajustes,
    v_derecho_total,
    v_pagos_efectuados,
    v_pagos_restantes,
    v_beneficiario.estado_beneficiario,
    v_es_elegible,
    v_motivo_bloqueo;
END;
$$;

COMMENT ON FUNCTION public.compute_beneficiario_payment_rights IS 'Calcula derechos de pago de un beneficiario. Fix: casts explícitos para evitar error COALESCE types text and integer.';
