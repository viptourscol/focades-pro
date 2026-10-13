# 🔧 Scripts - Utilidades Operacionales

Colección de scripts para automatizar tareas operacionales, testing y mantenimiento del proyecto.

## 📁 Estructura

### [setup/](setup/)
Scripts de configuración inicial e instalación.
- `configure-r2-env-vars.sh` - Configurar variables de R2
- `run-migrations.sh` - Ejecutar migraciones

### [migration/](migration/)
Scripts para migración de datos y cambios de infraestructura.
- `migrate-*.mjs` - Varios scripts de migración a R2
- `verify-*.mjs` - Verificación de migraciones
- `import-beneficiarios.mjs` - Importar beneficiarios
- `create-cargue-tables.sql` - Crear tablas de cargue

### [admin/](admin/)
Scripts para operaciones administrativas.
- `activar-beneficiarios.mjs` - Activar beneficiarios
- `setup-admin-roles.sql` - Configurar roles administrativos
- `update-admin-roles.mjs` - Actualizar roles
- `create-beneficiary-auth-tokens.mjs` - Crear tokens de autenticación

### [testing/](testing/)
Scripts de prueba y verificación.
- `smoke-*.mjs` - Smoke tests
- `test-*.mjs` - Tests funcionales
- `*.sql` - Scripts de verificación en BD

### [utils/](utils/)
Utilidades y herramientas de diagnóstico.
- `analyze-supabase.mjs` - Analizar Supabase
- `debug-*.mjs` - Scripts de debug
- `diagnose-*.mjs` - Diagnósticos
- `generate-*.mjs` - Generadores de datos
- `html-pdf-mock-server.mjs` - Mock server para PDF

### [gas/](gas/)
Google Apps Script (integración con Google Sheets).
- `CHECKLIST_GAS_DEPLOY.md` - Checklist de deployment

### [archived/](archived/)
Scripts obsoletos o en desuso.
- `check_*.mjs/.sh` - Scripts antiguos de verificación

---

## 🚀 Uso

Para ejecutar un script:

```bash
# Desde la raíz del proyecto
node scripts/admin/activar-beneficiarios.mjs

# O si es bash
bash scripts/setup/run-migrations.sh
```

## ⚠️ Notas Importantes

- **Nunca ejecutar scripts de migración directamente** sin revisar la documentación en `docs/documentation/migration/`
- **Scripts de admin** requieren credenciales correctas en `.env.local`
- **Testing scripts** son seguros para ejecutar en desarrollo
- **Archived scripts** no deben usarse - están aquí para referencia histórica

---

**Última actualización:** Oct 2026
