-- =====================================================
-- Migración: Sistema de Documentación del Portal
-- Fecha: 2026-08-24
-- Descripción: Tablas para requisitos, guía y documentos descargables
-- =====================================================

-- Tabla: portal_requisitos_modalidad
-- Almacena requisitos organizados por modalidad (técnico, tecnólogo, profesional)
CREATE TABLE IF NOT EXISTS portal_requisitos_modalidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modalidad text NOT NULL CHECK (modalidad IN ('tecnico', 'tecnologo', 'profesional', 'general')),
  titulo text NOT NULL,
  descripcion text,
  orden integer DEFAULT 0,
  requisitos jsonb DEFAULT '[]'::jsonb,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_modalidad_titulo UNIQUE (modalidad, titulo)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_requisitos_modalidad ON portal_requisitos_modalidad(modalidad) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_requisitos_orden ON portal_requisitos_modalidad(orden);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_portal_requisitos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_requisitos_updated_at
  BEFORE UPDATE ON portal_requisitos_modalidad
  FOR EACH ROW
  EXECUTE FUNCTION update_portal_requisitos_updated_at();

-- =====================================================

-- Tabla: portal_guia_inscripcion
-- Pasos de la guía de inscripción con detalles y consejos
CREATE TABLE IF NOT EXISTS portal_guia_inscripcion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paso_numero integer NOT NULL,
  titulo text NOT NULL,
  descripcion text NOT NULL,
  icono text DEFAULT 'FileText',
  detalles text[] DEFAULT ARRAY[]::text[],
  imagen_url text,
  duracion_estimada text DEFAULT '5 minutos',
  consejos text[] DEFAULT ARRAY[]::text[],
  orden integer DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_paso_numero UNIQUE (paso_numero)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_guia_orden ON portal_guia_inscripcion(orden) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_guia_paso ON portal_guia_inscripcion(paso_numero);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_portal_guia_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_guia_updated_at
  BEFORE UPDATE ON portal_guia_inscripcion
  FOR EACH ROW
  EXECUTE FUNCTION update_portal_guia_updated_at();

-- =====================================================

-- Tabla: portal_documentos_descargables
-- Documentos PDF descargables con tracking
CREATE TABLE IF NOT EXISTS portal_documentos_descargables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('guia_inscripcion', 'requisitos', 'convocatoria', 'otros')),
  titulo text NOT NULL,
  descripcion text,
  archivo_url text NOT NULL,
  archivo_nombre text NOT NULL,
  tamanio_mb numeric(8,2),
  descargas integer DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON portal_documentos_descargables(tipo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_documentos_descargas ON portal_documentos_descargables(descargas DESC);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_portal_documentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_documentos_updated_at
  BEFORE UPDATE ON portal_documentos_descargables
  FOR EACH ROW
  EXECUTE FUNCTION update_portal_documentos_updated_at();

-- =====================================================
-- RLS (Row Level Security) Policies
-- =====================================================

-- Habilitar RLS
ALTER TABLE portal_requisitos_modalidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_guia_inscripcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_documentos_descargables ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública (sin autenticación)
CREATE POLICY "Requisitos son públicos"
  ON portal_requisitos_modalidad FOR SELECT
  USING (activo = true);

CREATE POLICY "Guía es pública"
  ON portal_guia_inscripcion FOR SELECT
  USING (activo = true);

CREATE POLICY "Documentos son públicos"
  ON portal_documentos_descargables FOR SELECT
  USING (activo = true);

-- Políticas de escritura solo para admins (requiere autenticación con role admin)
CREATE POLICY "Solo admins pueden modificar requisitos"
  ON portal_requisitos_modalidad FOR ALL
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Solo admins pueden modificar guía"
  ON portal_guia_inscripcion FOR ALL
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Solo admins pueden modificar documentos"
  ON portal_documentos_descargables FOR ALL
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- =====================================================
-- Datos iniciales (Seed Data)
-- =====================================================

-- Requisitos por modalidad
INSERT INTO portal_requisitos_modalidad (modalidad, titulo, descripcion, orden, requisitos) VALUES
('tecnico', 'Técnico Profesional', 'Requisitos para programas de formación técnica profesional', 1, 
  '[
    {"texto": "Documento de identidad vigente", "obligatorio": true, "nota": "Cédula de ciudadanía o tarjeta de identidad"},
    {"texto": "Acta de grado de bachillerato", "obligatorio": true, "nota": "Original o copia autenticada"},
    {"texto": "Certificado de notas del último semestre cursado", "obligatorio": true, "nota": "Expedido por la institución educativa"},
    {"texto": "Certificado de matrícula vigente", "obligatorio": true, "nota": "Del semestre actual"},
    {"texto": "Certificación SISBEN", "obligatorio": false, "nota": "Preferiblemente para priorización"}
  ]'::jsonb
),
('tecnologo', 'Tecnólogo', 'Requisitos para programas tecnológicos', 2,
  '[
    {"texto": "Documento de identidad vigente", "obligatorio": true, "nota": "Cédula de ciudadanía o tarjeta de identidad"},
    {"texto": "Acta de grado de bachillerato", "obligatorio": true, "nota": "Original o copia autenticada"},
    {"texto": "Diploma de bachiller", "obligatorio": true, "nota": "Original o copia autenticada"},
    {"texto": "Certificado de notas del último semestre cursado", "obligatorio": true, "nota": "Expedido por la institución educativa"},
    {"texto": "Certificado de matrícula vigente", "obligatorio": true, "nota": "Del semestre actual"},
    {"texto": "Resultados pruebas SABER 11", "obligatorio": false, "nota": "Opcional para programas que lo requieran"},
    {"texto": "Certificación SISBEN", "obligatorio": false, "nota": "Preferiblemente para priorización"}
  ]'::jsonb
),
('profesional', 'Profesional Universitario', 'Requisitos para programas profesionales universitarios', 3,
  '[
    {"texto": "Documento de identidad vigente", "obligatorio": true, "nota": "Cédula de ciudadanía o tarjeta de identidad"},
    {"texto": "Acta de grado de bachillerato", "obligatorio": true, "nota": "Original o copia autenticada"},
    {"texto": "Diploma de bachiller", "obligatorio": true, "nota": "Original o copia autenticada"},
    {"texto": "Resultados pruebas SABER 11", "obligatorio": true, "nota": "Puntaje mínimo según modalidad"},
    {"texto": "Certificado de notas del último semestre cursado", "obligatorio": true, "nota": "Expedido por la institución educativa"},
    {"texto": "Certificado de matrícula vigente", "obligatorio": true, "nota": "Del semestre actual"},
    {"texto": "Certificación SISBEN", "obligatorio": false, "nota": "Preferiblemente para priorización"},
    {"texto": "Certificado de enfoque diferencial", "obligatorio": false, "nota": "Si aplica (víctima, indígena, afrodescendiente, etc.)"}
  ]'::jsonb
),
('general', 'Requisitos Generales', 'Requisitos comunes a todas las modalidades', 0,
  '[
    {"texto": "Ser residente del municipio de Montelíbano", "obligatorio": true, "nota": "Certificado de residencia vigente"},
    {"texto": "No tener título profesional previo", "obligatorio": true, "nota": "Declaración juramentada"},
    {"texto": "Estar matriculado en institución de educación superior", "obligatorio": true, "nota": "Certificado de matrícula"},
    {"texto": "Mantener promedio académico mínimo", "obligatorio": true, "nota": "3.0 o superior según modalidad"},
    {"texto": "No tener sanciones disciplinarias", "obligatorio": true, "nota": "Certificado de la institución"}
  ]'::jsonb
)
ON CONFLICT (modalidad, titulo) DO NOTHING;

-- Guía de inscripción paso a paso
INSERT INTO portal_guia_inscripcion (paso_numero, titulo, descripcion, icono, duracion_estimada, detalles, consejos, orden) VALUES
(1, 'Verificación de correo electrónico', 'Ingresa tu correo electrónico y verifica tu identidad mediante código OTP', 'Mail', '2-3 minutos',
  ARRAY[
    'Ingresa un correo electrónico que revises frecuentemente',
    'Recibirás un código de verificación de 6 dígitos',
    'El código expira en 10 minutos',
    'Revisa la carpeta de spam si no llega en 2 minutos'
  ],
  ARRAY[
    'Guarda el código por si necesitas recargar la página',
    'Usa Gmail o correos institucionales para mejor entrega',
    'No uses correos temporales o desechables'
  ],
  1
),
(2, 'Datos personales básicos', 'Completa tu información personal, de contacto y residencia', 'User', '5-7 minutos',
  ARRAY[
    'Nombre completo según documento de identidad',
    'Tipo y número de documento',
    'Fecha y lugar de nacimiento',
    'Información de contacto (celular, dirección)',
    'Datos de residencia actual'
  ],
  ARRAY[
    'Ten a mano tu documento de identidad',
    'Verifica que los datos coincidan exactamente con tu cédula',
    'La dirección debe ser tu residencia actual en Montelíbano'
  ],
  2
),
(3, 'Información socioeconómica', 'Proporciona datos sobre tu situación económica y familiar', 'Home', '5-10 minutos',
  ARRAY[
    'Datos del padre y madre (nombre, documento, ocupación)',
    'Ingresos familiares mensuales',
    'Subsidios que recibes (Familias en Acción, Jóvenes en Acción)',
    'Grupo SISBEN al que perteneces',
    'Enfoque diferencial (víctima, indígena, afrodescendiente, etc.)'
  ],
  ARRAY[
    'Ten a mano documentos de tus padres si es posible',
    'Si no conoces los ingresos exactos, proporciona un estimado',
    'El enfoque diferencial mejora tu priorización'
  ],
  3
),
(4, 'Historial académico', 'Información sobre tu formación académica previa', 'GraduationCap', '3-5 minutos',
  ARRAY[
    'Título de bachiller obtenido',
    'Año de graduación',
    'Institución educativa donde te graduaste',
    'Puntaje de pruebas SABER 11 (si aplica)',
    'Promedio académico del colegio'
  ],
  ARRAY[
    'Ten a mano tu diploma o acta de grado',
    'Si no recuerdas el puntaje exacto del ICFES, búscalo en la página del ICFES',
    'El puntaje SABER 11 es obligatorio para modalidad profesional'
  ],
  4
),
(5, 'Información universitaria', 'Datos sobre tu programa de educación superior actual', 'School', '3-5 minutos',
  ARRAY[
    'Institución de educación superior',
    'Programa académico que cursas',
    'Nivel de formación (técnico, tecnólogo, profesional)',
    'Semestre de ingreso al programa',
    'Promedio del último semestre cursado',
    'Modalidad (presencial, virtual, distancia)'
  ],
  ARRAY[
    'Ten a mano tu certificado de matrícula',
    'El semestre de ingreso debe coincidir con tu certificado',
    'Si eres estudiante nuevo, indica el semestre actual'
  ],
  5
),
(6, 'Carga de documentos', 'Adjunta los documentos requeridos en formato PDF', 'FileUp', '10-15 minutos',
  ARRAY[
    'Documento de identidad (ambas caras)',
    'Acta de grado de bachillerato',
    'Diploma de bachiller (si aplica)',
    'Resultados SABER 11 (si aplica)',
    'Certificado de matrícula vigente',
    'Certificado de notas del último semestre',
    'Ficha SISBEN (opcional)',
    'Certificado de enfoque diferencial (si aplica)'
  ],
  ARRAY[
    'Los archivos deben estar en formato PDF',
    'Tamaño máximo: 10 MB por archivo',
    'Escanea documentos con buena calidad (legibles)',
    'No uses fotos borrosas o con sombras'
  ],
  6
),
(7, 'Firma digital y envío', 'Firma tu solicitud y envía el formulario completo', 'PenTool', '2-3 minutos',
  ARRAY[
    'Lee y acepta los términos y condiciones',
    'Acepta el tratamiento de datos personales',
    'Firma digitalmente usando el pad de firma',
    'Revisa el resumen de tu solicitud',
    'Haz clic en "Enviar inscripción"'
  ],
  ARRAY[
    'Revisa cuidadosamente todos los datos antes de enviar',
    'Una vez enviado, recibirás un número de radicado',
    'Guarda tu número de radicado para consultas futuras',
    'Recibirás confirmación por correo electrónico'
  ],
  7
)
ON CONFLICT (paso_numero) DO NOTHING;

-- Comentarios para documentación
COMMENT ON TABLE portal_requisitos_modalidad IS 'Requisitos organizados por modalidad de formación (técnico, tecnólogo, profesional)';
COMMENT ON TABLE portal_guia_inscripcion IS 'Pasos de la guía de inscripción con detalles y consejos para aspirantes';
COMMENT ON TABLE portal_documentos_descargables IS 'Documentos PDF descargables con tracking de descargas';

-- Finalización
DO $$
BEGIN
  RAISE NOTICE 'Migración completada: Sistema de documentación del portal creado exitosamente';
END $$;
