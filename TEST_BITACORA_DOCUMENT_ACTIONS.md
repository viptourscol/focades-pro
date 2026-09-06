# 🧪 Plan de Pruebas: Bitácora & Acciones de Documentos

## 📋 Resumen de Cambios Implementados

### ✅ Auto-Refresh de Bitácora
Se han implementado cambios para que la **bitácora se refresque automáticamente** después de TODAS las acciones administrativas:

1. ✅ **Reemplazo de documentos** (expediente/onboarding)
2. ✅ **Eliminación de documentos** (expediente/onboarding)
3. ✅ **Actualizaciones de perfil** (datos base del beneficiario)
4. ✅ **Cambios de estado** del beneficiario
5. ✅ **Revisiones de actualizaciones** semestrales
6. ✅ **Operaciones de pagos** (crear/editar/eliminar)

### 🔧 Cómo Funciona
- Después de cada acción, se marca `loadedTabs.bitacora = false`
- Luego se llama `await loadBitacoraData()`
- Esto **fuerza una recarga fresca** desde la BD
- Funciona **incluso si el tab de bitácora NO estaba abierto**

---

## 🎯 Plan de Pruebas

### 📌 Test 1: Reemplazar Documento → Verificar en Bitácora

**Pasos**:
1. Login como admin a `/admin/beneficiario/detalle/[id]`
2. Ir a tab **"Expediente"**
3. Encontrar un documento (ej: "documento_identidad")
4. Click en tres puntos → **"Reemplazar"**
5. Seleccionar PDF
6. Ingresar razón: `Test reemplazo desde prueba`
7. Click **"Reemplazar"**
8. Esperar alert de éxito
9. Click en tab **"Bitácora"**

**Resultado Esperado** ✅:
- ✅ Alert muestra "Documento reemplazado"
- ✅ Modal se cierra
- ✅ Al abrir tab "Bitácora", aparece un registro **NUEVO** con:
  - **Acción**: "Reemplazó documento"
  - **Categoría**: "documento"  
  - **Nota**: `Tipo: documento_identidad | Motivo: Test reemplazo desde prueba`
  - **Timestamp**: Hace pocos segundos
  - **Admin**: Tu nombre/email

**Qué Verificar en Consola**:
```
📄 Documento a procesar: {...}
✅ Bitácora cargada automáticamente
```

---

### 📌 Test 2: Eliminar Documento → Verificar en Bitácora

**Pasos**:
1. En tab **"Onboarding"**
2. Encontrar un documento (ej: "cedula_ampliada")
3. Click en tres puntos → **"Eliminar"**
4. Ingresar razón: `Test eliminación`
5. Confirmar eliminación
6. Esperar alert de éxito
7. Click en tab **"Bitácora"**

**Resultado Esperado** ✅:
- ✅ Documento se elimina del tab onboarding
- ✅ Alert muestra "Documento eliminado"
- ✅ Al abrir tab "Bitácora", aparece registro **NUEVO** con:
  - **Acción**: "Eliminó documento"
  - **Categoría**: "documento"
  - **Nota**: Tipo y motivo de eliminación
  - **Timestamp**: Reciente

---

### 📌 Test 3: Actualizar Perfil → Verificar en Bitácora

**Pasos**:
1. Click en tab **"Perfil"**
2. Editar algún dato (ej: email o teléfono)
3. Click **"Guardar"**
4. Esperar success alert
5. Click en tab **"Bitácora"**

**Resultado Esperado** ✅:
- ✅ Alert: "Perfil actualizado"
- ✅ Bitácora muestra registro **NUEVO** con:
  - **Acción**: "update"
  - **Categoría**: "datos_personales"
  - **Nota**: Campos actualizados y email del admin
  - **Timestamp**: Reciente

---

### 📌 Test 4: Cambiar Estado del Beneficiario → Verificar en Bitácora

**Pasos**:
1. En tab **"Perfil"**
2. Encontrar selector de estado (ej: "Activo" → "Suspendido")
3. Seleccionar nuevo estado
4. Ingresar razón: `Test cambio de estado`
5. Click **"Cambiar Estado"**
6. Esperar success alert
7. Click en tab **"Bitácora"**

**Resultado Esperado** ✅:
- ✅ Alert: "Estado actualizado"
- ✅ Bitácora muestra registro **NUEVO** con:
  - **Acción**: "update"
  - **Tipo Evento**: "cambio_estado"
  - **Categoría**: "estado"
  - **Nota**: Cambio de estado y razón
  - **Timestamp**: Reciente

---

### 📌 Test 5: Revisar Actualización Semestral → Verificar en Bitácora

**Pasos**:
1. Click en tab **"Actualizaciones"**
2. Encontrar una actualización con estado "En revisión"
3. Click en documento
4. Cambiar estado a "Aprobada" o "Subsanación"
5. Ingresar observaciones (opcional)
6. Click **"Guardar Revisión"**
7. Esperar success alert
8. Click en tab **"Bitácora"**

**Resultado Esperado** ✅:
- ✅ Alert: "Actualización revisada"
- ✅ Bitácora muestra registro **NUEVO** con:
  - **Acción**: "update"
  - **Tipo Evento**: "revision_actualizacion"
  - **Categoría**: "actualizaciones"
  - **Nota**: ID de actualización y nuevo estado
  - **Timestamp**: Reciente

---

### 📌 Test 6: Crear/Editar Pago → Verificar en Bitácora

**Pasos**:
1. Click en tab **"Pagos"**
2. Click botón **"Nuevo Pago"** o editar uno existente
3. Llenar datos (concepto, monto, fecha)
4. Click **"Guardar Pago"**
5. Esperar success alert
6. Click en tab **"Bitácora"**

**Resultado Esperado** ✅:
- ✅ Alert: "Pago guardado"
- ✅ Bitácora muestra registro **NUEVO** con:
  - **Acción**: "create" (nuevo) o "update" (editado)
  - **Categoría**: "pagos"
  - **Tipo Evento**: "gestion_pagos"
  - **Nota**: Concepto y monto
  - **Timestamp**: Reciente

---

### 📌 Test 7: Eliminar Pago → Verificar en Bitácora

**Pasos**:
1. En tab **"Pagos"**
2. Encontrar un pago
3. Click botón **"Eliminar"**
4. Confirmar eliminación
5. Esperar success alert
6. Click en tab **"Bitácora"**

**Resultado Esperado** ✅:
- ✅ Alert: "Pago eliminado"
- ✅ Bitácora muestra registro **NUEVO** con:
  - **Acción**: "delete"
  - **Categoría**: "pagos"
  - **Nota**: ID del pago eliminado
  - **Timestamp**: Reciente

---

## 🔍 Verificación Técnica

### Estructura de Registro en Bitácora
```json
{
  "id": "uuid",
  "beneficiario_id": 3288,
  "categoria": "documento",
  "tipo_evento": "reemplazo",
  "accion": "Reemplazó documento",
  "nota": "Tipo: documento_identidad | Motivo: Test",
  "actor_user_id": "uuid_admin",
  "actor": {
    "user_id": "uuid_admin",
    "nombre_completo": "Admin Name",
    "email": "admin@email.com"
  },
  "created_at": "2026-09-06T15:30:00Z",
  "metadata_json": {
    "tipo_documento": "documento_identidad",
    "motivo": "Test reemplazo",
    "archivo_anterior": "documento_identidad.pdf",
    "archivo_nuevo": "documento_identidad-1725619200000.pdf",
    "documento_id": "uuid"
  }
}
```

### Query para Verificar en SQL
```sql
SELECT * 
FROM portal_beneficiario_bitacora 
WHERE beneficiario_id = 3288 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## ⚡ Checklist de Pruebas

| Test | Acción | Resultado en Bitácora | Estado |
|------|--------|----------------------|--------|
| 1️⃣ | Reemplazar documento | ✅ Registro nuevo aparece | ⏳ |
| 2️⃣ | Eliminar documento | ✅ Registro nuevo aparece | ⏳ |
| 3️⃣ | Actualizar perfil | ✅ Registro nuevo aparece | ⏳ |
| 4️⃣ | Cambiar estado | ✅ Registro nuevo aparece | ⏳ |
| 5️⃣ | Revisar actualización | ✅ Registro nuevo aparece | ⏳ |
| 6️⃣ | Crear pago | ✅ Registro nuevo aparece | ⏳ |
| 7️⃣ | Eliminar pago | ✅ Registro nuevo aparece | ⏳ |

---

## 🎯 Casos Especiales a Probar

### ❓ Caso: Bitácora NO estaba abierta
- Realizar una acción (ej: reemplazar documento)
- Esperaba que se recargara automáticamente incluso sin abrir la tab
- **Verificar**: Al abrir la tab después, el registro debe estar ahí

### ❓ Caso: Múltiples Acciones Seguidas
- Hacer 3-4 acciones seguidas (reemplazar, eliminar, cambiar estado)
- Abrir bitácora
- **Verificar**: Todos los registros aparecen en orden descendente

### ❓ Caso: Timestamp Correcto
- Realizar acción a las 3:30:45 PM
- Abrir bitácora
- **Verificar**: Timestamp en registro = hora actual (con segundos)

---

## 📊 Resultados Esperados

### ✅ Si Todo Funciona Correctamente:
- ✅ Cada acción genera exactamente 1 registro en bitácora
- ✅ Registro aparece automáticamente (sin recargar página)
- ✅ Actor (admin) se muestra correctamente
- ✅ Metadata completa (archivo anterior/nuevo, motivos, etc)
- ✅ Timestamps precisos

### ❌ Problemas Posibles:
- ❌ Registro no aparece en bitácora → Check Edge Function logs
- ❌ Timestamp incorrecto → Verificar zona horaria servidor
- ❌ Actor muestra "null" → Check `portal_admin_users` table
- ❌ Bitácora no se refresca → Check `setLoadedTabs` call

---

## 🚀 Deploy & Verificación

**Commit**: Incluye cambios para auto-refresh de bitácora
**Deploy**: 
```bash
npm run build  # ✅ Compilación sin errores
git commit     # ✅ Cambios guardados
git push       # ✅ Pushed to main
```

**Verificar**:
1. Abre admin panel en producción
2. Ejecuta los 7 tests
3. Revisa bitácora después de cada acción
4. Confirma que registros aparecen automáticamente

---

## 📝 Notas Importantes

> **Auto-Refresh Behavior**: 
> - Antes: Bitácora solo se recargaba si tab estaba ABIERTO
> - Ahora: Se SIEMPRE recarga después de acciones, incluso si tab está cerrado
> - Cuando abres la tab, ves datos FRESCOS

> **Metadata**:
> - Documentos: archivo anterior/nuevo, tipo, motivo
> - Pagos: concepto, monto, tipo de acción (create/update/delete)
> - Perfiles: campos modificados, email del admin
> - Estados: cambio de estado y razón

> **Performance**:
> - Carga extra mínima (una query a BD)
> - Solo ocurre DESPUÉS de acciones (no impacta navegación)
> - Async/await asegura que se completa antes de siguiente acción

---

**Ready to test! 🎯**
