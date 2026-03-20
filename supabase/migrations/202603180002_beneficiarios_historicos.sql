-- Migration: Tablas para migración de beneficiarios históricos
-- Fecha: 2026-03-18
-- Descripción: Crear infraestructura para importar documentos y registros históricos
--              sin interrumpir flujos actuales

-- ===== 1. Tabla de lotes de migración =====
CREATE TABLE IF NOT EXISTS public.portal_migracion_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  cantidad_registros integer NOT NULL DEFAULT 0,
  cantidad_documentos integer NOT NULL DEFAULT 0,

  -- Estados: 'en_preparacion', 'validado', 'cargado', 'activado', 'error'
  estado text NOT NULL DEFAULT 'en_preparacion' CHECK (estado IN ('en_preparacion', 'validado', 'cargado', 'activado', 'error')),

  -- Importación
  archivo_nombre text,
  archivo_size_bytes integer,
  checksum_md5 text,

  -- Validación
  validacion_resultado jsonb,
  validacion_timestamp timestamptz,
  validacion_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Carga
  carga_timestamp timestamptz,
  carga_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  carga_resultado jsonb,

  -- Activación (envía invitaciones)
  activacion_timestamp timestamptz,
  activacion_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activacion_resultado jsonb,

  -- Auditoría
  created_at timestamptz DEFAULT now(),
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT portal_migracion_lotes_titulo_not_empty CHECK (length(trim(titulo)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_portal_migracion_lotes_estado ON public.portal_migracion_lotes(estado);
CREATE INDEX IF NOT EXISTS idx_portal_migracion_lotes_created_at ON public.portal_migracion_lotes(created_at DESC);

-- ===== 2. Extensión de tabla portal_beneficiarios =====
ALTER TABLE public.portal_beneficiarios
ADD COLUMN IF NOT EXISTS grado_academico text,
ADD COLUMN IF NOT EXISTS institucion_academica text,
ADD COLUMN IF NOT EXISTS anio_graduacion integer,
ADD COLUMN IF NOT EXISTS observaciones_historicas text,
ADD COLUMN IF NOT EXISTS pertenece_lote_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'portal_beneficiarios_pertenece_lote_id_fkey'
      AND conrelid = 'public.portal_beneficiarios'::regclass
  ) THEN
    ALTER TABLE public.portal_beneficiarios
      ADD CONSTRAINT portal_beneficiarios_pertenece_lote_id_fkey
      FOREIGN KEY (pertenece_lote_id)
      REFERENCES public.portal_migracion_lotes(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ===== 3. Tabla de documentos históricos =====
CREATE TABLE IF NOT EXISTS public.portal_beneficiario_documentos_historicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id bigint NOT NULL REFERENCES public.portal_beneficiarios(id) ON DELETE CASCADE,
  lote_id uuid REFERENCES public.portal_migracion_lotes(id) ON DELETE SET NULL,

  -- Metadatos del documento
  titulo text NOT NULL,
  descripcion text,
  tipo_documento text NOT NULL,
  fecha_documento date,

  -- Almacenamiento en Supabase Storage
  storage_bucket text NOT NULL DEFAULT 'soportes',
  storage_path text NOT NULL,
  archivo_mime_type text,
  archivo_size_bytes integer,

  -- Auditoría
  created_at timestamptz DEFAULT now(),
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT portal_benef_doc_hist_titulo_not_empty CHECK (length(trim(titulo)) > 0),
  CONSTRAINT portal_benef_doc_hist_tipo_valido CHECK (tipo_documento IN ('cv', 'diploma', 'certificado', 'constancia', 'otro')),
  CONSTRAINT portal_benef_doc_hist_storage_path_format CHECK (storage_path ~ '^soportes/beneficiarios_historicos/[0-9]+/')
);

CREATE INDEX IF NOT EXISTS idx_beneficiario_documentos_historicos_beneficiario_id
  ON public.portal_beneficiario_documentos_historicos(beneficiario_id);
CREATE INDEX IF NOT EXISTS idx_beneficiario_documentos_historicos_lote_id
  ON public.portal_beneficiario_documentos_historicos(lote_id);
CREATE INDEX IF NOT EXISTS idx_beneficiario_documentos_historicos_tipo
  ON public.portal_beneficiario_documentos_historicos(tipo_documento);

-- ===== 4. RLS: Políticas de seguridad =====
ALTER TABLE public.portal_migracion_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_beneficiario_documentos_historicos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_migracion_lotes()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.portal_admin_users
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_migracion_lotes'
      AND policyname = 'lotes_admin_all'
  ) THEN
    CREATE POLICY lotes_admin_all ON public.portal_migracion_lotes
      FOR ALL USING (can_manage_migracion_lotes())
      WITH CHECK (can_manage_migracion_lotes());
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.can_manage_beneficiario_documentos_historicos(doc_beneficiario_id bigint)
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (
        SELECT auth.uid() = pb.auth_user_id
        FROM public.portal_beneficiarios pb
        WHERE pb.id = doc_beneficiario_id
      ),
      false
    )
    OR EXISTS (
      SELECT 1
      FROM public.portal_admin_users
      WHERE user_id = auth.uid()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_beneficiario_documentos_historicos'
      AND policyname = 'documentos_historicos_select'
  ) THEN
    CREATE POLICY documentos_historicos_select ON public.portal_beneficiario_documentos_historicos
      FOR SELECT USING (can_manage_beneficiario_documentos_historicos(beneficiario_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_beneficiario_documentos_historicos'
      AND policyname = 'documentos_historicos_insert_admin'
  ) THEN
    CREATE POLICY documentos_historicos_insert_admin ON public.portal_beneficiario_documentos_historicos
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.portal_admin_users WHERE user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_beneficiario_documentos_historicos'
      AND policyname = 'documentos_historicos_update_admin'
  ) THEN
    CREATE POLICY documentos_historicos_update_admin ON public.portal_beneficiario_documentos_historicos
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.portal_admin_users WHERE user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.portal_admin_users WHERE user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_beneficiario_documentos_historicos'
      AND policyname = 'documentos_historicos_delete_admin'
  ) THEN
    CREATE POLICY documentos_historicos_delete_admin ON public.portal_beneficiario_documentos_historicos
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.portal_admin_users WHERE user_id = auth.uid())
      );
  END IF;
END
$$;

-- ===== 5. Storage RLS para documentos históricos =====
-- No se crea archivo marcador (.keep): storage.objects usa columnas generadas
-- y no requiere semilla para habilitar políticas por prefijo.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'beneficiarios_historicos_storage'
  ) THEN
    CREATE POLICY beneficiarios_historicos_storage ON storage.objects
      FOR SELECT USING (
        bucket_id = 'soportes'
        AND (
          path_tokens @> ARRAY['beneficiarios_historicos']
          OR path_tokens @> ARRAY['soportes', 'beneficiarios_historicos']
        )
        AND (
          EXISTS (SELECT 1 FROM public.portal_admin_users WHERE user_id = auth.uid())
          OR (
            auth.uid() IS NOT NULL
            AND path_tokens[2] ~ '^[0-9]+$'
            AND path_tokens[2]::bigint IN (
              SELECT id
              FROM public.portal_beneficiarios
              WHERE auth_user_id = auth.uid()
            )
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'beneficiarios_historicos_storage_insert'
  ) THEN
    CREATE POLICY beneficiarios_historicos_storage_insert ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'soportes'
        AND path_tokens @> ARRAY['beneficiarios_historicos']
        AND EXISTS (SELECT 1 FROM public.portal_admin_users WHERE user_id = auth.uid())
      );
  END IF;
END
$$;

-- ===== Fin migration =====
