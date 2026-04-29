-- Fix: Permitir a beneficiarios completar su onboarding
-- 1. Storage: subir su propia firma digital a beneficiarios_historicos/{su_id}/
-- 2. Tabla: registrar sus propios documentos en portal_beneficiario_documentos_historicos

-- 1. Storage INSERT — beneficiario puede subir a su propia subcarpeta
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'beneficiarios_historicos_storage_insert_self'
  ) THEN
    CREATE POLICY beneficiarios_historicos_storage_insert_self ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'soportes'
        AND path_tokens[1] = 'beneficiarios_historicos'
        AND auth.uid() IS NOT NULL
        AND path_tokens[2]::bigint IN (
          SELECT id FROM public.portal_beneficiarios WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 2. Tabla: beneficiario puede insertar sus propios documentos históricos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_beneficiario_documentos_historicos'
      AND policyname = 'documentos_historicos_insert_self'
  ) THEN
    CREATE POLICY documentos_historicos_insert_self
      ON public.portal_beneficiario_documentos_historicos
      FOR INSERT WITH CHECK (
        beneficiario_id IN (
          SELECT id FROM public.portal_beneficiarios WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;
