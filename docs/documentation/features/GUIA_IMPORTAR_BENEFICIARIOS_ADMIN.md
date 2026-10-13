# 📊 GUÍA: IMPORTAR BENEFICIARIOS DESDE EL ADMIN PANEL

## ✅ VENTAJAS DE LA INTERFAZ WEB

✨ **Sin necesidad de terminal**  
✨ **Visual e intuitivo**  
✨ **Preview de datos antes de importar**  
✨ **Reporte detallado con resultados**  
✨ **Descargar CSV template**  
✨ **Drag & drop**  

---

## 🚀 PASO A PASO

### PASO 1: Inicia sesión como admin

```
URL: https://app.focades.com/admin/login
Usuario: admin@focades.com
Contraseña: [tu_contraseña]
```

### PASO 2: Navega a importar beneficiarios

En la barra lateral izquierda:

```
┌─────────────────────────────────────────┐
│ 📱 FOCADES                              │
├─────────────────────────────────────────┤
│ Dashboard                               │
│ Analíticas                              │
│ Proyecciones                            │
│ 👥 Beneficiarios                    ▼   │ ← CLIC AQUÍ
│    ├─ Todos los beneficiarios          │
│    └─ 📤 Importar CSV          ← AQUÍ  │
│ Actualizaciones                         │
│ ...                                     │
└─────────────────────────────────────────┘
```

Resultado: Se abre `/admin/beneficiarios/importar` con la interfaz de importación.

---

## 📋 INTERFAZ DE IMPORTACIÓN

### TAB 1: 📤 CARGAR (Upload)

```
╔════════════════════════════════════════════╗
║  📤 CARGAR    👁️ Preview    📊 Resultados  ║
╠════════════════════════════════════════════╣
║                                            ║
║          📁 Arrastra tu CSV aquí           ║
║          O haz clic para seleccionar       ║
║          Formato: CSV (valores separados   ║
║                   por comas)               ║
║                                            ║
║  [📁 Seleccionar archivo]                  ║
║                                            ║
║  ✅ ¿Necesitas un template?                ║
║     [📥 Descargar Template]                ║
║                                            ║
╚════════════════════════════════════════════╝
```

**Opciones de carga:**
- **Drag & drop:** Arrastra el archivo .csv directamente a la zona punteada
- **Click:** Haz clic en la zona para abrir selector de archivos
- **Template:** Descarga el template con headers correctos

**Archivo esperado:** `Hoja de cálculo sin título - Hoja 1.csv`

---

### TAB 2: 👁️ PREVIEW (Revisión)

Después de cargar, se abre automáticamente el tab PREVIEW:

```
╔════════════════════════════════════════════╗
║  📤 CARGAR    👁️ PREVIEW    📊 Resultados  ║
╠════════════════════════════════════════════╣
║                                            ║
║  ⚠️  REVISA LOS DATOS ANTES DE IMPORTAR   ║
║                                            ║
║  ┌──────────────────────────────────────┐ ║
║  │ NOMBRE │ TIPO_DOC │ N_DOC │ GENERO   │ ║
║  ├──────────────────────────────────────┤ ║
║  │ Juan   │ CC       │ 100.. │ M        │ ║
║  │ María  │ CC       │ 101.. │ F        │ ║
║  │ Pedro  │ CC       │ 102.. │ M        │ ║
║  │ ...    │ ...      │ ...   │ ...      │ ║
║  └──────────────────────────────────────┘ ║
║                                            ║
║  Mostrando primeros 10 de 150 registros   ║
║                                            ║
║  [Cargar otro archivo] [Importar 150 ✅] ║
║                                            ║
╚════════════════════════════════════════════╝
```

**Aquí puedes:**
- ✅ Ver preview de los 10 primeros registros
- ✅ Verificar que los datos se vean correctos
- ✅ Cargar otro archivo si hay problemas
- ✅ Proceder a importar

---

### TAB 3: 📊 RESULTADOS (Results)

Después de hacer clic en "Importar", se abre el tab RESULTADOS mostrando:

```
╔════════════════════════════════════════════╗
║  📤 CARGAR    👁️ PREVIEW    📊 RESULTADOS  ║
╠════════════════════════════════════════════╣
║                                            ║
║  📊 ESTADÍSTICAS                           ║
║                                            ║
║  ┌──────────────┐  ┌──────────────┐      ║
║  │  IMPORTADOS  │  │    ERRORES   │      ║
║  │      150     │  │       2      │      ║
║  │   ✅ Verde   │  │   ⚠️ Rojo    │      ║
║  └──────────────┘  └──────────────┘      ║
║                                            ║
║  ┌──────────────┐  ┌──────────────┐      ║
║  │   VÁLIDOS    │  │ TOTAL LEÍDOS │      ║
║  │      150     │  │      152     │      ║
║  │    🔵 Azul   │  │  ⚪ Gris     │      ║
║  └──────────────┘  └──────────────┘      ║
║                                            ║
║  🔴 ERRORES (2)                           ║
║  ├─ 1066598742 — Sin documento           ║
║  └─ 1066598742 — Sin email               ║
║                                            ║
║  [Importar otro archivo] [📥 Descargar   ║
║                             reporte]     ║
║                                            ║
║  Importado: 12/08/2026 14:30               ║
║                                            ║
╚════════════════════════════════════════════╝
```

**Información mostrada:**
- `IMPORTADOS`: Cuántos se guardaron exitosamente en BD
- `ERRORES`: Registros que fallaron validación
- `VÁLIDOS`: Registros sin errores en el CSV
- `TOTAL LEÍDOS`: Todos los registros del CSV

**Errores comunes:**
```
❌ "Sin documento" → Campo N_DOC vacío o #N/D
❌ "Sin nombre" → Campo NOMBRE vacío o #N/D
❌ "Sin email" → Campo EMAIL vacío o #N/D
```

**Acciones disponibles:**
- 📂 **Importar otro archivo** - Vuelve al tab de carga
- 📥 **Descargar reporte** - Guarda JSON con stats y errores

---

## 📥 DESCARGAR TEMPLATE

Si es la primera vez, descarga el template CSV:

1. Tab "📤 CARGAR"
2. Botón: **"📥 Descargar Template"**
3. Se descarga: `template-beneficiarios.csv`

**Headers del template:**
```csv
NOMBRE,TIPO_DOC,N_DOC,GENERO,EMAIL,TEL,MODALIDAD,CONVOCATORIA,COLEGIO,UNIVERSIDAD,PROGRAMA,TIPO_EDUCACION,BANCO,CUENTA_BANCO,TIPO_CUENTA,ESTADO
```

Reemplaza las filas con tus datos.

---

## 🔍 VERIFICAR IMPORTACIÓN EN SUPABASE

Después de importar, verifica en Supabase:

**URL:** https://app.supabase.com → Tu proyecto → SQL Editor

**Query para contar:**
```sql
SELECT COUNT(*) as total FROM portal_beneficiarios;
```

**Query para ver últimos importados:**
```sql
SELECT id, n_documento, nombre_completo, email, nombre_universidad 
FROM portal_beneficiarios 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## 📋 CASOS DE USO

### Caso 1: Importación inicial (150 beneficiarios)

```
1. Admin descarga template
2. Coloca datos de beneficiarios en CSV
3. Abre /admin/beneficiarios/importar
4. Arrastra archivo
5. Revisa preview (10 primeros)
6. Hace clic en "Importar 150"
7. Ve resultados: "150 importados, 0 errores"
8. Descarga reporte JSON
9. ✅ Beneficiarios listos en BD
```

### Caso 2: Actualización incremental (50 nuevos)

```
1. Admin prepara CSV con 50 nuevos beneficiarios
2. Abre /admin/beneficiarios/importar
3. Upload CSV
4. Sistema detecta: "50 nuevos, 0 duplicados"
5. Importa los 50
6. ✅ BD tiene 200 beneficiarios
```

### Caso 3: Corregir errores

```
1. Primera importación: 150 registros, 2 con error
2. Admin descarga reporte JSON
3. Lee errors: "N_DOC vacío en línea 105"
4. Corrige el CSV
5. Vuelve a importar
6. Ahora: "2 nuevos, 148 duplicados" (saltados)
7. ✅ Todos los datos en BD
```

---

## 🚨 TROUBLESHOOTING

### ❌ "Archivo inválido - Por favor carga un archivo CSV"

**Problema:** Archivo no es .csv  
**Solución:** Guarda como CSV en Excel/Google Sheets

```
Excel → Archivo → Guardar Como → Formato: CSV (separado por comas)
Google Sheets → Archivo → Descargar → CSV
```

### ❌ "CSV vacío - El archivo no contiene datos"

**Problema:** Archivo sin filas de datos  
**Solución:** Verifica que tenga headers + datos

```
✅ CORRECTO:
NOMBRE,N_DOC,EMAIL
Juan,1001409006,juan@gmail.com
María,1003292645,maria@gmail.com

❌ INCORRECTO:
[archivo vacío]
```

### ❌ "Sin documento / Sin nombre / Sin email"

**Problema:** Campos requeridos vacíos  
**Solución:** Rellena en el CSV antes de importar

```
REQUERIDOS (no pueden estar vacíos o #N/D):
- NOMBRE
- TIPO_DOC
- N_DOC
- EMAIL
```

### ❌ "X registros ya existen (duplicados)"

**Problema:** El documento ya estaba en BD  
**Solución:** Normal - se saltan automáticamente

```
Si haces 2 importaciones del mismo archivo:
1️⃣ Primera: "150 nuevos importados"
2️⃣ Segunda: "0 nuevos, 150 duplicados (saltados)"
```

---

## ✅ CHECKLIST DE IMPORTACIÓN

- [ ] Tengo el CSV con beneficiarios
- [ ] CSV tiene headers: NOMBRE, N_DOC, EMAIL, etc.
- [ ] Todos los registros tienen documento, nombre, email
- [ ] Archivo es formato .csv (no .xlsx)
- [ ] Me logueo como admin
- [ ] Navego a /admin/beneficiarios/importar
- [ ] Cargo el archivo
- [ ] Reviso preview
- [ ] Hago clic en "Importar X registros"
- [ ] Veo resultados en el tab 📊
- [ ] Descargo el reporte (opcional)
- [ ] Verifico en Supabase que están los datos

---

## 📞 SOPORTE

Si hay problemas durante la importación:

1. **Revisa el reporte JSON** - muestra exactamente qué falló
2. **Descarga la sección de errores** - línea exacta del problema
3. **Corrige el CSV** - rellena campos faltantes
4. **Reintenta la importación**

**Contacto técnico:** [backend-team@focades.com]

---

## 🎉 RESULTADO ESPERADO

Después de importación exitosa:

```
✅ 150 beneficiarios en portal_beneficiarios
✅ Datos académicos (universidad, programa)
✅ Datos bancarios (banco, cuenta)
✅ Listos para:
   - Generar setup tokens (script)
   - Enviar emails de acceso
   - Beneficiarios hacen setup + login
```

¿Listo? ¡Dirígete a /admin/beneficiarios/importar! 🚀
