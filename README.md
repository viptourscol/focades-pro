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
"# focades-pro" 
