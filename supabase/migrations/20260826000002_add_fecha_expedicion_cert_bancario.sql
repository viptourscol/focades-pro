-- Agregar campo fecha_expedicion_cert_bancario a portal_actualizaciones
-- Este campo almacena la fecha de expedición del certificado bancario adjunto
-- para validar su vigencia según la configuración (cert_bancario_max_dias)

ALTER TABLE public.portal_actualizaciones
ADD COLUMN IF NOT EXISTS fecha_expedicion_cert_bancario date;

COMMENT ON COLUMN public.portal_actualizaciones.fecha_expedicion_cert_bancario IS 
'Fecha de expedición del certificado bancario adjunto. Debe estar dentro del rango de vigencia establecido (cert_bancario_max_dias)';

-- Crear índice para consultas que filtren por fecha de expedición
CREATE INDEX IF NOT EXISTS idx_portal_actualizaciones_fecha_cert_bancario 
ON public.portal_actualizaciones(fecha_expedicion_cert_bancario) 
WHERE fecha_expedicion_cert_bancario IS NOT NULL;
