-- Evita duplicados para documentos generados automáticamente por inscripción.
create unique index if not exists ux_inscripciones_documentos_generados_unicos
  on public.inscripciones_documentos (inscripcion_id, tipo_documento)
  where tipo_documento in (
    'formulario_credito_educativo',
    'aceptacion_terminos_condiciones',
    'autorizacion_tratamiento_datos'
  );
