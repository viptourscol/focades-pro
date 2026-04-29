# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Mock local HTML -> PDF (pruebas de contrato)

Inicia el mock:

```bash
npm run mock:html-pdf
```

Healthcheck:

```bash
curl http://localhost:8789/health
```

Probar respuesta PDF binaria:

```bash
curl -X POST http://localhost:8789/render \
	-H "Content-Type: application/json" \
	-d '{"title":"Prueba","html":"<h1>Hola</h1><p>Contrato HTML a PDF</p>"}' \
	--output prueba.pdf
```

Probar respuesta JSON con `pdf_base64`:

```bash
curl -X POST "http://localhost:8789/render?format=json" \
	-H "Content-Type: application/json" \
	-d '{"title":"Prueba","html":"<p>Contrato JSON</p>"}'
```

Variables recomendadas para la Edge Function durante pruebas:

- `DOCS_RENDER_ENGINE=html_pdf`
- `DOCS_RENDER_FALLBACK_TO_PDF_LIB=true`
- `DOCS_HTML_PDF_ENDPOINT=http://host.docker.internal:8789/render` (si la función corre en contenedor)
- `DOCS_HTML_PDF_TIMEOUT_MS=12000`

## Generación de PDFs con Google Docs + GAS

La generación de documentos automáticos ahora puede ejecutarse con Google Apps Script
usando plantillas de Google Docs y devolviendo PDFs para almacenar en Supabase Storage.

Variables requeridas/recomendadas:

- `DOCS_GAS_ENABLED=true`
- `DOCS_GAS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec`
- `DOCS_GAS_API_KEY=...` (opcional, si el Web App valida API key)
- `DOCS_GAS_SHARED_SECRET=...` (opcional, para validación adicional)
- `DOCS_GAS_TIMEOUT_MS=20000`
- `DOCS_GAS_FALLBACK_LOCAL=true` (solo aplica a `generate-inscripcion-docs`)

Template IDs opcionales por tipo de documento:

- `DOCS_GAS_TEMPLATE_FORMULARIO_ID=...`
- `DOCS_GAS_TEMPLATE_TERMINOS_ID=...`
- `DOCS_GAS_TEMPLATE_DATOS_ID=...`
- `DOCS_GAS_TEMPLATE_HISTORICOS_TERMINOS_ID=...`
- `DOCS_GAS_TEMPLATE_HISTORICOS_DATOS_ID=...`

Funciones involucradas:

- `generate-inscripcion-docs` (aspirantes)
- `generate-beneficiario-onboarding-docs` (beneficiarios históricos onboarding)
