-- Prevent duplicate update submissions for the same beneficiary and update window
-- This migration adds a unique index to prevent multiple active submissions per window

-- Step 1: Handle existing duplicates (if any)
-- For each beneficiary+ventana combination with multiple submissions,
-- keep only the most recent one in 'en_revision' or 'aprobada' state
-- Other duplicates will be marked as rejected (historical record preserved)
WITH duplicates AS (
  SELECT 
    beneficiario_id,
    ventana_id,
    array_agg(id ORDER BY created_at DESC) as ids,
    count(*) as total
  FROM public.portal_actualizaciones
  WHERE estado IN ('en_revision', 'aprobada')
  GROUP BY beneficiario_id, ventana_id
  HAVING count(*) > 1
)
UPDATE public.portal_actualizaciones pa
SET 
  estado = 'rechazada',
  payload_formulario = jsonb_set(
    payload_formulario,
    '{motivo_rechazo_sistema}',
    '"Duplicado: submission anterior en misma ventana fue mantenido"'::jsonb
  ),
  updated_at = now()
FROM duplicates d
WHERE pa.beneficiario_id = d.beneficiario_id
  AND pa.ventana_id = d.ventana_id
  AND pa.id != d.ids[1];  -- Keep the most recent, reject the rest

-- Step 2: Add unique index to prevent future duplicates in active states
-- This index only enforces uniqueness for 'en_revision' and 'aprobada' states
-- allowing multiple 'rechazada' records for audit trail
CREATE UNIQUE INDEX IF NOT EXISTS uk_actualizaciones_beneficiario_ventana_active
ON public.portal_actualizaciones (beneficiario_id, ventana_id, estado)
WHERE estado IN ('en_revision', 'aprobada');

-- Step 3: Add index for faster lookups on active submissions
CREATE INDEX IF NOT EXISTS idx_portal_actualizaciones_active
ON public.portal_actualizaciones (beneficiario_id, ventana_id, estado)
WHERE estado IN ('en_revision', 'aprobada');

-- Add index for RLS policy and permission checks
CREATE INDEX IF NOT EXISTS idx_portal_actualizaciones_ventana_active
ON public.portal_actualizaciones (ventana_id)
WHERE estado IN ('en_revision', 'aprobada');

-- Step 4: Add audit tracking columns if not already present
ALTER TABLE public.portal_actualizaciones
ADD COLUMN IF NOT EXISTS revisado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS revisado_at timestamptz,
ADD COLUMN IF NOT EXISTS revisor_asignado_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS revisor_asignado_at timestamptz,
ADD COLUMN IF NOT EXISTS observacion_admin text;

-- Step 5: Comment documenting the unique index
COMMENT ON INDEX uk_actualizaciones_beneficiario_ventana_active IS
'Prevent multiple active (en_revision or aprobada) submissions per beneficiary and update window.
Rejected submissions are kept for audit trail and can be multiple per window.
This index enforces the business rule: one active submission per beneficiary per update window.';
