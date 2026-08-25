-- Add razon_suspension field to portal_beneficiarios
-- This allows admins to document the reason for suspension and display it to beneficiaries

ALTER TABLE public.portal_beneficiarios 
  ADD COLUMN IF NOT EXISTS razon_suspension text;

COMMENT ON COLUMN public.portal_beneficiarios.razon_suspension IS 
  'Razón por la cual el beneficiario fue suspendido. Se muestra al beneficiario cuando su estado es "suspendido".';
