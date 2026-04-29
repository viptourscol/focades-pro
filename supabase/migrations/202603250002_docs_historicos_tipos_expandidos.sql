-- Migration: Expandir tipos de documentos históricos + onboarding beneficiario
-- Fecha: 2026-03-25
-- Descripción:
--   1. Ampliar la restricción CHECK de tipo_documento en portal_beneficiario_documentos_historicos
--      para incluir todos los tipos del flujo de aspirantes.
--   2. Agregar columna estado (cargado | pendiente) y observacion_admin.
--   3. Agregar columnas de onboarding en portal_beneficiarios para el flujo de
--      primer inicio de sesión (aceptación de términos + firma digital).

-- ===== 1. Expandir tipos de documento histórico =====

ALTER TABLE public.portal_beneficiario_documentos_historicos
  DROP CONSTRAINT IF EXISTS portal_benef_doc_hist_tipo_valido;

ALTER TABLE public.portal_beneficiario_documentos_historicos
  ADD CONSTRAINT portal_benef_doc_hist_tipo_valido CHECK (
    tipo_documento IN (
      -- Documentos del flujo de aspirantes
      'documento_identidad',
      'acta_grado',
      'diploma',
      'pruebas_saber',
      'cert_matricula',
      'ficha_sisben',
      'cert_enfoque',
      'cert_notas',
      'certificado_bancario',
      -- Documentos del onboarding (primer login)
      'firma_digital',
      'tratamiento_datos',
      'aceptacion_terminos',
      -- Tipos genéricos existentes
      'cv',
      'certificado',
      'constancia',
      'otro'
    )
  );

-- ===== 2. Agregar columnas estado + observacion =====

ALTER TABLE public.portal_beneficiario_documentos_historicos
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'cargado'
    CHECK (estado IN ('cargado', 'pendiente')),
  ADD COLUMN IF NOT EXISTS observacion_admin text;

-- ===== 3. Agregar columnas onboarding en portal_beneficiarios =====

ALTER TABLE public.portal_beneficiarios
  ADD COLUMN IF NOT EXISTS onboarding_completado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acepta_terminos_at timestamptz,
  ADD COLUMN IF NOT EXISTS acepta_datos_at timestamptz,
  ADD COLUMN IF NOT EXISTS firma_digital_path text;

-- Nota: Los beneficiarios con auth_user_id ya existentes (activados antes de esta
-- migración) también necesitarán pasar por onboarding. Por defecto onboarding_completado=false
-- los llevará al flujo la primera vez que accedan. Si prefieres marcar a todos los
-- activos como completados, ejecuta:
--   UPDATE portal_beneficiarios SET onboarding_completado = true
--   WHERE auth_user_id IS NOT NULL AND estado_beneficiario = 'activo';
