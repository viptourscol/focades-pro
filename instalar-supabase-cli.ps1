# Script para instalar Supabase CLI y desplegar funciones
# Ejecutar con: .\instalar-supabase-cli.ps1

Write-Host "🚀 Instalando Supabase CLI..." -ForegroundColor Cyan

# Verificar si npm está instalado
try {
    $npmVersion = npm --version
    Write-Host "✅ npm detectado (versión $npmVersion)" -ForegroundColor Green
    
    Write-Host "📦 Instalando supabase CLI con npm..." -ForegroundColor Yellow
    npm install -g supabase
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Supabase CLI instalado exitosamente" -ForegroundColor Green
    } else {
        Write-Host "❌ Error instalando Supabase CLI" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ npm no está instalado. Instalando con Scoop..." -ForegroundColor Yellow
    
    # Verificar si Scoop está instalado
    try {
        $scoopVersion = scoop --version
        Write-Host "✅ Scoop detectado" -ForegroundColor Green
    } catch {
        Write-Host "📦 Instalando Scoop..." -ForegroundColor Yellow
        Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
        Invoke-RestMethod get.scoop.sh | Invoke-Expression
    }
    
    # Instalar Supabase con Scoop
    Write-Host "📦 Agregando bucket de Supabase..." -ForegroundColor Yellow
    scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
    
    Write-Host "📦 Instalando Supabase CLI..." -ForegroundColor Yellow
    scoop install supabase
}

Write-Host ""
Write-Host "✨ Instalación completada" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. Ejecutar: supabase login" -ForegroundColor White
Write-Host "2. Ejecutar: supabase link --project-ref jwifxjzxdxjntbdqbyku" -ForegroundColor White
Write-Host "3. Ejecutar: supabase functions deploy auth-credentials" -ForegroundColor White
Write-Host "4. Ejecutar: supabase functions deploy beneficiary-support-tickets" -ForegroundColor White
Write-Host ""
Write-Host "O simplemente ejecuta: .\desplegar-funciones.ps1" -ForegroundColor Yellow
