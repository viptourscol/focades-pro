-- Restricción requerida por precargar_terceros_convocatoria (ON CONFLICT).
-- Elimina duplicados previos (conserva el registro más antiguo) antes de crear la restricción.

DELETE FROM public.portal_cargue_beneficiarios_terceros a
USING public.portal_cargue_beneficiarios_terceros b
WHERE a.documento_cargue_id = b.documento_cargue_id
  AND a.beneficiario_id = b.beneficiario_id
  AND a.creado_en > b.creado_en;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_cargue_terceros_documento_beneficiario'
      AND conrelid = 'public.portal_cargue_beneficiarios_terceros'::regclass
  ) THEN
    ALTER TABLE public.portal_cargue_beneficiarios_terceros
      ADD CONSTRAINT uq_cargue_terceros_documento_beneficiario
      UNIQUE (documento_cargue_id, beneficiario_id);
  END IF;
END $$;
