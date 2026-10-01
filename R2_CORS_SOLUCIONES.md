# Soluciones para Error CORS en R2

## Problema
Error: "focades-pro.82fdb4a6fd4628d720932bee674b6f7d.r2.dev utiliza un protocolo no compatible"

El dominio `.r2.dev` de Cloudflare tiene restricciones CORS que impiden que navegadores accedan directamente.

---

## Solución 1: Cloudflare Worker Proxy (RECOMENDADO)

### Paso 1: Instalar Wrangler
```bash
npm install -g wrangler
# o si está en el proyecto
npm install -D wrangler
```

### Paso 2: Autenticar
```bash
wrangler login
```

### Paso 3: Deploy del Worker
```bash
wrangler deploy
```

El Worker estará disponible en:
```
https://focades-pro-r2-proxy.tuacuenta.workers.dev/r2/soportes/...
```

### Paso 4: Actualizar .env
```env
VITE_R2_PUBLIC_URL=https://focades-pro-r2-proxy.tuacuenta.workers.dev/r2
```

---

## Solución 2: Custom Domain en R2 (Alternativa)

1. En Cloudflare Dashboard → R2 → focades-pro bucket
2. Ir a Settings → Custom Domain
3. Agregar un dominio (ej: `r2.focades-pro.com` o `assets.focades-pro.com`)
4. El dominio debe estar en una zona DNS de Cloudflare
5. Actualizar .env:
```env
VITE_R2_PUBLIC_URL=https://r2.focades-pro.com
```

---

## Solución 3: Presigned URLs con Expiración Larga (Temporal)

Si no se puede deployar Worker, usar presigned URLs en lugar de URLs públicas directas:

En `src/lib/r2.js`:
```javascript
import { getSignedUrl } = from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const getPresignedUrlR2 = async (filePath, expiresIn = 604800) => {
  // expiresIn: 604800 segundos = 7 días
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: filePath,
  });
  return await getSignedUrl(r2Client, command, { expiresIn });
};
```

Entonces cambiar componentes a usar `getPresignedUrlR2()` en lugar de `getPublicUrlR2()`.

---

## Recomendación Inmediata

**Usar Solución 1 (Worker)** porque:
- ✅ No requiere cambios de dominio
- ✅ Agrega CORS headers automáticamente
- ✅ Caché en Cloudflare por performance
- ✅ Fácil de deployar
- ✅ Seguro (sin exponer credentials)

Después de deployar el Worker, actualizar:
- `.env` → VITE_R2_PUBLIC_URL
- `src/lib/r2.js` para usar la nueva URL
- Rebuild: `npm run build`
