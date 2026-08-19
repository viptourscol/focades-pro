# Script para desplegar funciones de Supabase
# Ejecutar con: .\desplegar-funciones.ps1

Write-Host "🚀 Desplegando Edge Functions de Supabase..." -ForegroundColor Cyan
Write-Host ""

# Verificar si supabase CLI está instalado
try {
    $supabaseVersion = supabase --version
    Write-Host "✅ Supabase CLI detectado" -ForegroundColor Green
} catch {
    Write-Host "❌ Supabase CLI no está instalado" -ForegroundColor Red
    Write-Host "   Ejecuta: .\instalar-supabase-cli.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "📦 Desplegando auth-credentials..." -ForegroundColor Yellow
supabase functions deploy auth-credentials

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ auth-credentials desplegado exitosamente" -ForegroundColor Green
} else {
    Write-Host "❌ Error desplegando auth-credentials" -ForegroundColor Red
    Write-Host "   Si no has hecho login, ejecuta: supabase login" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "📦 Desplegando beneficiary-support-tickets..." -ForegroundColor Yellow
supabase functions deploy beneficiary-support-tickets

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ beneficiary-support-tickets desplegado exitosamente" -ForegroundColor Green
} else {
    Write-Host "❌ Error desplegando beneficiary-support-tickets" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✨ Todas las funciones fueron desplegadas exitosamente" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Verifica el deployment en:" -ForegroundColor Cyan
Write-Host "   https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/functions" -ForegroundColor White
Write-Host ""
Write-Host "📝 Para ver logs en tiempo real:" -ForegroundColor Cyan
Write-Host "   supabase functions logs auth-credentials --follow" -ForegroundColor White
