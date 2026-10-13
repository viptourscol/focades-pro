-- Probar inserción con service_role (simular Edge Function)
-- Este script debe ejecutarse con service_role_key para simular Edge Function

DO $$
DECLARE
  test_beneficiario_id INTEGER := 2441;
  test_ticket_id UUID;
  test_mensaje_id UUID;
  beneficiario_email TEXT;
BEGIN
  -- 1. Obtener email del beneficiario
  SELECT email INTO beneficiario_email
  FROM public.portal_beneficiarios
  WHERE id = test_beneficiario_id;
  
  RAISE NOTICE 'Beneficiario email: %', beneficiario_email;
  
  -- 2. Crear ticket de prueba
  INSERT INTO public.soporte_tickets (
    ticket_codigo,
    radicado,
    email_contacto,
    nombre_contacto,
    asunto,
    estado,
    prioridad
  ) VALUES (
    'TKT-2026-' || floor(random() * 900000 + 100000)::text,
    'RADICADO-TEST',
    beneficiario_email,
    'Usuario Test',
    'Prueba de inserción desde script',
    'recibido',
    'media'
  )
  RETURNING id INTO test_ticket_id;
  
  RAISE NOTICE 'Ticket creado con ID: %', test_ticket_id;
  
  -- 3. Insertar mensaje (esto es lo que falla en la Edge Function)
  BEGIN
    INSERT INTO public.portal_ticket_mensajes (
      ticket_id,
      autor_tipo,
      mensaje,
      admin_user_id
    ) VALUES (
      test_ticket_id,
      'beneficiario',
      'Este es un mensaje de prueba desde script SQL para verificar si la inserción funciona correctamente con todas las validaciones.',
      NULL
    )
    RETURNING id INTO test_mensaje_id;
    
    RAISE NOTICE '✅ Mensaje insertado exitosamente con ID: %', test_mensaje_id;
    
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ ERROR insertando mensaje:';
    RAISE NOTICE 'SQLSTATE: %', SQLSTATE;
    RAISE NOTICE 'SQLERRM: %', SQLERRM;
    RAISE NOTICE 'Detalles: %', SQLERRM;
  END;
  
  -- 4. Verificar el resultado
  PERFORM 1 FROM public.portal_ticket_mensajes WHERE id = test_mensaje_id;
  
  IF FOUND THEN
    RAISE NOTICE '✅ Verificación: Mensaje existe en la tabla';
  ELSE
    RAISE NOTICE '❌ Verificación: Mensaje NO encontrado';
  END IF;
  
END $$;

-- Ver el ticket y mensaje creados
SELECT 
  t.ticket_codigo,
  t.asunto,
  t.estado,
  m.autor_tipo,
  m.mensaje,
  m.created_at
FROM public.soporte_tickets t
LEFT JOIN public.portal_ticket_mensajes m ON m.ticket_id = t.id
WHERE t.ticket_codigo LIKE 'TKT-2026-%'
ORDER BY t.created_at DESC
LIMIT 1;
