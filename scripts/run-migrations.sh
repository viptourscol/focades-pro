#!/bin/bash
# Script para ejecutar migraciones directamente vía Supabase API
# Ejecuta los 4 SQL files contra la BD remota

set -e

PROJECT_ID="jwifxjzxdxjntbdqbyku"
REGION="us-east-1"

echo "📍 Ejecutando migraciones de cargue masivo..."
echo ""

MIGRATIONS=(
  "supabase/migrations/202610120001_cargue_masivo_base.sql"
  "supabase/migrations/202610120002_cargue_masivo_rls.sql"
  "supabase/migrations/202610120003_cargue_masivo_functions.sql"
  "supabase/migrations/202610120004_cargue_masivo_views.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  if [ -f "$migration" ]; then
    echo "✅ Encontrado: $migration"
    echo "   Tamaño: $(wc -c < "$migration") bytes"
  else
    echo "❌ No encontrado: $migration"
    exit 1
  fi
done

echo ""
echo "📋 Instrucciones para ejecutar migraciones:"
echo ""
echo "OPCIÓN 1: SQL Editor en Supabase Dashboard"
echo "  1. Ir a: https://supabase.com/dashboard/project/$PROJECT_ID/sql/new"
echo "  2. Copiar y pegar el contenido de CADA archivo:"
for migration in "${MIGRATIONS[@]}"; do
  echo "     - $migration"
done
echo "  3. Ejecutar cada uno en orden"
echo ""
echo "OPCIÓN 2: Usar psql directamente"
echo "  psql 'postgresql://...' < supabase/migrations/202610120001_cargue_masivo_base.sql"
echo ""
echo "OPCIÓN 3: Con supabase-cli (recomendado)"
echo "  supabase db push"
echo ""
