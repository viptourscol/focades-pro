#!/bin/bash

# Script: Verificar credenciales antes de build
# Uso: ./check-credentials.sh && npm run build

echo "🔍 Verificando credenciales de R2..."

if [ ! -f .env.local ]; then
    echo "❌ ERROR: .env.local no encontrado"
    echo "Crea .env.local con las credenciales reales:"
    echo ""
    echo "VITE_R2_ACCESS_KEY_ID=tu_access_key_id"
    echo "VITE_R2_SECRET_ACCESS_KEY=tu_secret_key"
    echo "VITE_R2_ENDPOINT=https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com"
    echo "VITE_R2_PUBLIC_URL=https://focades-pro.82fdb4a6fd4628d720932bee674b6f7d.r2.dev"
    exit 1
fi

# Leer credenciales
ACCESS_KEY=$(grep "VITE_R2_ACCESS_KEY_ID=" .env.local | cut -d'=' -f2)
SECRET_KEY=$(grep "VITE_R2_SECRET_ACCESS_KEY=" .env.local | cut -d'=' -f2)

# Verificar que no sean placeholders
if [[ "$ACCESS_KEY" == *"COLOCA"* ]] || [[ -z "$ACCESS_KEY" ]]; then
    echo "❌ ERROR: VITE_R2_ACCESS_KEY_ID no es válida en .env.local"
    exit 1
fi

if [[ "$SECRET_KEY" == *"COLOCA"* ]] || [[ -z "$SECRET_KEY" ]]; then
    echo "❌ ERROR: VITE_R2_SECRET_ACCESS_KEY no es válida en .env.local"
    exit 1
fi

# Verificar longitud
if [ ${#ACCESS_KEY} -ne 32 ]; then
    echo "❌ ERROR: ACCESS_KEY debe tener 32 caracteres, tiene ${#ACCESS_KEY}"
    exit 1
fi

if [ ${#SECRET_KEY} -ne 64 ]; then
    echo "❌ ERROR: SECRET_KEY debe tener 64 caracteres, tiene ${#SECRET_KEY}"
    exit 1
fi

echo "✅ .env.local válido"
echo "✅ VITE_R2_ACCESS_KEY_ID: ${ACCESS_KEY:0:8}...${ACCESS_KEY: -4} (32 chars)"
echo "✅ VITE_R2_SECRET_ACCESS_KEY: ${SECRET_KEY:0:8}...${SECRET_KEY: -4} (64 chars)"
echo ""
echo "✅ Listo para hacer build"
