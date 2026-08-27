-- Sistema de puntaje configurable para inscripciones.
-- Las reglas viven en JSONB y se versionan: una inscripción guarda la versión
-- con la que fue calculada para que su puntaje nunca cambie retroactivamente.

CREATE TABLE IF NOT EXISTS public.portal_configuracion_puntaje (
  id             bigserial PRIMARY KEY,
  version        integer NOT NULL,
  reglas         jsonb NOT NULL,
  is_active      boolean NOT NULL DEFAULT false,
  nota           text,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version)
);

-- Solo una configuración activa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS ux_portal_config_puntaje_activa
  ON public.portal_configuracion_puntaje (is_active)
  WHERE is_active;

ALTER TABLE public.portal_configuracion_puntaje ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_config_puntaje_admin_all ON public.portal_configuracion_puntaje;
CREATE POLICY portal_config_puntaje_admin_all
  ON public.portal_configuracion_puntaje FOR ALL
  TO authenticated
  USING (public.is_portal_admin(auth.uid()))
  WITH CHECK (public.is_portal_admin(auth.uid()));

-- Trazabilidad del cálculo en cada inscripción.
ALTER TABLE public.inscripciones
  ADD COLUMN IF NOT EXISTS puntaje_detalle jsonb,
  ADD COLUMN IF NOT EXISTS puntaje_config_version integer;

COMMENT ON COLUMN public.inscripciones.puntaje_detalle IS
'Desglose por criterio del puntaje calculado. Formato: [{clave,label,valor,puntos,max}]';
COMMENT ON COLUMN public.inscripciones.puntaje_config_version IS
'Versión de portal_configuracion_puntaje usada al calcular puntaje_total.';

-- Configuración inicial (versión 1). Suma de máximos = 100.
INSERT INTO public.portal_configuracion_puntaje (version, reglas, is_active, nota)
VALUES (
  1,
  '{
    "criterios": [
      {
        "clave": "sisben",
        "label": "SISBEN",
        "campo": "sisben_grupo",
        "tipo": "exacto",
        "max": 20,
        "default_puntos": 0,
        "reglas": [
          { "valor": "Grupo A (Pobreza extrema)", "puntos": 20 },
          { "valor": "Grupo B (Pobreza moderada)", "puntos": 15 },
          { "valor": "Grupo C (Vulnerable)", "puntos": 8 },
          { "valor": "Grupo D (No pobre)", "puntos": 3 },
          { "valor": "No tengo SISBEN", "puntos": 0 }
        ]
      },
      {
        "clave": "ingresos_familiares",
        "label": "Ingresos familiares (padre + madre)",
        "campo": "__ingresos_familiares_smlv",
        "tipo": "rango",
        "max": 20,
        "default_puntos": 0,
        "reglas": [
          { "desde": 0,    "hasta": 0.49, "puntos": 20 },
          { "desde": 0.5,  "hasta": 0.99, "puntos": 17 },
          { "desde": 1,    "hasta": 2,    "puntos": 13 },
          { "desde": 2.01, "hasta": 3,    "puntos": 8 },
          { "desde": 3.01, "hasta": 99,   "puntos": 3 }
        ]
      },
      {
        "clave": "icfes",
        "label": "Puntaje ICFES",
        "campo": "puntaje_icfes",
        "tipo": "rango",
        "max": 20,
        "default_puntos": 0,
        "reglas": [
          { "desde": 0,   "hasta": 180, "puntos": 4 },
          { "desde": 181, "hasta": 280, "puntos": 10 },
          { "desde": 281, "hasta": 380, "puntos": 15 },
          { "desde": 381, "hasta": 500, "puntos": 20 }
        ]
      },
      {
        "clave": "enfoque_diferencial",
        "label": "Enfoque diferencial",
        "campo": "enfoque_diferencial",
        "tipo": "exacto",
        "max": 12,
        "default_puntos": 0,
        "reglas": [
          { "valor": "Víctima del Conflicto", "puntos": 12 },
          { "valor": "Población con Discapacidad", "puntos": 12 },
          { "valor": "Indígena", "puntos": 10 },
          { "valor": "Afrocolombiano", "puntos": 10 },
          { "valor": "Ninguno", "puntos": 0 }
        ]
      },
      {
        "clave": "zona_residencia",
        "label": "Zona de residencia",
        "campo": "zona_residencia",
        "tipo": "exacto",
        "max": 10,
        "default_puntos": 0,
        "reglas": [
          { "valor": "Zona Rural", "puntos": 10 },
          { "valor": "Zona Urbana", "puntos": 4 }
        ]
      },
      {
        "clave": "subsidio",
        "label": "No recibe otro subsidio",
        "campo": "recibe_subsidio",
        "tipo": "exacto",
        "max": 10,
        "default_puntos": 0,
        "reglas": [
          { "valor": "No", "puntos": 10 },
          { "valor": "Sí", "puntos": 0 }
        ]
      },
      {
        "clave": "semestre_ingreso",
        "label": "Semestre de ingreso",
        "campo": "semestre_ingreso",
        "tipo": "rango",
        "max": 8,
        "default_puntos": 0,
        "reglas": [
          { "desde": 1, "hasta": 1,  "puntos": 8 },
          { "desde": 2, "hasta": 3,  "puntos": 5 },
          { "desde": 4, "hasta": 6,  "puntos": 3 },
          { "desde": 7, "hasta": 20, "puntos": 1 }
        ]
      }
    ],
    "smlv_por_rango_ingreso": {
      "Sin ingresos": 0,
      "N/A (No aplica)": 0,
      "Menos de 1 SMLV": 0.5,
      "Entre 1 y 2 SMLV": 1.5,
      "Entre 2 y 3 SMLV": 2.5,
      "Más de 3 SMLV": 3.5
    }
  }'::jsonb,
  true,
  'Configuración inicial: 52 pts vulnerabilidad socioeconómica, 20 mérito académico, 12 enfoque diferencial, 16 focalización.'
)
ON CONFLICT (version) DO NOTHING;
