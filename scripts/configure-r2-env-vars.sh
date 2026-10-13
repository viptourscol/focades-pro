#!/bin/bash

# Script para configurar variables de entorno en Supabase Functions
# Uso: bash configure-r2-env-vars.sh <SUPABASE_ACCESS_TOKEN>

set -e

if [ -z "$1" ]; then
  echo "❌ Uso: bash configure-r2-env-vars.sh <SUPABASE_ACCESS_TOKEN>"
  echo ""
  echo "Para obtener tu token:"
  echo "1. Ve a https://supabase.com/dashboard/account/tokens"
  echo "2. Crea un nuevo token personal"
  echo "3. Copia el token y pásalo como argumento"
  exit 1
fi

ACCESS_TOKEN="$1"
PROJECT_ID="jwifxjzxdxjntbdqbyku"

# Variables a configurar
R2_ACCESS_KEY_ID="316580a617ece85e36f746653265e92f"
R2_SECRET_ACCESS_KEY="4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40"
R2_ENDPOINT="https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com"
R2_BUCKET="focades-pro"

# Funciones a actualizar
FUNCTIONS=(
  "subsanar-actualizacion-beneficiario"
  "admin-document-action"
  "enviar-actualizacion-beneficiario"
  "generate-beneficiario-onboarding-docs"
  "generate-inscripcion-docs"
  "import-historicos-lote"
)

echo "🔧 Configurando variables de entorno en Supabase Functions..."
echo "Proyecto: $PROJECT_ID"
echo ""

# Base URL de la API de Supabase
API_BASE="https://api.supabase.com/v1"

for FUNC_NAME in "${FUNCTIONS[@]}"; do
  echo "📝 Configurando: $FUNC_NAME"
  
  # Crear payload JSON
  PAYLOAD=$(cat <<EOF
{
  "name": "R2_ACCESS_KEY_ID",
  "value": "$R2_ACCESS_KEY_ID"
}
EOF
)

  # Intenta POST a la API (puede fallar si el endpoint no existe)
  RESPONSE=$(curl -s -X POST \
    "${API_BASE}/projects/${PROJECT_ID}/functions/${FUNC_NAME}/secrets" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" 2>/dev/null || echo '{"error":"endpoint_not_available"}')
  
  if echo "$RESPONSE" | grep -q "error"; then
    echo "⚠️  API de Supabase no disponible para este endpoint"
    echo "   Por favor configura manualmente en Dashboard:"
    echo "   https://supabase.com/dashboard/project/${PROJECT_ID}/functions"
    break
  else
    echo "✓ Variable configurada"
  fi
done

echo ""
echo "⚠️  La configuración manual es más segura."
echo "Por favor sigue estos pasos en el Dashboard:"
