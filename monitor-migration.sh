#!/bin/bash
# Script para monitorear migración en vivo

echo "⏳ Monitoreando migración..."
echo "Proceso: $(pgrep -f migrate-real-all-files | wc -l) instancias activas"
echo ""

while true; do
  LOG_FILE=$(ls -t migration-real-*.json 2>/dev/null | head -1)
  
  if [ -z "$LOG_FILE" ]; then
    echo "⏳ Aún procesando fase 1 (listado de archivos)..."
    sleep 5
    continue
  fi
  
  TOTAL=$(grep -o '"totalFiles": [0-9]*' "$LOG_FILE" | tail -1 | grep -o '[0-9]*')
  SUCCESS=$(grep -o '"successfulMigrations": [0-9]*' "$LOG_FILE" | tail -1 | grep -o '[0-9]*')
  FAILED=$(grep -o '"failedMigrations": [0-9]*' "$LOG_FILE" | tail -1 | grep -o '[0-9]*')
  
  if [ -n "$TOTAL" ]; then
    PROGRESS=$((($SUCCESS + $FAILED) * 100 / $TOTAL))
    echo "📊 Progreso: $SUCCESS/$TOTAL archivos migrados ($PROGRESS%)"
    echo "   ✅ Exitosos: $SUCCESS"
    echo "   ❌ Fallidos: $FAILED"
  fi
  
  # Revisar si terminó
  if grep -q '"endTime"' "$LOG_FILE"; then
    echo ""
    echo "✅ MIGRACIÓN COMPLETADA"
    cat "$LOG_FILE" | tail -20
    break
  fi
  
  sleep 10
done
