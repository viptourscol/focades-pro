# 🚀 Implementación: Cargue Masivo - Base de Datos y Edge Functions

## Resumen

He creado:

### ✅ FASE 1: BASE DE DATOS (4 migraciones SQL)
1. `202610120001_cargue_masivo_base.sql` - Tablas base
2. `202610120002_cargue_masivo_rls.sql` - Row Level Security
3. `202610120003_cargue_masivo_functions.sql` - Funciones y triggers
4. `202610120004_cargue_masivo_views.sql` - Vistas y índices

**CONSOLIDADO**: `MIGRATION_CONSOLIDATED.sql` - Todas las migraciones en 1 archivo

### ✅ FASE 2: EDGE FUNCTIONS (5 funciones Deno TypeScript)
1. `obtener-documentos-por-rol` - Listar documentos según acceso del usuario
2. `crear-documento-cargue` - Crear nuevo documento
3. `enviar-para-revision` - Cambiar estado a "enviado_para_revision"
4. `aprobar-documento` - Cambiar estado a "aprobado"
5. `rechazar-documento` - Cambiar estado a "rechazado"
6. `validar-documento-cargue` - Validar contenido del documento

---

## 📋 OPCIÓN 1: Ejecutar Migraciones en Supabase SQL Editor

### Pasos:

1. **Ir al Dashboard de Supabase**
   ```
   https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku/sql/new
   ```

2. **Copiar el contenido de `MIGRATION_CONSOLIDATED.sql`** en el editor

3. **Ejecutar** (botón RUN)

4. **Resultado esperado**: ✅ 6 tablas creadas + índices + functions + vistas

---

## 🔧 OPCIÓN 2: Desplegar Edge Functions (CLI)

### Prerequisitos:
- Supabase CLI instalado ✅ (ya verificado)
- Conectado al proyecto ✅ (jwifxjzxdxjntbdqbyku)

### Pasos:

#### 1. Verificar estado
```bash
supabase functions list
```

#### 2. Desplegar todas las funciones
```bash
supabase functions deploy
```

#### 3. Desplegar función específica
```bash
supabase functions deploy obtener-documentos-por-rol
supabase functions deploy crear-documento-cargue
supabase functions deploy enviar-para-revision
supabase functions deploy aprobar-documento
supabase functions deploy rechazar-documento
supabase functions deploy validar-documento-cargue
```

#### 4. Verificar despliegue
```bash
supabase functions list
# Debe mostrar las 6 nuevas funciones con estado "deployed"
```

---

## 🧪 PROBAR LAS FUNCIONES

### 1. Obtener Token de Autenticación

```bash
# Usar curl para obtener token
curl -X POST "https://jwifxjzxdxjntbdqbyku.supabase.co/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tu@email.com",
    "password": "contraseña"
  }'

# Guardar el access_token
```

### 2. Probar obtener-documentos-por-rol

```bash
curl -X POST "https://jwifxjzxdxjntbdqbyku.supabase.co/functions/v1/obtener-documentos-por-rol" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "convocatoria_id": 1,
    "tipo_filtro": "terceros"
  }'
```

### 3. Probar crear-documento-cargue

```bash
curl -X POST "https://jwifxjzxdxjntbdqbyku.supabase.co/functions/v1/crear-documento-cargue" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "convocatoria_id": 1,
    "tipo_documento": "terceros",
    "cantidad_registros": 100
  }'
```

### 4. Probar enviar-para-revision

```bash
curl -X POST "https://jwifxjzxdxjntbdqbyku.supabase.co/functions/v1/enviar-para-revision" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "documento_id": "UUID_DEL_DOCUMENTO",
    "comentario": "Listo para revisar"
  }'
```

### 5. Probar validar-documento-cargue

```bash
curl -X POST "https://jwifxjzxdxjntbdqbyku.supabase.co/functions/v1/validar-documento-cargue" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "documento_id": "UUID_DEL_DOCUMENTO",
    "datos": [
      {
        "cc_nit": "1234567890",
        "nombre_razon_social": "Juan García",
        "email": "juan@example.com",
        "telefono": "3105551234"
      }
    ]
  }'
```

---

## 📊 ESTRUCTURA DE BASES DE DATOS

### Tablas Creadas:
```
✅ portal_plantillas_cargue (metadatos)
✅ portal_documentos_cargue (documentos)
✅ portal_transiciones_documento (bitácora)
✅ portal_cargue_beneficiarios_terceros (mapeo)
✅ portal_valores_cargue (valores)
✅ portal_cargue_validaciones (errores)
```

### Índices Creados: 22
### Funciones SQL Creadas: 9
### Vistas Creadas: 2
### Políticas RLS: 15+

---

## 🔒 SEGURIDAD IMPLEMENTADA

✅ **RLS en todas las tablas**
- admin_educacion: Acceso total
- admin_presupuesto: Ver y editar TERCEROS y RP
- admin_contabilidad: Ver y editar OP y CONTABILIDAD
- admin_pagos: Ver todos, editar SIAFE
- admin_visualizacion: Solo lectura

✅ **Validación de permisos en Edge Functions**
✅ **Auditoría completa** (transiciones, cambios)
✅ **Validaciones en nivel BD** (constraints)

---

## 📝 ARCHIVOS CREADOS

```
supabase/
├── migrations/
│   ├── 202610120001_cargue_masivo_base.sql
│   ├── 202610120002_cargue_masivo_rls.sql
│   ├── 202610120003_cargue_masivo_functions.sql
│   └── 202610120004_cargue_masivo_views.sql
├── functions/
│   ├── obtener-documentos-por-rol/index.ts
│   ├── crear-documento-cargue/index.ts
│   ├── enviar-para-revision/index.ts
│   ├── aprobar-documento/index.ts
│   ├── rechazar-documento/index.ts
│   └── validar-documento-cargue/index.ts
MIGRATION_CONSOLIDATED.sql (archivo único con todas las migraciones)
```

---

## ✅ PRÓXIMOS PASOS

### OPCIÓN A: Ejecutar todo ahora
1. Copiar `MIGRATION_CONSOLIDATED.sql` a SQL Editor
2. Ejecutar
3. Desplegar functions: `supabase functions deploy`
4. Verificar con test de curl

### OPCIÓN B: Ejecutar paso a paso
1. Ejecutar migraciones primero
2. Verificar que las tablas se crean
3. Luego desplegar functions
4. Verificar que functions responden

### OPCIÓN C: Ignorar local, usar CLI puro
```bash
cd /Users/janyermartinez/Documents/Proyectos/focades-pro
supabase functions deploy
```

---

## 🐛 TROUBLESHOOTING

### Error: "Remote migration versions not found"
**Solución**: Las migraciones tienen números viejos que no están sincronizadas. Usar SQL Editor manual en lugar de CLI.

### Error: "Function deployment failed"
**Solución**: Verificar que TypeScript está correcto y dependencias (deno.json) están configuradas.

### Error: "Unauthorized" en funciones
**Solución**: Verificar que el token de autenticación es válido y que el usuario tiene el rol correcto en user_metadata.

---

## 📞 SOPORTE

Para preguntas sobre:
- **Migraciones**: Ver archivo SQL consolidado
- **Edge Functions**: Ver comentarios en code TypeScript
- **RLS**: Ver políticas en MIGRATION_CONSOLIDATED.sql
- **Testing**: Usar ejemplos de curl arriba

---

**ESTADO**: ✅ Todo listo para desplegar
**FECHA**: 2026-10-12
**VERSIÓN**: 1.0
