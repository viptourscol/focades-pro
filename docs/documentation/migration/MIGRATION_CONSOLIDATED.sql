-- ============================================================================
-- CONSOLIDATED MIGRATION: Cargue Masivo - Sistema Completo
-- DATE: 2026-10-12
-- INSTRUCTIONS: Copiar y pegar en Supabase SQL Editor
-- https://supabase.com/dashboard/project/[YOUR_PROJECT]/sql/new
-- ============================================================================

-- PARTE 1: TABLAS BASE
-- ============================================================================
\echo 'Creando tablas base...'

CREATE TABLE IF NOT EXISTS public.portal_plantillas_cargue (
  id SERIAL PRIMARY KEY,
  tipo_documento VARCHAR(50) NOT NULL UNIQUE,
  nombre_amigable VARCHAR(100) NOT NULL,
  descripcion TEXT,
  columnas_requeridas JSONB NOT NULL DEFAULT '[]'::jsonb,
  columnas_por_rol JSONB NOT NULL DEFAULT '[]'::jsonb,
  validaciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  orden_secuencia INTEGER NOT NULL,
  rol_creador VARCHAR(50),
  rol_completador VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT validar_tipo_documento CHECK (tipo_documento IN ('terceros', 'rp', 'op', 'contabilidad', 'siafe')),
  CONSTRAINT validar_orden_secuencia CHECK (orden_secuencia > 0 AND orden_secuencia <= 5)
);

CREATE TABLE IF NOT EXISTS public.portal_documentos_cargue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convocatoria_id INTEGER NOT NULL REFERENCES public.portal_convocatorias(id) ON DELETE CASCADE,
  tipo_documento VARCHAR(50) NOT NULL,
  estado VARCHAR(50) NOT NULL DEFAULT 'borrador',
  version INTEGER NOT NULL DEFAULT 1,
  archivo_generado BYTEA,
  archivo_url VARCHAR(500),
  cantidad_registros INTEGER DEFAULT 0,
  creado_por UUID NOT NULL REFERENCES auth.users(id),
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  editado_por UUID REFERENCES auth.users(id),
  editado_en TIMESTAMP WITH TIME ZONE,
  aprobado_por UUID REFERENCES auth.users(id),
  aprobado_en TIMESTAMP WITH TIME ZONE,
  comentarios_rechazo TEXT,
  columnas_completadas JSONB DEFAULT '[]'::jsonb,
  cambios_realizados JSONB DEFAULT '[]'::jsonb,
  CONSTRAINT validar_estado CHECK (estado IN ('borrador', 'enviado_para_revision', 'aprobado', 'rechazado', 'finalizado')),
  CONSTRAINT validar_tipo CHECK (tipo_documento IN ('terceros', 'rp', 'op', 'contabilidad', 'siafe')),
  CONSTRAINT version_positiva CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS public.portal_transiciones_documento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  estado_anterior VARCHAR(50),
  estado_nuevo VARCHAR(50) NOT NULL,
  rol_quien_transiciona VARCHAR(50) NOT NULL,
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  fecha TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  comentario TEXT,
  datos_cambio JSONB,
  CONSTRAINT estado_nuevo_valido CHECK (estado_nuevo IN ('borrador', 'enviado_para_revision', 'aprobado', 'rechazado', 'finalizado'))
);

CREATE TABLE IF NOT EXISTS public.portal_cargue_beneficiarios_terceros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_cargue_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  beneficiario_id UUID NOT NULL REFERENCES public.portal_beneficiarios(id) ON DELETE CASCADE,
  numero_identificacion VARCHAR(15) NOT NULL,
  fila_numero INTEGER,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT num_identificacion_valido CHECK (numero_identificacion ~ '^\d{1,15}$')
);

CREATE TABLE IF NOT EXISTS public.portal_valores_cargue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  identificacion VARCHAR(15) NOT NULL,
  nombre_beneficiario VARCHAR(200),
  valor_bruto NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_deducciones NUMERIC(15, 2) NOT NULL DEFAULT 0,
  valor_neto NUMERIC(15, 2) NOT NULL DEFAULT 0,
  numero_rp VARCHAR(30),
  numero_op VARCHAR(30),
  numero_egreso VARCHAR(30),
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT valores_positivos CHECK (valor_bruto >= 0 AND valor_deducciones >= 0)
);

CREATE TABLE IF NOT EXISTS public.portal_cargue_validaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  tipo_error VARCHAR(100) NOT NULL,
  mensaje_error TEXT NOT NULL,
  fila_numero INTEGER,
  columna_nombre VARCHAR(100),
  valor_problematico TEXT,
  detectado_en TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  resuelta BOOLEAN DEFAULT FALSE,
  resuelta_en TIMESTAMP WITH TIME ZONE,
  CONSTRAINT tipo_error_valido CHECK (tipo_error IN ('validacion_formato', 'validacion_rango', 'validacion_referencia', 'validacion_duplicado', 'validacion_tipo_dato', 'error_sistema'))
);

-- CREAR ÍNDICES
CREATE INDEX idx_plantillas_tipo ON public.portal_plantillas_cargue(tipo_documento);
CREATE INDEX idx_plantillas_orden ON public.portal_plantillas_cargue(orden_secuencia);
CREATE INDEX idx_documentos_convocatoria ON public.portal_documentos_cargue(convocatoria_id);
CREATE INDEX idx_documentos_tipo ON public.portal_documentos_cargue(tipo_documento);
CREATE INDEX idx_documentos_estado ON public.portal_documentos_cargue(estado);
CREATE INDEX idx_documentos_creado_por ON public.portal_documentos_cargue(creado_por);
CREATE INDEX idx_documentos_creado_en ON public.portal_documentos_cargue(creado_en);
CREATE INDEX idx_documentos_convocatoria_tipo_estado ON public.portal_documentos_cargue(convocatoria_id, tipo_documento, estado);
CREATE INDEX idx_documentos_creado_por_tipo ON public.portal_documentos_cargue(creado_por, tipo_documento);
CREATE INDEX idx_transiciones_documento ON public.portal_transiciones_documento(documento_id);
CREATE INDEX idx_transiciones_usuario ON public.portal_transiciones_documento(usuario_id);
CREATE INDEX idx_transiciones_fecha ON public.portal_transiciones_documento(fecha);
CREATE INDEX idx_transiciones_estado_nuevo ON public.portal_transiciones_documento(estado_nuevo);
CREATE INDEX idx_transiciones_documento_fecha ON public.portal_transiciones_documento(documento_id, fecha DESC);
CREATE INDEX idx_cargue_beneficiarios_documento ON public.portal_cargue_beneficiarios_terceros(documento_cargue_id);
CREATE INDEX idx_cargue_beneficiarios_beneficiario ON public.portal_cargue_beneficiarios_terceros(beneficiario_id);
CREATE INDEX idx_cargue_beneficiarios_id ON public.portal_cargue_beneficiarios_terceros(numero_identificacion);
CREATE INDEX idx_valores_documento ON public.portal_valores_cargue(documento_id);
CREATE INDEX idx_valores_identificacion ON public.portal_valores_cargue(identificacion);
CREATE INDEX idx_valores_op ON public.portal_valores_cargue(numero_op);
CREATE INDEX idx_validaciones_documento ON public.portal_cargue_validaciones(documento_id);
CREATE INDEX idx_validaciones_tipo ON public.portal_cargue_validaciones(tipo_error);
CREATE INDEX idx_validaciones_sin_resolver ON public.portal_cargue_validaciones(documento_id) WHERE resuelta = FALSE;

-- INSERTAR PLANTILLAS INICIALES
INSERT INTO public.portal_plantillas_cargue (
  tipo_documento, nombre_amigable, descripcion, orden_secuencia, rol_creador, rol_completador,
  columnas_requeridas, columnas_por_rol, validaciones
) VALUES
('terceros', 'Cargue Masivo de Terceros', 'Archivo para registro de información de beneficiarios (terceros)', 1, 'admin_educacion', 'admin_presupuesto',
 '["cc_nit", "nombre_razon_social", "primer_apellido", "segundo_apellido", "primer_nombre", "segundo_nombre", "tipo_identificacion", "email", "telefono", "direccion", "tipo_cuenta", "banco", "cuenta", "codigo_cargo", "codigo_dependencia", "digito_verificador", "tipo_tercero", "naturaleza", "regimen", "pais", "departamento", "ciudad"]'::jsonb,
 '[{"rol": "admin_educacion", "columnas": ["cc_nit", "nombre_razon_social", "primer_apellido", "segundo_apellido", "primer_nombre", "segundo_nombre", "tipo_identificacion", "email", "telefono", "direccion", "tipo_cuenta", "banco", "cuenta"]}, {"rol": "admin_presupuesto", "columnas": ["codigo_cargo", "codigo_dependencia", "digito_verificador"]}]'::jsonb,
 '[{"campo": "cc_nit", "tipo": "numerico", "max": 15}, {"campo": "email", "tipo": "email"}, {"campo": "digito_verificador", "tipo": "numerico"}]'::jsonb),
('rp', 'Cargue Masivo de Registro Presupuestal', 'Archivo para registro presupuestal de pago a beneficiarios', 2, 'admin_educacion', 'admin_presupuesto',
 '["no_rp", "subconsecutivo", "descripcion", "fecha", "no_cdp", "subconsecutivo_cdp", "tercero_presupuestal", "origen_legal_apropiacion", "proyecto", "entidad", "rubro_presupuestal", "fuente_financiacion", "valor", "liquidacion", "contrato", "firma_mecanica"]'::jsonb,
 '[{"rol": "admin_educacion", "columnas": ["tercero_presupuestal", "origen_legal_apropiacion", "proyecto", "entidad", "rubro_presupuestal", "valor", "liquidacion", "firma_mecanica"]}, {"rol": "admin_presupuesto", "columnas": ["no_rp", "subconsecutivo", "descripcion", "fecha", "no_cdp", "subconsecutivo_cdp", "fuente_financiacion", "contrato"]}]'::jsonb,
 '[{"campo": "no_rp", "tipo": "numerico", "max": 10}, {"campo": "valor", "tipo": "numerico", "decimales": 2}]'::jsonb),
('op', 'Cargue Masivo de Órdenes de Pago', 'Archivo para generación de órdenes de pago', 3, 'admin_contabilidad', 'admin_contabilidad',
 '["no_op", "subconsecutivo", "fecha", "descripcion", "no_rp", "subconsecutivo_rp", "codigo_entidad", "rubro_presupuestal", "fuente_financiacion", "valor", "estado", "clase"]'::jsonb,
 '[{"rol": "admin_contabilidad", "columnas": ["no_op", "subconsecutivo", "fecha", "descripcion", "no_rp", "subconsecutivo_rp", "codigo_entidad", "rubro_presupuestal", "fuente_financiacion", "valor", "estado", "clase"]}]'::jsonb,
 '[{"campo": "no_op", "tipo": "texto"}, {"campo": "valor", "tipo": "numerico", "decimales": 2}]'::jsonb),
('contabilidad', 'Cargue Masivo de Contabilización', 'Archivo para contabilización y registro de obligaciones', 4, 'admin_contabilidad', 'admin_contabilidad',
 '["tipo", "no_obligacion", "subconsecutivo", "clase", "codigo_entidad", "rubro_presupuestal", "fuente_financiacion", "cuenta_debito", "cuenta_credito"]'::jsonb,
 '[{"rol": "admin_contabilidad", "columnas": ["tipo", "no_obligacion", "subconsecutivo", "clase", "codigo_entidad", "rubro_presupuestal", "fuente_financiacion", "cuenta_debito", "cuenta_credito"]}]'::jsonb,
 '[{"campo": "tipo", "tipo": "enum", "valores": ["OP"]}, {"campo": "cuenta_debito", "tipo": "texto", "max": 30}]'::jsonb),
('siafe', 'Reporte de Pagos SIAFE', 'Archivo del banco con confirmación de pagos realizados', 5, 'admin_pagos', 'admin_pagos',
 '["no_egreso", "fecha", "fecha_creacion", "descripcion", "identificacion", "beneficiario", "no_cuenta_beneficiario", "no_cuenta", "cuenta_bancaria", "cod_entidad_bancaria", "entidad_bancaria", "no_cheque", "total_obligaciones", "total_deducciones_obl", "valor_egreso", "valor_deducciones", "valor_neto", "estado"]'::jsonb,
 '[{"rol": "admin_pagos", "columnas": ["no_egreso", "fecha", "fecha_creacion", "descripcion", "identificacion", "beneficiario", "no_cuenta_beneficiario", "no_cuenta", "cuenta_bancaria", "cod_entidad_bancaria", "entidad_bancaria", "no_cheque", "total_obligaciones", "total_deducciones_obl", "valor_egreso", "valor_deducciones", "valor_neto", "estado"]}]'::jsonb,
 '[{"campo": "no_egreso", "tipo": "texto"}, {"campo": "valor_egreso", "tipo": "numerico", "decimales": 2}]'::jsonb)
ON CONFLICT (tipo_documento) DO NOTHING;

-- ============================================================================
-- PARTE 2: ROW LEVEL SECURITY (RLS)
-- ============================================================================
\echo 'Habilitando RLS...'

ALTER TABLE public.portal_documentos_cargue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_transiciones_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_cargue_beneficiarios_terceros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_valores_cargue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_cargue_validaciones ENABLE ROW LEVEL SECURITY;

-- Políticas para documentos_cargue
CREATE POLICY "admin_educacion_all_documents" ON public.portal_documentos_cargue FOR ALL TO authenticated
USING (auth.users.user_metadata->>'role' = 'admin_educacion') WITH CHECK (auth.users.user_metadata->>'role' = 'admin_educacion');

CREATE POLICY "admin_presupuesto_terceros_rp" ON public.portal_documentos_cargue FOR SELECT TO authenticated
USING (tipo_documento IN ('terceros', 'rp') AND auth.users.user_metadata->>'role' = 'admin_presupuesto');

CREATE POLICY "admin_presupuesto_edit_terceros_rp" ON public.portal_documentos_cargue FOR UPDATE TO authenticated
USING (tipo_documento IN ('terceros', 'rp') AND estado IN ('borrador', 'enviado_para_revision') AND auth.users.user_metadata->>'role' = 'admin_presupuesto')
WITH CHECK (tipo_documento IN ('terceros', 'rp') AND auth.users.user_metadata->>'role' = 'admin_presupuesto');

CREATE POLICY "admin_contabilidad_op_contabilidad" ON public.portal_documentos_cargue FOR SELECT TO authenticated
USING (tipo_documento IN ('op', 'contabilidad') AND auth.users.user_metadata->>'role' = 'admin_contabilidad');

CREATE POLICY "admin_contabilidad_edit_op_contabilidad" ON public.portal_documentos_cargue FOR UPDATE TO authenticated
USING (tipo_documento IN ('op', 'contabilidad') AND estado IN ('borrador', 'enviado_para_revision') AND auth.users.user_metadata->>'role' = 'admin_contabilidad')
WITH CHECK (tipo_documento IN ('op', 'contabilidad') AND auth.users.user_metadata->>'role' = 'admin_contabilidad');

CREATE POLICY "admin_pagos_view_all" ON public.portal_documentos_cargue FOR SELECT TO authenticated
USING (auth.users.user_metadata->>'role' = 'admin_pagos');

CREATE POLICY "admin_pagos_edit_siafe" ON public.portal_documentos_cargue FOR UPDATE TO authenticated
USING (tipo_documento = 'siafe' AND estado IN ('borrador', 'enviado_para_revision') AND auth.users.user_metadata->>'role' = 'admin_pagos')
WITH CHECK (tipo_documento = 'siafe' AND auth.users.user_metadata->>'role' = 'admin_pagos');

CREATE POLICY "admin_visualizacion_read_only" ON public.portal_documentos_cargue FOR SELECT TO authenticated
USING (auth.users.user_metadata->>'role' = 'admin_visualizacion');

-- Políticas para transiciones
CREATE POLICY "transiciones_read" ON public.portal_transiciones_documento FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "transiciones_insert" ON public.portal_transiciones_documento FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());

-- Políticas para beneficiarios_terceros
CREATE POLICY "beneficiarios_terceros_read" ON public.portal_cargue_beneficiarios_terceros FOR SELECT TO authenticated USING (TRUE);

-- Políticas para valores
CREATE POLICY "valores_cargue_read" ON public.portal_valores_cargue FOR SELECT TO authenticated USING (TRUE);

-- Políticas para validaciones
CREATE POLICY "validaciones_read" ON public.portal_cargue_validaciones FOR SELECT TO authenticated USING (TRUE);

-- Grants
GRANT SELECT ON public.portal_plantillas_cargue TO authenticated;

-- ============================================================================
-- PARTE 3: FUNCIONES Y TRIGGERS
-- ============================================================================
\echo 'Creando funciones...'

CREATE OR REPLACE FUNCTION public.fn_registrar_transicion_documento(
  p_documento_id UUID, p_estado_nuevo VARCHAR(50), p_rol VARCHAR(50), 
  p_comentario TEXT DEFAULT NULL, p_datos_cambio JSONB DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_estado_anterior VARCHAR(50); v_transicion_id UUID;
BEGIN
  SELECT estado INTO v_estado_anterior FROM public.portal_documentos_cargue WHERE id = p_documento_id;
  INSERT INTO public.portal_transiciones_documento (documento_id, estado_anterior, estado_nuevo, rol_quien_transiciona, usuario_id, comentario, datos_cambio)
  VALUES (p_documento_id, v_estado_anterior, p_estado_nuevo, p_rol, auth.uid(), p_comentario, p_datos_cambio)
  RETURNING id INTO v_transicion_id;
  UPDATE public.portal_documentos_cargue SET estado = p_estado_nuevo, editado_por = auth.uid(), editado_en = TIMEZONE('utc'::text, NOW()) WHERE id = p_documento_id;
  RETURN v_transicion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_crear_documento_cargue(p_convocatoria_id INTEGER, p_tipo_documento VARCHAR(50), p_cantidad_registros INTEGER DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_documento_id UUID;
BEGIN
  INSERT INTO public.portal_documentos_cargue (convocatoria_id, tipo_documento, estado, cantidad_registros, creado_por)
  VALUES (p_convocatoria_id, p_tipo_documento, 'borrador', p_cantidad_registros, auth.uid())
  RETURNING id INTO v_documento_id;
  PERFORM public.fn_registrar_transicion_documento(v_documento_id, 'borrador', 'sistema', 'Documento creado');
  RETURN v_documento_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_actualizar_updated_at_plantillas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = TIMEZONE('utc'::text, NOW()); RETURN NEW; END; $$;

CREATE TRIGGER trg_plantillas_updated_at BEFORE UPDATE ON public.portal_plantillas_cargue FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_updated_at_plantillas();

-- ============================================================================
-- PARTE 4: VISTAS PARA DASHBOARDS
-- ============================================================================
\echo 'Creando vistas...'

CREATE OR REPLACE VIEW public.v_documentos_pendientes_aprobacion AS
SELECT d.id, d.convocatoria_id, d.tipo_documento, d.estado, d.version, d.cantidad_registros, d.creado_por, d.creado_en, d.editado_en,
  (SELECT COUNT(*) FROM public.portal_cargue_validaciones WHERE documento_id = d.id AND resuelta = FALSE) as errores_sin_resolver,
  COALESCE(SUM(v.valor_neto), 0) as valor_total
FROM public.portal_documentos_cargue d LEFT JOIN public.portal_valores_cargue v ON d.id = v.documento_id
WHERE d.estado = 'enviado_para_revision' GROUP BY d.id ORDER BY d.editado_en DESC;

CREATE OR REPLACE VIEW public.v_resumen_documentos_convocatoria AS
SELECT d.convocatoria_id, d.tipo_documento, d.estado, COUNT(*) as cantidad, COALESCE(SUM(v.valor_neto), 0) as valor_total,
  COUNT(DISTINCT d.creado_por) as usuarios_involucrados, MIN(d.creado_en) as primer_documento, MAX(d.editado_en) as ultima_actualizacion
FROM public.portal_documentos_cargue d LEFT JOIN public.portal_valores_cargue v ON d.id = v.documento_id
GROUP BY d.convocatoria_id, d.tipo_documento, d.estado;

GRANT SELECT ON public.v_documentos_pendientes_aprobacion TO authenticated;
GRANT SELECT ON public.v_resumen_documentos_convocatoria TO authenticated;

-- ============================================================================
-- FINALIZADO
-- ============================================================================
\echo '✅ Migraciones completadas con éxito!'
