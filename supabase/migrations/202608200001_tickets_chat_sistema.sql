-- =====================================================
-- Migration: Sistema de Chat para Tickets de Soporte
-- Fecha: 2026-08-20
-- Descripción: Transforma tickets de respuesta única a sistema de chat
-- =====================================================

-- 1. Agregar admin_user_id a soporte_tickets primero
ALTER TABLE public.soporte_tickets 
  ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES public.portal_admin_users(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_soporte_tickets_admin_user 
  ON public.soporte_tickets(admin_user_id) WHERE admin_user_id IS NOT NULL;

-- 2. Crear tabla para mensajes de tickets (chat)
CREATE TABLE IF NOT EXISTS public.portal_ticket_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.soporte_tickets(id) ON DELETE CASCADE,
  autor_tipo TEXT NOT NULL CHECK (autor_tipo IN ('beneficiario', 'admin')),
  mensaje TEXT NOT NULL CHECK (char_length(mensaje) >= 1 AND char_length(mensaje) <= 5000),
  admin_user_id UUID REFERENCES public.portal_admin_users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ticket_mensajes_ticket_id 
  ON public.portal_ticket_mensajes(ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_mensajes_created_at 
  ON public.portal_ticket_mensajes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_mensajes_ticket_created 
  ON public.portal_ticket_mensajes(ticket_id, created_at DESC);

-- 3. Agregar columnas de cierre a soporte_tickets
ALTER TABLE public.soporte_tickets 
  ADD COLUMN IF NOT EXISTS cerrado_por UUID REFERENCES public.portal_admin_users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMPTZ;

-- Índice para tickets cerrados
CREATE INDEX IF NOT EXISTS idx_soporte_tickets_cerrado 
  ON public.soporte_tickets(cerrado_at) WHERE cerrado_at IS NOT NULL;

-- 4. Migrar datos existentes (mensaje_aspirante y respuesta_admin)
-- Insertar mensajes iniciales del beneficiario
INSERT INTO public.portal_ticket_mensajes (ticket_id, autor_tipo, mensaje, created_at)
SELECT 
  id AS ticket_id,
  'beneficiario' AS autor_tipo,
  mensaje_aspirante AS mensaje,
  created_at
FROM public.soporte_tickets
WHERE mensaje_aspirante IS NOT NULL 
  AND char_length(trim(mensaje_aspirante)) > 0
ON CONFLICT DO NOTHING;

-- Insertar respuestas del admin (solo si existe respuesta_admin)
INSERT INTO public.portal_ticket_mensajes (ticket_id, autor_tipo, mensaje, admin_user_id, created_at)
SELECT 
  id AS ticket_id,
  'admin' AS autor_tipo,
  respuesta_admin AS mensaje,
  admin_user_id,
  COALESCE(respondido_at, updated_at) AS created_at
FROM public.soporte_tickets
WHERE respuesta_admin IS NOT NULL 
  AND char_length(trim(respuesta_admin)) > 0
ON CONFLICT DO NOTHING;

-- 5. Marcar como cerrados los tickets con estado 'cerrado'
UPDATE public.soporte_tickets
SET 
  cerrado_at = updated_at,
  cerrado_por = admin_user_id
WHERE estado = 'cerrado' 
  AND cerrado_at IS NULL;

-- 6. RLS policies para portal_ticket_mensajes
ALTER TABLE public.portal_ticket_mensajes ENABLE ROW LEVEL SECURITY;

-- Policy: Admin puede ver todos los mensajes
CREATE POLICY admin_view_all_mensajes 
  ON public.portal_ticket_mensajes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_admin_users
      WHERE portal_admin_users.user_id = auth.uid()
    )
  );

-- Policy: Admin puede insertar mensajes
CREATE POLICY admin_insert_mensajes 
  ON public.portal_ticket_mensajes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    autor_tipo = 'admin' 
    AND EXISTS (
      SELECT 1 FROM public.portal_admin_users
      WHERE portal_admin_users.user_id = auth.uid()
        AND portal_admin_users.user_id = admin_user_id
    )
  );

-- Policy: Beneficiarios NO pueden acceder directamente (usarán Edge Functions)
-- No se crean policies para beneficiarios - todo mediante Edge Functions con service_role_key

-- 7. Comentarios para documentación
COMMENT ON TABLE public.portal_ticket_mensajes IS 
  'Mensajes individuales de tickets de soporte (sistema de chat). Cada ticket puede tener múltiples mensajes del beneficiario y admin.';

COMMENT ON COLUMN public.portal_ticket_mensajes.autor_tipo IS 
  'Tipo de autor del mensaje: beneficiario (usuario) o admin (personal administrativo)';

COMMENT ON COLUMN public.portal_ticket_mensajes.admin_user_id IS 
  'ID del administrador si el mensaje es de tipo admin. NULL si es del beneficiario.';

COMMENT ON COLUMN public.soporte_tickets.cerrado_por IS 
  'ID del administrador que cerró el ticket. NULL si aún está abierto.';

COMMENT ON COLUMN public.soporte_tickets.cerrado_at IS 
  'Fecha y hora en que se cerró el ticket. NULL si aún está abierto.';

-- =====================================================
-- Fin de migración
-- =====================================================
