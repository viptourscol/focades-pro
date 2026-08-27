-- Asignar convocatorias a beneficiarios desde sus inscripciones
-- Problema: portal_beneficiarios.convocatoria_id está NULL para todos
-- Solución: Copiar convocatoria_id desde inscripciones usando inscripcion_pk

-- Actualizar beneficiarios con convocatoria de su inscripción
UPDATE public.portal_beneficiarios b
SET convocatoria_id = i.convocatoria_id
FROM public.inscripciones i
WHERE b.inscripcion_pk = i.id
  AND i.convocatoria_id IS NOT NULL
  AND b.convocatoria_id IS NULL; -- Solo actualizar si no tiene convocatoria

-- Comentario de auditoría
COMMENT ON COLUMN public.portal_beneficiarios.convocatoria_id IS 
'ID de la convocatoria a la que pertenece el beneficiario. Se sincroniza desde inscripciones.convocatoria_id cuando el beneficiario es promovido.';
