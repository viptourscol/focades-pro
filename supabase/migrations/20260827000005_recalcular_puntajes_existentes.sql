-- Recalcula el puntaje de las inscripciones existentes con la configuración activa.
-- El puntaje anterior se calculaba solo con ICFES (icfes/500*100), que no reflejaba
-- los criterios socioeconómicos del programa.

DO $$
DECLARE
  v_afectadas integer;
BEGIN
  WITH recalculo AS (
    SELECT
      i.id,
      calcular_puntaje_inscripcion(i.datos_formulario) AS resultado
    FROM inscripciones i
    WHERE i.datos_formulario IS NOT NULL
  )
  UPDATE inscripciones i
  SET puntaje_total          = (r.resultado ->> 'total')::int,
      puntaje_detalle        = r.resultado -> 'detalle',
      puntaje_config_version = (r.resultado ->> 'version')::int
  FROM recalculo r
  WHERE i.id = r.id;

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  RAISE NOTICE 'Inscripciones recalculadas: %', v_afectadas;
END $$;
