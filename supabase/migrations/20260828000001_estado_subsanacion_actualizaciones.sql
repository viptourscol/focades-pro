-- Nuevo estado 'subsanacion' para portal_actualizaciones.
--
-- Flujo: cuando el admin detecta que un dato o documento está mal, en lugar
-- de rechazar la actualización completa (lo que obliga al beneficiario a
-- reenviar TODO de nuevo, duplicando almacenamiento y filas), la marca como
-- 'subsanacion' indicando qué campos y qué documentos debe corregir. El
-- beneficiario ve una tarjeta en su portal, edita solo eso, y al reenviar
-- la actualización vuelve a 'en_revision' sobre la MISMA fila.

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.portal_actualizaciones'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%estado%en_revision%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.portal_actualizaciones DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.portal_actualizaciones
  ADD CONSTRAINT portal_actualizaciones_estado_check
  CHECK (estado IN ('en_revision', 'aprobada', 'rechazada', 'subsanacion'));

-- campos_a_corregir: subconjunto controlado de claves editables por el
-- beneficiario mientras esté en subsanación. 'datos_bancarios' agrupa
-- banco + tipo_cuenta + cuenta_bancaria + fecha_expedicion_cert_bancario,
-- ya que viven dentro de payload_formulario y normalmente se corrigen juntos.
ALTER TABLE public.portal_actualizaciones
  ADD COLUMN IF NOT EXISTS campos_a_corregir text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS documentos_a_corregir text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS marcado_subsanacion_at timestamptz,
  ADD COLUMN IF NOT EXISTS marcado_subsanacion_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subsanado_at timestamptz;

ALTER TABLE public.portal_actualizaciones
  DROP CONSTRAINT IF EXISTS portal_actualizaciones_campos_corregir_check;
ALTER TABLE public.portal_actualizaciones
  ADD CONSTRAINT portal_actualizaciones_campos_corregir_check
  CHECK (campos_a_corregir <@ ARRAY[
    'email', 'telefono', 'direccion', 'semestre_actual',
    'promedio_semestre_anterior', 'datos_bancarios'
  ]::text[]);

ALTER TABLE public.portal_actualizaciones
  DROP CONSTRAINT IF EXISTS portal_actualizaciones_documentos_corregir_check;
ALTER TABLE public.portal_actualizaciones
  ADD CONSTRAINT portal_actualizaciones_documentos_corregir_check
  CHECK (documentos_a_corregir <@ ARRAY[
    'certificado_bancario', 'certificado_notas', 'certificado_matricula'
  ]::text[]);

COMMENT ON COLUMN public.portal_actualizaciones.campos_a_corregir IS
'Campos que el admin marcó como incorrectos y que el beneficiario puede editar mientras estado = subsanacion.';
COMMENT ON COLUMN public.portal_actualizaciones.documentos_a_corregir IS
'Tipos de documento que el admin solicitó reemplazar mientras estado = subsanacion.';
