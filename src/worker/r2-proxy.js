/**
 * Cloudflare Worker para servir archivos de R2 con CORS headers
 * 
 * Deployment:
 * 1. npx wrangler deploy
 * 2. Configurar route en wrangler.toml: route = "example.com/r2/*"
 * 3. Usar URLs como: https://example.com/r2/soportes/beneficiarios/.../file.pdf
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Extraer la ruta del archivo desde el path /r2/soportes/...
    // Transformar https://example.com/r2/soportes/... 
    // en: s3://bucket-name/soportes/...
    const path = url.pathname.replace(/^\/r2\//, '');
    
    if (!path || path === '/') {
      return new Response('Not Found', { status: 404 });
    }

    try {
      // Obtener objeto de R2
      const object = await env.R2_BUCKET.get(path);

      if (!object) {
        return new Response('File not found', { status: 404 });
      }

      // Crear headers con CORS
      const headers = new Headers({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${path.split('/').pop()}"`,
        'Cache-Control': 'public, max-age=86400', // Cache 24h
      });

      // Si el objeto tiene metadata, usarla
      if (object.httpMetadata) {
        if (object.httpMetadata.cacheControl) {
          headers.set('Cache-Control', object.httpMetadata.cacheControl);
        }
        if (object.httpMetadata.contentDisposition) {
          headers.set('Content-Disposition', object.httpMetadata.contentDisposition);
        }
      }

      return new Response(object.body, {
        status: 200,
        headers,
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  },
};
