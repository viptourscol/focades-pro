-- Permite tipos de notificación de ventanas en portal_notificaciones_beneficiarios.

alter table public.portal_notificaciones_beneficiarios
  drop constraint if exists portal_notificaciones_beneficiarios_tipo_check;

alter table public.portal_notificaciones_beneficiarios
  add constraint portal_notificaciones_beneficiarios_tipo_check
  check (
    tipo in (
      'actualización_confirmada',
      'actualización_rechazada',
      'actualización_aprobada',
      'documentos_incompletos',
      'plazo_próximo',
      'elegibilidad_confirmada',
      'pago_efectuado',
      'anuncio_general',
      'estados_vigente',
      'ventana_habilitada',
      'ventana_cerrada'
    )
  );
