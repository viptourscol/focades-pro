-- Migration: Create email audit log table
-- Table to track all emails sent to beneficiaries

CREATE TABLE IF NOT EXISTS portal_beneficiarios_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id bigint NOT NULL REFERENCES portal_beneficiarios(id) ON DELETE CASCADE,
  email_type text NOT NULL CHECK (email_type IN ('setup-activation', 'password-reset', 'notification', 'bulk-message')),
  recipient_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'bounced', 'complained')),
  sendgrid_message_id text,
  error_message text,
  sent_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index para búsquedas rápidas
CREATE INDEX idx_email_log_beneficiario_id ON portal_beneficiarios_email_log(beneficiario_id);
CREATE INDEX idx_email_log_status ON portal_beneficiarios_email_log(status);
CREATE INDEX idx_email_log_type ON portal_beneficiarios_email_log(email_type);
CREATE INDEX idx_email_log_created_at ON portal_beneficiarios_email_log(created_at);

-- View para resumen de activaciones por estado
CREATE OR REPLACE VIEW portal_beneficiarios_activation_status AS
SELECT
  pb.id,
  pb.n_documento,
  pb.nombre_completo,
  pb.email,
  COALESCE(pac.setup_completed_at IS NOT NULL, FALSE) as setup_completo,
  CASE
    WHEN pb.perfil_completado_en IS NOT NULL THEN 'completo'
    WHEN pac.setup_completed_at IS NOT NULL THEN 'setup-completo'
    WHEN pac.setup_token IS NOT NULL THEN 'token-generado'
    ELSE 'pendiente'
  END as estado_activacion,
  pel.status as ultimo_email_status,
  pel.sent_at as ultimo_email_fecha,
  COUNT(DISTINCT CASE WHEN pac.failed_login_attempts > 0 THEN 1 END) > 0 as has_failed_attempts,
  pac.failed_login_attempts,
  pac.locked_until > now() as account_locked
FROM portal_beneficiarios pb
LEFT JOIN portal_auth_credentials pac ON pb.id = pac.beneficiario_id
LEFT JOIN portal_beneficiarios_email_log pel ON pb.id = pel.beneficiario_id
  AND pel.created_at = (
    SELECT MAX(created_at) FROM portal_beneficiarios_email_log 
    WHERE beneficiario_id = pb.id
  )
GROUP BY pb.id, pac.id, pel.id;

-- Función para registrar cambio de estado de email via webhooks
CREATE OR REPLACE FUNCTION handle_email_webhook(
  payload jsonb
) RETURNS void AS $$
DECLARE
  v_message_id text;
  v_event text;
  v_email text;
  v_status text;
BEGIN
  v_message_id := payload->>'message_id';
  v_event := payload->>'event';
  v_email := payload->>'email';
  
  v_status := CASE v_event
    WHEN 'bounce' THEN 'bounced'
    WHEN 'complaint' THEN 'complained'
    WHEN 'dropped' THEN 'failed'
    ELSE v_event
  END;
  
  -- Actualizar registro de email
  UPDATE portal_beneficiarios_email_log
  SET
    status = v_status,
    bounced_at = CASE WHEN v_event = 'bounce' THEN now() ELSE bounced_at END,
    complained_at = CASE WHEN v_event = 'complaint' THEN now() ELSE complained_at END,
    error_message = payload->>'reason',
    updated_at = now()
  WHERE sendgrid_message_id = v_message_id;
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON TABLE portal_beneficiarios_email_log IS 'Auditoría y trazabilidad de emails enviados a beneficiarios. Integración con SendGrid webhooks.';
COMMENT ON COLUMN portal_beneficiarios_email_log.sendgrid_message_id IS 'ID retornado por SendGrid para tracking en webhooks';
COMMENT ON COLUMN portal_beneficiarios_email_log.status IS 'Estado actual del email: queued, sent, failed, bounced, complained';
