-- Script de prueba para insertar un mensaje en portal_ticket_mensajes
-- Ejecutar en Supabase SQL Editor

DO $$
DECLARE
  test_ticket_id UUID;
BEGIN
  -- Obtener o crear un ticket de prueba
  SELECT id INTO test_ticket_id 
  FROM public.soporte_tickets 
  LIMIT 1;
  
  IF test_ticket_id IS NULL THEN
    INSERT INTO public.soporte_tickets (
      ticket_codigo,
      radicado,
      email_contacto,
      nombre_contacto,
      asunto,
      estado,
      prioridad
    ) VALUES (
      'TKT-TEST-999999',
      'TEST-RADICADO',
      'test@test.com',
      'Test Usuario',
      'Test asunto',
      'recibido',
      'media'
    )
    RETURNING id INTO test_ticket_id;
    
    RAISE NOTICE 'Ticket de prueba creado: %', test_ticket_id;
  ELSE
    RAISE NOTICE 'Usando ticket existente: %', test_ticket_id;
  END IF;
  
  -- Intentar insertar un mensaje
  BEGIN
    INSERT INTO public.portal_ticket_mensajes (
      ticket_id,
      autor_tipo,
      mensaje,
      admin_user_id
    ) VALUES (
      test_ticket_id,
      'beneficiario',
      'Este es un mensaje de prueba para verificar la inserción',
      NULL
    );
    
    RAISE NOTICE 'Mensaje insertado exitosamente';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR insertando mensaje: % - %', SQLSTATE, SQLERRM;
  END;
  
END $$;

-- Verificar el resultado
SELECT 
  t.ticket_codigo,
  t.asunto,
  m.autor_tipo,
  m.mensaje,
  m.created_at
FROM public.soporte_tickets t
LEFT JOIN public.portal_ticket_mensajes m ON m.ticket_id = t.id
WHERE t.ticket_codigo LIKE 'TKT-TEST%'
ORDER BY m.created_at DESC
LIMIT 5;
