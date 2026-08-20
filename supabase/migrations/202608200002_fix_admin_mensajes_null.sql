-- =====================================================
-- Migration: Corrección de mensajes admin con admin_user_id NULL
-- Fecha: 2026-08-20
-- Descripción: Elimina mensajes de admin históricos sin admin_user_id asignado
-- =====================================================

-- Los mensajes de tipo 'admin' deben tener un admin_user_id válido
-- Los mensajes históricos que se migraron con respuesta_admin pero sin admin asignado
-- deben ser eliminados o convertidos a tipo 'sistema'

-- Opción 1: Eliminar mensajes de admin sin admin_user_id
DELETE FROM public.portal_ticket_mensajes
WHERE autor_tipo = 'admin' 
  AND admin_user_id IS NULL;

-- Comentario: Si en el futuro se requiere un tipo 'sistema', descomentar estas líneas:
-- ALTER TABLE public.portal_ticket_mensajes 
--   DROP CONSTRAINT IF EXISTS portal_ticket_mensajes_autor_tipo_check;
-- 
-- ALTER TABLE public.portal_ticket_mensajes 
--   ADD CONSTRAINT portal_ticket_mensajes_autor_tipo_check 
--   CHECK (autor_tipo IN ('beneficiario', 'admin', 'sistema'));
-- 
-- UPDATE public.portal_ticket_mensajes
-- SET autor_tipo = 'sistema'
-- WHERE autor_tipo = 'admin' AND admin_user_id IS NULL;

-- =====================================================
-- Fin de migración
-- =====================================================
