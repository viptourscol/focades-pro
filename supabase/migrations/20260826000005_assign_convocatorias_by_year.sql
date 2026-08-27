-- Asignación segura de convocatorias a beneficiarios según año_convocatoria
-- ============================================================================
-- ESTRATEGIA: Mapeo directo año_convocatoria → convocatoria_id
-- TOTAL BENEFICIARIOS A ACTUALIZAR: 383
-- ============================================================================

DO $$
DECLARE
  v_count_2026 INTEGER;
  v_count_2025 INTEGER;
  v_count_2024 INTEGER;
  v_count_2023 INTEGER;
  v_count_2022 INTEGER;
  v_count_2021 INTEGER;
  v_count_2020 INTEGER;
  v_total_updated INTEGER := 0;
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'INICIANDO ASIGNACIÓN DE CONVOCATORIAS A BENEFICIARIOS';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  
  -- ──────────────────────────────────────────────────────────────────────────
  -- AÑO 2026 → Convocatoria "2026-1"
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '▸ Asignando convocatoria "2026-1" a beneficiarios del año 2026...';
  
  UPDATE public.portal_beneficiarios
  SET convocatoria_id = '4c65db22-14c6-402e-817b-21c1bbbdd935' -- 2026-1
  WHERE año_convocatoria = 2026
    AND convocatoria_id IS NULL;
  
  GET DIAGNOSTICS v_count_2026 = ROW_COUNT;
  v_total_updated := v_total_updated + v_count_2026;
  RAISE NOTICE '  ✓ %s beneficiarios actualizados para 2026', v_count_2026;
  RAISE NOTICE '';
  
  -- ──────────────────────────────────────────────────────────────────────────
  -- AÑO 2025 → Convocatoria "2025"
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '▸ Asignando convocatoria "2025" a beneficiarios del año 2025...';
  
  UPDATE public.portal_beneficiarios
  SET convocatoria_id = 'f60fc27e-b7e3-4134-bed1-75f676982d08' -- 2025
  WHERE año_convocatoria = 2025
    AND convocatoria_id IS NULL;
  
  GET DIAGNOSTICS v_count_2025 = ROW_COUNT;
  v_total_updated := v_total_updated + v_count_2025;
  RAISE NOTICE '  ✓ %s beneficiarios actualizados para 2025', v_count_2025;
  RAISE NOTICE '';
  
  -- ──────────────────────────────────────────────────────────────────────────
  -- AÑO 2024 → Convocatoria "2024"
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '▸ Asignando convocatoria "2024" a beneficiarios del año 2024...';
  
  UPDATE public.portal_beneficiarios
  SET convocatoria_id = '31c610cf-94fb-41bd-ad66-32fd82fa5319' -- 2024
  WHERE año_convocatoria = 2024
    AND convocatoria_id IS NULL;
  
  GET DIAGNOSTICS v_count_2024 = ROW_COUNT;
  v_total_updated := v_total_updated + v_count_2024;
  RAISE NOTICE '  ✓ %s beneficiarios actualizados para 2024', v_count_2024;
  RAISE NOTICE '';
  
  -- ──────────────────────────────────────────────────────────────────────────
  -- AÑO 2023 → Convocatoria "2023"
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '▸ Asignando convocatoria "2023" a beneficiarios del año 2023...';
  
  UPDATE public.portal_beneficiarios
  SET convocatoria_id = 'caa22bd3-a8d5-42ce-88af-a6ee614d1f10' -- 2023
  WHERE año_convocatoria = 2023
    AND convocatoria_id IS NULL;
  
  GET DIAGNOSTICS v_count_2023 = ROW_COUNT;
  v_total_updated := v_total_updated + v_count_2023;
  RAISE NOTICE '  ✓ %s beneficiarios actualizados para 2023', v_count_2023;
  RAISE NOTICE '';
  
  -- ──────────────────────────────────────────────────────────────────────────
  -- AÑO 2022 → Convocatoria "2022"
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '▸ Asignando convocatoria "2022" a beneficiarios del año 2022...';
  
  UPDATE public.portal_beneficiarios
  SET convocatoria_id = 'c9f974fc-64d0-4a43-bbad-44456f0e2da7' -- 2022
  WHERE año_convocatoria = 2022
    AND convocatoria_id IS NULL;
  
  GET DIAGNOSTICS v_count_2022 = ROW_COUNT;
  v_total_updated := v_total_updated + v_count_2022;
  RAISE NOTICE '  ✓ %s beneficiarios actualizados para 2022', v_count_2022;
  RAISE NOTICE '';
  
  -- ──────────────────────────────────────────────────────────────────────────
  -- AÑO 2021 → Convocatoria "2021"
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '▸ Asignando convocatoria "2021" a beneficiarios del año 2021...';
  
  UPDATE public.portal_beneficiarios
  SET convocatoria_id = '1f2dc40c-69c5-4b5c-8b02-54ab5506f629' -- 2021
  WHERE año_convocatoria = 2021
    AND convocatoria_id IS NULL;
  
  GET DIAGNOSTICS v_count_2021 = ROW_COUNT;
  v_total_updated := v_total_updated + v_count_2021;
  RAISE NOTICE '  ✓ %s beneficiarios actualizados para 2021', v_count_2021;
  RAISE NOTICE '';
  
  -- ──────────────────────────────────────────────────────────────────────────
  -- AÑO 2020 → Convocatoria "2020"
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '▸ Asignando convocatoria "2020" a beneficiarios del año 2020...';
  
  UPDATE public.portal_beneficiarios
  SET convocatoria_id = 'e82c5077-f662-482a-822f-3856da33ded6' -- 2020
  WHERE año_convocatoria = 2020
    AND convocatoria_id IS NULL;
  
  GET DIAGNOSTICS v_count_2020 = ROW_COUNT;
  v_total_updated := v_total_updated + v_count_2020;
  RAISE NOTICE '  ✓ %s beneficiarios actualizados para 2020', v_count_2020;
  RAISE NOTICE '';
  
  -- ──────────────────────────────────────────────────────────────────────────
  -- RESUMEN FINAL
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'RESUMEN DE ASIGNACIÓN';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Total beneficiarios actualizados: %s', v_total_updated;
  RAISE NOTICE '';
  RAISE NOTICE 'Desglose por año:';
  RAISE NOTICE '  • 2026: %s beneficiarios → Convocatoria 2026-1', v_count_2026;
  RAISE NOTICE '  • 2025: %s beneficiarios → Convocatoria 2025', v_count_2025;
  RAISE NOTICE '  • 2024: %s beneficiarios → Convocatoria 2024', v_count_2024;
  RAISE NOTICE '  • 2023: %s beneficiarios → Convocatoria 2023', v_count_2023;
  RAISE NOTICE '  • 2022: %s beneficiarios → Convocatoria 2022', v_count_2022;
  RAISE NOTICE '  • 2021: %s beneficiarios → Convocatoria 2021', v_count_2021;
  RAISE NOTICE '  • 2020: %s beneficiarios → Convocatoria 2020', v_count_2020;
  RAISE NOTICE '============================================================================';
  
  -- Verificación final
  IF v_total_updated = 383 THEN
    RAISE NOTICE '✓ ÉXITO: Se actualizaron los 383 beneficiarios esperados';
  ELSE
    RAISE WARNING '⚠ ATENCIÓN: Se actualizaron %s de 383 beneficiarios esperados', v_total_updated;
  END IF;
  
  RAISE NOTICE '============================================================================';
  
END $$;

-- Crear índice para mejorar búsquedas por convocatoria
CREATE INDEX IF NOT EXISTS idx_portal_beneficiarios_convocatoria_id 
ON public.portal_beneficiarios(convocatoria_id) 
WHERE convocatoria_id IS NOT NULL;

-- Comentario final
COMMENT ON COLUMN public.portal_beneficiarios.convocatoria_id IS 
'ID de la convocatoria a la que pertenece el beneficiario. Asignado automáticamente según año_convocatoria.';
