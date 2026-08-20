-- =====================================================
-- Migration: Hacer nullable campos obsoletos de soporte_tickets
-- Fecha: 2026-08-20
-- Descripción: mensaje_aspirante y respuesta_admin ya no se usan (mensajes en portal_ticket_mensajes)
-- =====================================================

-- Los mensajes ahora van en portal_ticket_mensajes, no en estas columnas
ALTER TABLE public.soporte_tickets 
  ALTER COLUMN mensaje_aspirante DROP NOT NULL;

ALTER TABLE public.soporte_tickets 
  ALTER COLUMN respuesta_admin DROP NOT NULL;

-- Opcionalmente, agregar comentarios para documentar que son columnas legacy
COMMENT ON COLUMN public.soporte_tickets.mensaje_aspirante IS 
  '[OBSOLETO] Mensaje inicial del beneficiario. Ahora se usa portal_ticket_mensajes. Se mantiene para registros históricos.';

COMMENT ON COLUMN public.soporte_tickets.respuesta_admin IS 
  '[OBSOLETO] Respuesta única del admin. Ahora se usa portal_ticket_mensajes. Se mantiene para registros históricos.';

-- =====================================================
-- Fin de migración
-- =====================================================
