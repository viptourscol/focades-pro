-- Agregar fecha de cierre de subsanación a portal_ventanas_actualizacion
-- Permite que beneficiarios en subsanacion continúen corrigiendo después de cerrada la ventana

ALTER TABLE public.portal_ventanas_actualizacion
ADD COLUMN IF NOT EXISTS fecha_cierre_subsanacion timestamptz;

-- Crear índice para búsquedas rápidas por fecha
CREATE INDEX IF NOT EXISTS idx_portal_ventanas_fecha_cierre_subsanacion 
ON public.portal_ventanas_actualizacion(fecha_cierre_subsanacion);

-- Actualizar ventanas existentes sin fecha_cierre_subsanacion
-- Si tienen fecha_fin, agregar 14 días como valor por defecto
UPDATE public.portal_ventanas_actualizacion 
SET fecha_cierre_subsanacion = fecha_fin + INTERVAL '14 days'
WHERE fecha_cierre_subsanacion IS NULL;

-- Agregar comentario explicativo
COMMENT ON COLUMN public.portal_ventanas_actualizacion.fecha_cierre_subsanacion IS 
'Fecha límite hasta la cual los beneficiarios pueden subsanar (corregir documentos).
Independiente de la ventana de actualización cerrada. Permite que beneficiarios en 
estado "subsanacion" continúen corrigiendo después de la fecha_fin de la ventana.';
