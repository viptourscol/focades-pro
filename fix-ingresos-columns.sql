-- Migración: Cambiar tipos de columnas problemáticas a text
-- Ejecutar en: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/sql/new

-- 1. Campos de ingresos (numeric → text)
ALTER TABLE portal_beneficiarios 
  ALTER COLUMN ingresos_padre TYPE text,
  ALTER COLUMN ingresos_madre TYPE text;

-- 2. Semestre de ingreso (integer → text, formato: "2025-2")
ALTER TABLE portal_beneficiarios 
  ALTER COLUMN semestre_ingreso TYPE text;

-- 3. Otros campos numéricos que podrían ser text
-- Verificar si semestre_actual también usa el mismo formato
-- Si es necesario, descomentar la siguiente línea:
-- ALTER TABLE portal_beneficiarios ALTER COLUMN semestre_actual TYPE text;
