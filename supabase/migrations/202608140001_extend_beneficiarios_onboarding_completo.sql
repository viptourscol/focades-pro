-- Migration: Onboarding completo para beneficiarios históricos
-- Fecha: 2026-08-14
-- Descripción: Extender portal_beneficiarios para recopilar información completa
--              durante el proceso de activación (similar a formulario de aspirantes)

-- ===== 1. Datos personales extendidos =====
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS fecha_nacimiento date;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS pais_nacimiento text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS dpto_nacimiento text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS municipio_nacimiento text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS dpto_residencia text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS municipio_residencia text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS direccion_residencia text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS barrio_corregimiento text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS zona_residencia text 
  CHECK (zona_residencia IS NULL OR zona_residencia IN ('URBANA', 'RURAL'));

-- ===== 2. Información socioeconómica =====
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS sisben_grupo text
  CHECK (sisben_grupo IS NULL OR sisben_grupo IN ('A', 'B', 'C', 'D', 'NO_APLICA'));
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS recibe_subsidio text
  CHECK (recibe_subsidio IS NULL OR recibe_subsidio IN ('SI', 'NO'));
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS cual_subsidio text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS enfoque_diferencial text
  CHECK (enfoque_diferencial IS NULL OR enfoque_diferencial IN (
    'NINGUNO', 'INDIGENA', 'AFROCOLOMBIANO', 'ROM', 'RAIZAL', 'PALENQUERO', 
    'DISCAPACIDAD', 'VICTIMA_CONFLICTO', 'LGBTIQ', 'OTRO'
  ));
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS labora_actualmente text
  CHECK (labora_actualmente IS NULL OR labora_actualmente IN ('SI', 'NO'));

-- ===== 3. Composición familiar (opcional) =====
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS nombre_padre text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS documento_padre text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS ocupacion_padre text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS ingresos_padre numeric(12,2);
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS nombre_madre text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS documento_madre text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS ocupacion_madre text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS ingresos_madre numeric(12,2);

-- ===== 4. Formación académica secundaria =====
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS titulo_obtenido text
  CHECK (titulo_obtenido IS NULL OR titulo_obtenido IN (
    'BACHILLER_ACADEMICO', 'BACHILLER_TECNICO', 'BACHILLER_COMERCIAL', 
    'BACHILLER_PEDAGOGICO', 'NORMALISTA', 'OTRO'
  ));
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS ano_graduacion integer
  CHECK (ano_graduacion IS NULL OR (ano_graduacion >= 1980 AND ano_graduacion <= 2050));
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS establecimiento_educativo text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS puntaje_icfes integer
  CHECK (puntaje_icfes IS NULL OR (puntaje_icfes >= 0 AND puntaje_icfes <= 500));
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS municipio_establecimiento text;

-- ===== 5. Formación académica superior (complementar existentes) =====
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS institucion_superior text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS ciudad_institucion text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS semestre_ingreso text;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS modalidad text
  CHECK (modalidad IS NULL OR modalidad IN ('PRESENCIAL', 'VIRTUAL', 'DISTANCIA', 'SEMIPRESENCIAL'));
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS promedio_anterior numeric(4,2)
  CHECK (promedio_anterior IS NULL OR (promedio_anterior >= 0.0 AND promedio_anterior <= 5.0));

-- Ya existen: programa_academico, tipo_educacion, modalidad_beca, año_convocatoria, 
-- nombre_banco, numero_cuenta, tipo_cuenta_bancaria, genero, telefono, 
-- nombre_colegio, nombre_universidad, semestre_actual, perfil_completado_en

-- ===== 6. Columnas de control de onboarding =====
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS onboarding_completado boolean DEFAULT false;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS acepta_terminos_at timestamptz;
ALTER TABLE public.portal_beneficiarios ADD COLUMN IF NOT EXISTS acepta_datos_at timestamptz;

-- ===== 7. Índices para búsquedas y filtros =====
CREATE INDEX IF NOT EXISTS idx_beneficiarios_fecha_nacimiento 
  ON public.portal_beneficiarios(fecha_nacimiento) 
  WHERE fecha_nacimiento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beneficiarios_sisben_grupo 
  ON public.portal_beneficiarios(sisben_grupo) 
  WHERE sisben_grupo IS NOT NULL AND sisben_grupo != 'NO_APLICA';

CREATE INDEX IF NOT EXISTS idx_beneficiarios_enfoque_diferencial 
  ON public.portal_beneficiarios(enfoque_diferencial) 
  WHERE enfoque_diferencial IS NOT NULL AND enfoque_diferencial != 'NINGUNO';

CREATE INDEX IF NOT EXISTS idx_beneficiarios_establecimiento 
  ON public.portal_beneficiarios(establecimiento_educativo) 
  WHERE establecimiento_educativo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beneficiarios_institucion_superior 
  ON public.portal_beneficiarios(institucion_superior) 
  WHERE institucion_superior IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beneficiarios_municipio_residencia 
  ON public.portal_beneficiarios(municipio_residencia) 
  WHERE municipio_residencia IS NOT NULL;

-- ===== 8. Comentarios para documentación =====
COMMENT ON COLUMN public.portal_beneficiarios.fecha_nacimiento IS 'Fecha de nacimiento del beneficiario';
COMMENT ON COLUMN public.portal_beneficiarios.sisben_grupo IS 'Grupo SISBEN (A, B, C, D, NO_APLICA)';
COMMENT ON COLUMN public.portal_beneficiarios.recibe_subsidio IS 'Indica si recibe subsidios del estado';
COMMENT ON COLUMN public.portal_beneficiarios.cual_subsidio IS 'Especifica qué subsidio recibe (si aplica)';
COMMENT ON COLUMN public.portal_beneficiarios.enfoque_diferencial IS 'Grupo poblacional diferencial al que pertenece';
COMMENT ON COLUMN public.portal_beneficiarios.labora_actualmente IS 'Indica si trabaja actualmente';
COMMENT ON COLUMN public.portal_beneficiarios.titulo_obtenido IS 'Título de educación secundaria obtenido';
COMMENT ON COLUMN public.portal_beneficiarios.ano_graduacion IS 'Año de graduación de secundaria';
COMMENT ON COLUMN public.portal_beneficiarios.establecimiento_educativo IS 'Colegio donde cursó secundaria';
COMMENT ON COLUMN public.portal_beneficiarios.puntaje_icfes IS 'Puntaje obtenido en pruebas Saber 11';
COMMENT ON COLUMN public.portal_beneficiarios.institucion_superior IS 'Universidad o instituto de educación superior';
COMMENT ON COLUMN public.portal_beneficiarios.ciudad_institucion IS 'Ciudad donde está ubicada la institución superior';
COMMENT ON COLUMN public.portal_beneficiarios.modalidad IS 'Modalidad de estudio (PRESENCIAL, VIRTUAL, DISTANCIA)';
COMMENT ON COLUMN public.portal_beneficiarios.promedio_anterior IS 'Promedio académico del último semestre cursado';

-- ===== 9. Política RLS para subida de documentos durante onboarding =====
-- Permitir que beneficiarios suban sus propios documentos
DO $$
BEGIN
  -- Eliminar política anterior si existe
  DROP POLICY IF EXISTS beneficiarios_upload_onboarding_docs ON public.portal_beneficiario_documentos_historicos;
  
  -- Crear nueva política
  CREATE POLICY beneficiarios_upload_onboarding_docs 
    ON public.portal_beneficiario_documentos_historicos
    FOR INSERT
    TO authenticated
    WITH CHECK (
      beneficiario_id IN (
        SELECT id FROM public.portal_beneficiarios 
        WHERE auth_user_id = auth.uid() 
          OR id = (
            -- Permitir también para sesiones de documento + contraseña
            SELECT beneficiario_id FROM public.portal_auth_credentials
            WHERE document_number = current_setting('app.beneficiario_document', true)
          )
      )
    );
END $$;

-- Permitir que beneficiarios vean sus propios documentos
DO $$
BEGIN
  DROP POLICY IF EXISTS beneficiarios_read_own_docs ON public.portal_beneficiario_documentos_historicos;
  
  CREATE POLICY beneficiarios_read_own_docs 
    ON public.portal_beneficiario_documentos_historicos
    FOR SELECT
    TO authenticated
    USING (
      beneficiario_id IN (
        SELECT id FROM public.portal_beneficiarios 
        WHERE auth_user_id = auth.uid()
      )
    );
END $$;

-- ===== 10. Función helper para validar completitud de perfil =====
CREATE OR REPLACE FUNCTION public.check_perfil_completitud(benef_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  benef_row public.portal_beneficiarios%ROWTYPE;
  campos_faltantes text[] := '{}';
  resultado jsonb;
BEGIN
  SELECT * INTO benef_row FROM public.portal_beneficiarios WHERE id = benef_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Beneficiario no encontrado');
  END IF;
  
  -- Campos obligatorios básicos
  IF benef_row.genero IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'genero'); END IF;
  IF benef_row.fecha_nacimiento IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'fecha_nacimiento'); END IF;
  IF benef_row.telefono IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'telefono'); END IF;
  IF benef_row.direccion_residencia IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'direccion_residencia'); END IF;
  
  -- Campos socioeconómicos obligatorios
  IF benef_row.sisben_grupo IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'sisben_grupo'); END IF;
  IF benef_row.recibe_subsidio IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'recibe_subsidio'); END IF;
  
  -- Formación académica secundaria
  IF benef_row.titulo_obtenido IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'titulo_obtenido'); END IF;
  IF benef_row.ano_graduacion IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'ano_graduacion'); END IF;
  IF benef_row.establecimiento_educativo IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'establecimiento_educativo'); END IF;
  IF benef_row.puntaje_icfes IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'puntaje_icfes'); END IF;
  
  -- Formación académica superior
  IF benef_row.institucion_superior IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'institucion_superior'); END IF;
  IF benef_row.programa_academico IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'programa_academico'); END IF;
  IF benef_row.tipo_educacion IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'tipo_educacion'); END IF;
  
  -- Información bancaria
  IF benef_row.nombre_banco IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'nombre_banco'); END IF;
  IF benef_row.numero_cuenta IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'numero_cuenta'); END IF;
  IF benef_row.tipo_cuenta_bancaria IS NULL THEN campos_faltantes := array_append(campos_faltantes, 'tipo_cuenta_bancaria'); END IF;
  
  resultado := jsonb_build_object(
    'completo', array_length(campos_faltantes, 1) IS NULL OR array_length(campos_faltantes, 1) = 0,
    'campos_faltantes', campos_faltantes,
    'total_faltantes', COALESCE(array_length(campos_faltantes, 1), 0)
  );
  
  RETURN resultado;
END;
$$;

COMMENT ON FUNCTION public.check_perfil_completitud IS 'Verifica qué campos obligatorios faltan completar en el perfil de un beneficiario';

-- ===== 11. Actualizar perfil_incompleto_fields para beneficiarios existentes =====
-- Esto marcará qué campos faltan en los beneficiarios ya registrados
UPDATE public.portal_beneficiarios
SET perfil_incompleto_fields = (
  SELECT ARRAY(
    SELECT unnest FROM unnest(ARRAY[
      CASE WHEN genero IS NULL THEN 'genero' END,
      CASE WHEN fecha_nacimiento IS NULL THEN 'fecha_nacimiento' END,
      CASE WHEN telefono IS NULL THEN 'telefono' END,
      CASE WHEN direccion_residencia IS NULL THEN 'direccion_residencia' END,
      CASE WHEN sisben_grupo IS NULL THEN 'sisben_grupo' END,
      CASE WHEN recibe_subsidio IS NULL THEN 'recibe_subsidio' END,
      CASE WHEN titulo_obtenido IS NULL THEN 'titulo_obtenido' END,
      CASE WHEN ano_graduacion IS NULL THEN 'ano_graduacion' END,
      CASE WHEN establecimiento_educativo IS NULL THEN 'establecimiento_educativo' END,
      CASE WHEN puntaje_icfes IS NULL THEN 'puntaje_icfes' END,
      CASE WHEN institucion_superior IS NULL THEN 'institucion_superior' END,
      CASE WHEN programa_academico IS NULL THEN 'programa_academico' END,
      CASE WHEN tipo_educacion IS NULL THEN 'tipo_educacion' END,
      CASE WHEN nombre_banco IS NULL THEN 'nombre_banco' END,
      CASE WHEN numero_cuenta IS NULL THEN 'numero_cuenta' END,
      CASE WHEN tipo_cuenta_bancaria IS NULL THEN 'tipo_cuenta_bancaria' END
    ]) AS unnest
    WHERE unnest IS NOT NULL
  )
)
WHERE perfil_completado_en IS NULL;
