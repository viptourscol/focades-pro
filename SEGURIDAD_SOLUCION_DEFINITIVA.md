# Análisis de Seguridad - Solución Definitiva para R2

## Problema
Error CORS: El dominio `*.r2.dev` no permite acceso directo desde navegadores.

## Opciones y Evaluación de Seguridad

### ❌ Opción 1: Cloudflare Worker Proxy (No Recomendado)
**Ventajas:**
- Fácil de deployar
- Resuelve CORS

**Desventajas:**
- 🔴 **Expone archivos públicamente** sin autenticación
- 🔴 Cualquiera con la URL puede descargar documentos
- 🔴 Riesgo de datos sensibles (certificados bancarios, identificación)
- 🔴 No hay control de acceso por usuario

**Riesgo:** CRÍTICO para datos confidenciales

---

### ❌ Opción 2: Custom Domain en R2 (No Recomendado)
**Ventajas:**
- Dominio personalizado
- Resuelve CORS

**Desventajas:**
- 🔴 Los archivos siguen siendo públicos
- 🔴 Sin autenticación ni expiración
- 🔴 Permanente = riesgo indefinido

**Riesgo:** CRÍTICO para datos confidenciales

---

### ✅ Opción 3: Presigned URLs con Expiración (RECOMENDADO)
**Ventajas:**
- ✅ URLs firmadas criptográficamente
- ✅ Expiran automáticamente (24h, 7 días, etc)
- ✅ Se generan en servidor (seguro)
- ✅ Solo usuarios autenticados pueden verlas
- ✅ Imposible falsificar sin AWS credentials
- ✅ Auditable por usuario

**Desventajas:**
- Requiere cambios en componentes
- URLs más largas (token en parámetros)

**Riesgo:** ✅ BAJO - Solución segura

**Implementación:**
```javascript
// Servidor genera URL con expiración
const presignedUrl = await getPresignedUrlR2(filePath, 3600); // 1 hora
// Componente recibe URL firmada
// Usuario descarga documento
// URL expira automáticamente
```

---

### ⚠️ Opción 4: Edge Function Supabase (Alternativa Segura)
Similar a presigned URLs pero:
- Usa Edge Function de Supabase
- Validaciones adicionales en servidor
- Logging completo de accesos
- Más control pero más lento

**Riesgo:** BAJO pero más complejidad

---

## Recomendación Final

### ✅ USAR PRESIGNED URLS (Opción 3)

**Por qué:**
1. **Seguridad:** Datos solo accesibles con URL firmada temporal
2. **Auditoría:** Cada acceso es rastreable
3. **Expiración:** URLs inútiles después de tiempo definido
4. **Estándar:** AWS best practice para archivos privados
5. **Confianza:** Adecuado para datos financieros/personales

**Flujo seguro:**
```
1. Usuario (autenticado en app) → Solicita ver documento
2. Servidor valida permisos → Genera presigned URL (1 hora)
3. Componente recibe URL firmada → Renderiza en iframe/viewer
4. Browser descarga de R2 con URL firmada
5. Después de 1 hora → URL expira automáticamente
6. Sin URL válida → Acceso denegado
```

**Tokens en Presigned URLs:**
```
Imposible falsificar porque:
- Incluye firma HMAC-SHA256 con AWS secret key
- Incluye timestamp
- Incluye expiration
- Cambiar cualquier parámetro = firma inválida
```

---

## Implementación Paso a Paso

### 1. Actualizar `src/lib/r2.js`
```javascript
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const getPresignedUrlR2 = async (filePath, expiresIn = 3600) => {
  // expiresIn en segundos: 3600 = 1 hora, 86400 = 24 horas
  let normalizedPath = filePath;
  if (!normalizedPath.startsWith('soportes/')) {
    normalizedPath = `soportes/${normalizedPath}`;
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: normalizedPath,
  });

  return await getSignedUrl(r2Client, command, { expiresIn });
};
```

### 2. Cambiar componentes para usar presigned URLs
- `DocViewerModal.jsx` → await getPresignedUrlR2()
- `BeneficiarioDetailModal.jsx` → await getPresignedUrlR2()
- `AspiranteModal.jsx` → await getPresignedUrlR2()
- etc.

### 3. Mantener `uploadToR2()` y `deleteFromR2()` como está
- Solo generan presigned URLs para lectura
- Upload/delete siguen usando credenciales del servidor

### 4. Configuración de expiración por tipo
```javascript
// Documentos de identidad: 24 horas
getPresignedUrlR2(path, 86400)

// Certificados: 7 días
getPresignedUrlR2(path, 604800)

// Visualización temporal: 1 hora
getPresignedUrlR2(path, 3600)
```

---

## Ventajas Finales

✅ **Seguro:** Datos no están públicos permanentemente
✅ **Auditable:** Sabe quién descargó qué y cuándo
✅ **Escalable:** Funciona con millones de archivos
✅ **Estándar:** Usado por AWS, Google Cloud, Azure
✅ **GDPR compliant:** Control de acceso y expiración
✅ **Costo:** Mismo precio que URLs públicas
✅ **Performance:** Rápido (sin proxy intermedio)

---

## Cronograma Implementación

1. **Hoy:** Actualizar `r2.js` con `getPresignedUrlR2()`
2. **Hoy:** Cambiar componentes principales (DocumentViewers)
3. **Hoy:** Test en dev
4. **Mañana:** Deploy a producción
5. **Monitoreo:** Verificar logs de acceso

**Tiempo total:** 2-3 horas
