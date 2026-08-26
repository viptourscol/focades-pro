-- Agregar campo para guardar el checklist de revisión de actualizaciones
-- Este campo permitirá que todos los admins vean el estado de revisión

ALTER TABLE public.portal_actualizaciones
  ADD COLUMN IF NOT EXISTS checklist_revision jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.portal_actualizaciones.checklist_revision IS 'Estado del checklist de revisión compartido entre administradores';
