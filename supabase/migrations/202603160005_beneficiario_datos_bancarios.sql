-- Añade datos bancarios a portal_beneficiarios
-- Estos campos son llenados por el beneficiario en su actualización semestral
-- y por el admin al promover un aspirante a beneficiario.

ALTER TABLE portal_beneficiarios
  ADD COLUMN IF NOT EXISTS cuenta_bancaria text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS tipo_cuenta text;

COMMENT ON COLUMN portal_beneficiarios.cuenta_bancaria IS 'Número de cuenta bancaria para desembolso del crédito educativo.';
COMMENT ON COLUMN portal_beneficiarios.banco IS 'Nombre del banco donde se realizará el desembolso.';
COMMENT ON COLUMN portal_beneficiarios.tipo_cuenta IS 'Tipo de cuenta bancaria: Ahorros o Corriente.';
