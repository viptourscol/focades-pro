-- ============================================================================
-- MIGRATION: Cargue Masivo - Tablas Base
-- DATE: 2026-10-12
-- PURPOSE: Create tables for multi-departmental bulk upload workflow system
-- ============================================================================

-- ============================================================================
-- 1. TABLA: portal_plantillas_cargue
-- Metadata para cada tipo de plantilla (TERCEROS, RP, OP, CONTABILIDAD, SIAFE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portal_plantillas_cargue (
  id SERIAL PRIMARY KEY,
  tipo_documento VARCHAR(50) NOT NULL UNIQUE,
  nombre_amigable VARCHAR(100) NOT NULL,
  descripcion TEXT,
  
  -- Estructura de columnas
  columnas_requeridas JSONB NOT NULL DEFAULT '[]'::jsonb,
  columnas_por_rol JSONB NOT NULL DEFAULT '[]'::jsonb,
  validaciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Orden en el flujo
  orden_secuencia INTEGER NOT NULL,
  rol_creador VARCHAR(50),
  rol_completador VARCHAR(50),
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  
  -- Validaciones
  CONSTRAINT validar_tipo_documento CHECK (tipo_documento IN ('terceros', 'rp', 'op', 'contabilidad', 'siafe')),
  CONSTRAINT validar_orden_secuencia CHECK (orden_secuencia > 0 AND orden_secuencia <= 5)
);

CREATE INDEX idx_plantillas_tipo ON public.portal_plantillas_cargue(tipo_documento);
CREATE INDEX idx_plantillas_orden ON public.portal_plantillas_cargue(orden_secuencia);

-- ============================================================================
-- 2. TABLA: portal_documentos_cargue
-- Histórico y control de documentos generados
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portal_documentos_cargue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convocatoria_id INTEGER NOT NULL REFERENCES public.portal_convocatorias(id) ON DELETE CASCADE,
  tipo_documento VARCHAR(50) NOT NULL,
  
  -- Estado del documento en el flujo
  estado VARCHAR(50) NOT NULL DEFAULT 'borrador',
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Datos del archivo
  archivo_generado BYTEA,
  archivo_url VARCHAR(500),
  cantidad_registros INTEGER DEFAULT 0,
  
  -- Información de creación
  creado_por UUID NOT NULL REFERENCES auth.users(id),
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  
  -- Información de edición
  editado_por UUID REFERENCES auth.users(id),
  editado_en TIMESTAMP WITH TIME ZONE,
  
  -- Información de aprobación
  aprobado_por UUID REFERENCES auth.users(id),
  aprobado_en TIMESTAMP WITH TIME ZONE,
  comentarios_rechazo TEXT,
  
  -- Auditoría y tracking
  columnas_completadas JSONB DEFAULT '[]'::jsonb,
  cambios_realizados JSONB DEFAULT '[]'::jsonb,
  
  -- Validaciones
  CONSTRAINT validar_estado CHECK (
    estado IN ('borrador', 'enviado_para_revision', 'aprobado', 'rechazado', 'finalizado')
  ),
  CONSTRAINT validar_tipo CHECK (
    tipo_documento IN ('terceros', 'rp', 'op', 'contabilidad', 'siafe')
  ),
  CONSTRAINT version_positiva CHECK (version > 0)
);

CREATE INDEX idx_documentos_convocatoria ON public.portal_documentos_cargue(convocatoria_id);
CREATE INDEX idx_documentos_tipo ON public.portal_documentos_cargue(tipo_documento);
CREATE INDEX idx_documentos_estado ON public.portal_documentos_cargue(estado);
CREATE INDEX idx_documentos_creado_por ON public.portal_documentos_cargue(creado_por);
CREATE INDEX idx_documentos_creado_en ON public.portal_documentos_cargue(creado_en);

-- ============================================================================
-- 3. TABLA: portal_transiciones_documento
-- Bitácora de cambios de estado y auditoría
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portal_transiciones_documento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  
  -- Estados
  estado_anterior VARCHAR(50),
  estado_nuevo VARCHAR(50) NOT NULL,
  
  -- Información del cambio
  rol_quien_transiciona VARCHAR(50) NOT NULL,
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  fecha TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  
  -- Detalles
  comentario TEXT,
  datos_cambio JSONB,
  
  -- Validación
  CONSTRAINT estado_nuevo_valido CHECK (
    estado_nuevo IN ('borrador', 'enviado_para_revision', 'aprobado', 'rechazado', 'finalizado')
  )
);

CREATE INDEX idx_transiciones_documento ON public.portal_transiciones_documento(documento_id);
CREATE INDEX idx_transiciones_usuario ON public.portal_transiciones_documento(usuario_id);
CREATE INDEX idx_transiciones_fecha ON public.portal_transiciones_documento(fecha);
CREATE INDEX idx_transiciones_estado_nuevo ON public.portal_transiciones_documento(estado_nuevo);

-- ============================================================================
-- 4. TABLA: portal_cargue_beneficiarios_terceros
-- Mapeo de beneficiarios a documentos de terceros (para referencias)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portal_cargue_beneficiarios_terceros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_cargue_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  beneficiario_id UUID NOT NULL REFERENCES public.portal_beneficiarios(id) ON DELETE CASCADE,
  
  -- Identificación en el documento
  numero_identificacion VARCHAR(15) NOT NULL,
  fila_numero INTEGER,
  
  -- Tracking
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  
  CONSTRAINT num_identificacion_valido CHECK (numero_identificacion ~ '^\d{1,15}$')
);

CREATE INDEX idx_cargue_beneficiarios_documento ON public.portal_cargue_beneficiarios_terceros(documento_cargue_id);
CREATE INDEX idx_cargue_beneficiarios_beneficiario ON public.portal_cargue_beneficiarios_terceros(beneficiario_id);
CREATE INDEX idx_cargue_beneficiarios_id ON public.portal_cargue_beneficiarios_terceros(numero_identificacion);

-- ============================================================================
-- 5. TABLA: portal_valores_cargue
-- Tracking de valores por documento (para auditoría de pagos)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portal_valores_cargue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  
  -- Información del beneficiario
  identificacion VARCHAR(15) NOT NULL,
  nombre_beneficiario VARCHAR(200),
  
  -- Valores
  valor_bruto NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_deducciones NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_neto NUMERIC(15, 2) NOT NULL DEFAULT 0,
  
  -- Referencias
  numero_rp VARCHAR(30),
  numero_op VARCHAR(30),
  numero_egreso VARCHAR(30),
  
  -- Tracking
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  
  CONSTRAINT valores_positivos CHECK (valor_bruto >= 0 AND valor_deducciones >= 0)
);

CREATE INDEX idx_valores_documento ON public.portal_valores_cargue(documento_id);
CREATE INDEX idx_valores_identificacion ON public.portal_valores_cargue(identificacion);
CREATE INDEX idx_valores_op ON public.portal_valores_cargue(numero_op);

-- ============================================================================
-- 6. TABLA: portal_cargue_validaciones
-- Registro de errores de validación por documento
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portal_cargue_validaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  
  -- Error
  tipo_error VARCHAR(100) NOT NULL,
  mensaje_error TEXT NOT NULL,
  
  -- Ubicación
  fila_numero INTEGER,
  columna_nombre VARCHAR(100),
  valor_problematico TEXT,
  
  -- Tracking
  detectado_en TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  resuelta BOOLEAN DEFAULT FALSE,
  resuelta_en TIMESTAMP WITH TIME ZONE,
  
  -- Validaciones
  CONSTRAINT tipo_error_valido CHECK (
    tipo_error IN ('validacion_formato', 'validacion_rango', 'validacion_referencia', 'validacion_duplicado', 'validacion_tipo_dato', 'error_sistema')
  )
);

CREATE INDEX idx_validaciones_documento ON public.portal_cargue_validaciones(documento_id);
CREATE INDEX idx_validaciones_tipo ON public.portal_cargue_validaciones(tipo_error);
CREATE INDEX idx_validaciones_resuelta ON public.portal_cargue_validaciones(resuelta);

-- ============================================================================
-- 7. Insertar plantillas iniciales
-- ============================================================================

INSERT INTO public.portal_plantillas_cargue (
  tipo_documento,
  nombre_amigable,
  descripcion,
  orden_secuencia,
  rol_creador,
  rol_completador,
  columnas_requeridas,
  columnas_por_rol,
  validaciones
) VALUES
(
  'terceros',
  'Cargue Masivo de Terceros',
  'Archivo para registro de información de beneficiarios (terceros)',
  1,
  'admin_educacion',
  'admin_presupuesto',
  '["cc_nit", "nombre_razon_social", "primer_apellido", "segundo_apellido", "primer_nombre", "segundo_nombre", "tipo_identificacion", "email", "telefono", "direccion", "tipo_cuenta", "banco", "cuenta", "codigo_cargo", "codigo_dependencia", "digito_verificador", "tipo_tercero", "naturaleza", "regimen", "pais", "departamento", "ciudad"]'::jsonb,
  '[{"rol": "admin_educacion", "columnas": ["cc_nit", "nombre_razon_social", "primer_apellido", "segundo_apellido", "primer_nombre", "segundo_nombre", "tipo_identificacion", "email", "telefono", "direccion", "tipo_cuenta", "banco", "cuenta"]}, {"rol": "admin_presupuesto", "columnas": ["codigo_cargo", "codigo_dependencia", "digito_verificador"]}]'::jsonb,
  '[{"campo": "cc_nit", "tipo": "numerico", "max": 15}, {"campo": "email", "tipo": "email"}, {"campo": "digito_verificador", "tipo": "numerico"}]'::jsonb
),
(
  'rp',
  'Cargue Masivo de Registro Presupuestal',
  'Archivo para registro presupuestal de pago a beneficiarios',
  2,
  'admin_educacion',
  'admin_presupuesto',
  '["no_rp", "subconsecutivo", "descripcion", "fecha", "no_cdp", "subconsecutivo_cdp", "tercero_presupuestal", "origen_legal_apropiacion", "proyecto", "entidad", "rubro_presupuestal", "fuente_financiacion", "valor", "liquidacion", "contrato", "firma_mecanica"]'::jsonb,
  '[{"rol": "admin_educacion", "columnas": ["tercero_presupuestal", "origen_legal_apropiacion", "proyecto", "entidad", "rubro_presupuestal", "valor", "liquidacion", "firma_mecanica"]}, {"rol": "admin_presupuesto", "columnas": ["no_rp", "subconsecutivo", "descripcion", "fecha", "no_cdp", "subconsecutivo_cdp", "fuente_financiacion", "contrato"]}]'::jsonb,
  '[{"campo": "no_rp", "tipo": "numerico", "max": 10}, {"campo": "valor", "tipo": "numerico", "decimales": 2}]'::jsonb
),
(
  'op',
  'Cargue Masivo de Órdenes de Pago',
  'Archivo para generación de órdenes de pago',
  3,
  'admin_contabilidad',
  'admin_contabilidad',
  '["no_op", "subconsecutivo", "fecha", "descripcion", "no_rp", "subconsecutivo_rp", "codigo_entidad", "rubro_presupuestal", "fuente_financiacion", "valor", "estado", "clase"]'::jsonb,
  '[{"rol": "admin_contabilidad", "columnas": ["no_op", "subconsecutivo", "fecha", "descripcion", "no_rp", "subconsecutivo_rp", "codigo_entidad", "rubro_presupuestal", "fuente_financiacion", "valor", "estado", "clase"]}]'::jsonb,
  '[{"campo": "no_op", "tipo": "texto"}, {"campo": "valor", "tipo": "numerico", "decimales": 2}]'::jsonb
),
(
  'contabilidad',
  'Cargue Masivo de Contabilización',
  'Archivo para contabilización y registro de obligaciones',
  4,
  'admin_contabilidad',
  'admin_contabilidad',
  '["tipo", "no_obligacion", "subconsecutivo", "clase", "codigo_entidad", "rubro_presupuestal", "fuente_financiacion", "cuenta_debito", "cuenta_credito"]'::jsonb,
  '[{"rol": "admin_contabilidad", "columnas": ["tipo", "no_obligacion", "subconsecutivo", "clase", "codigo_entidad", "rubro_presupuestal", "fuente_financiacion", "cuenta_debito", "cuenta_credito"]}]'::jsonb,
  '[{"campo": "tipo", "tipo": "enum", "valores": ["OP"]}, {"campo": "cuenta_debito", "tipo": "texto", "max": 30}]'::jsonb
),
(
  'siafe',
  'Reporte de Pagos SIAFE',
  'Archivo del banco con confirmación de pagos realizados',
  5,
  'admin_pagos',
  'admin_pagos',
  '["no_egreso", "fecha", "fecha_creacion", "descripcion", "identificacion", "beneficiario", "no_cuenta_beneficiario", "no_cuenta", "cuenta_bancaria", "cod_entidad_bancaria", "entidad_bancaria", "no_cheque", "total_obligaciones", "total_deducciones_obl", "valor_egreso", "valor_deducciones", "valor_neto", "estado"]'::jsonb,
  '[{"rol": "admin_pagos", "columnas": ["no_egreso", "fecha", "fecha_creacion", "descripcion", "identificacion", "beneficiario", "no_cuenta_beneficiario", "no_cuenta", "cuenta_bancaria", "cod_entidad_bancaria", "entidad_bancaria", "no_cheque", "total_obligaciones", "total_deducciones_obl", "valor_egreso", "valor_deducciones", "valor_neto", "estado"]}]'::jsonb,
  '[{"campo": "no_egreso", "tipo": "texto"}, {"campo": "valor_egreso", "tipo": "numerico", "decimales": 2}]'::jsonb
)
ON CONFLICT (tipo_documento) DO NOTHING;

-- ============================================================================
-- 8. Comentarios de tablas
-- ============================================================================

COMMENT ON TABLE public.portal_plantillas_cargue IS 'Metadatos de plantillas de cargue masivo (TERCEROS, RP, OP, CONTABILIDAD, SIAFE)';
COMMENT ON TABLE public.portal_documentos_cargue IS 'Documentos generados en flujo de cargue masivo - tracking de estado y versiones';
COMMENT ON TABLE public.portal_transiciones_documento IS 'Bitácora de cambios de estado en documentos de cargue';
COMMENT ON TABLE public.portal_cargue_beneficiarios_terceros IS 'Relación entre beneficiarios y documentos de terceros para auditoría';
COMMENT ON TABLE public.portal_valores_cargue IS 'Tracking de valores por documento para auditoría de pagos';
COMMENT ON TABLE public.portal_cargue_validaciones IS 'Registro de errores de validación detectados en documentos';

-- ============================================================================
-- FIN DE MIGRACIÓN
-- ============================================================================
