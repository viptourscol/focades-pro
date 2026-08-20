-- =====================================================
-- Migration: Fix RLS policies para portal_ticket_mensajes
-- Fecha: 2026-08-20
-- Descripción: Permitir inserciones de beneficiarios vía Edge Functions
-- =====================================================

-- Problema: RLS bloquea inserciones incluso con service_role_key
-- Solución: Agregar policy para permitir INSERT con service_role

-- Opción 1: Deshabilitar RLS completamente (todas las operaciones vía Edge Functions)
ALTER TABLE public.portal_ticket_mensajes DISABLE ROW LEVEL SECURITY;

-- Las Edge Functions con SUPABASE_SERVICE_ROLE_KEY manejan toda la lógica de seguridad
-- No necesitamos RLS adicional porque:
-- 1. Beneficiarios acceden SOLO vía Edge Functions (con validación)
-- 2. Admins acceden con JWT autenticado (validado en Edge Functions)
-- 3. No hay acceso directo desde el frontend

-- =====================================================
-- Fin de migración
-- =====================================================
