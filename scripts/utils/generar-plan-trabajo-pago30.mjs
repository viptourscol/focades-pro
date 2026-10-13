import fs from 'fs';
import path from 'path';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } from 'docx';

const outDir = path.resolve('docs/plan_trabajo_pago_30');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function saveDoc(doc, fileName) {
  return Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync(path.join(outDir, fileName), buffer);
    console.log('Wrote', fileName);
  });
}

function heading(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
  });
}

function normal(text) {
  return new Paragraph({ children: [new TextRun(text)] });
}

async function main() {
  // Plan de Trabajo - documento principal
  const docPlan = new Document({ sections: [{ properties: {}, children: [
    new Paragraph({ text: 'PLAN DE TRABAJO — PROPUESTA DE PAGO (Contratista)', heading: HeadingLevel.TITLE }),
    normal('Objeto: Plan de Trabajo y entregables exigidos para la validación y pago parcial (30%) en ambiente de pruebas (Staging).'),
    normal('Validez de la oferta: Treinta (30) días calendario.'),
    heading('Cláusula de pagos (texto contractual — incluir tal cual en el documento)'),
    normal('Anticipo: 40% a la firma del acta de inicio (contra entrega de cronograma y plan de trabajo).'),
    normal('Pago Parcial: 30% contra la entrega en ambiente de pruebas (Staging) de los módulos de software y el avance físico del archivo.'),
    normal('Pago Final: 30% a la entrega del software en producción, instalación de hardware, terminación del archivo documental y finalización de las capacitaciones (Acta de recibo a satisfacción).'),
    heading('Forma de pago (texto para la invitación / propuesta)'),
    normal('FORMA DE PAGO PLANTEADA: El Municipio cancelará al contratista el valor pactado de la siguiente manera:'),
    normal('1. Primer pago: 40% tras la firma del acta de inicio y legalización del contrato.'),
    normal('2. Segundo pago: 30% en la entrega del plan de trabajo y diseño de arquitectura del software debidamente aprobado por la supervisión, junto con la entrega a satisfacción de los suministros de hardware (Computador All in One e Impresora) y expedición de recibo satisfactorio.'),
    normal('3. Último pago: 30% una vez se cumpla con el 100% de las especificaciones y obligaciones contratadas, previo recibo a satisfacción por parte del supervisor designado.'),
    heading('Entregables mínimos para reclamar el Pago Parcial (30%)'),
    normal('1. Cronograma y Plan de Trabajo firmado: Copia del cronograma actualizado y plan de trabajo aprobado y firmado por el contratista y la supervisión (acta/firmas).'),
    normal('2. Diseño de Arquitectura del Software: Documento técnico (diagrama, componentes, servicios, datos, seguridad y despliegue) aprobado por la supervisión.'),
    normal('3. Entrega en Staging: URL(s) y acceso temporal (usuario de supervisión) al ambiente de pruebas con los módulos desplegados.'),
    normal('4. Evidencia de Migración/Importación: Informe de migración con logs, resumen del volumen importado y comprobante de pruebas de integridad.'),
    normal('5. Entrega de Suministros de Hardware: Acta o comprobante de entrega y ubicación del Computador All in One e Impresora; fotografías con fecha y responsable receptor; inventario firmado.'),
    normal('6. Avance físico del archivo documental: Fotografías datadas del archivo físico, reporte del estado actual y plan de actividades pendientes.'),
    normal('7. Evidencia de pruebas funcionales: Resultado de pruebas de aceptación en Staging (checklist firmado por el supervisor o evidencias por módulo).'),
    normal('8. Acta de entrega a satisfacción parcial (Staging): Acta o reporte firmado por la supervisión.'),
    normal('9. Factura y documentación de cumplimiento legal: Factura por el monto correspondiente al 30%; certificados de seguridad social y aportes parafiscales al día; RUT o documento fiscal requerido.'),
    normal('10. Procedimiento de control: Instrucciones y credenciales para validar despliegue y contacto técnico para validación.'),
    heading('Checklist resumido (para entrega física/virtual)'),
    normal('- Cronograma y Plan de Trabajo firmado'),
    normal('- Diseño de arquitectura aprobado'),
    normal('- Acceso a Staging + lista de URL/módulos'),
    normal('- Informe de migración y logs'),
    normal('- Acta/comprobante de entrega de hardware + fotos'),
    normal('- Evidencia de avance físico del archivo + fotos'),
    normal('- Resultados de pruebas y checklist firmado'),
    normal('- Acta de recepción parcial (Staging) firmado'),
    normal('- Factura + certificados de seguridad social/parafiscales'),
    normal('- Credenciales/procedimiento para verificación'),
    heading('Proceso de solicitud de pago'),
    normal('1. Remitir paquete de entregables por correo oficial y/o plataforma de supervisión.'),
    normal('2. Solicitar ventana de verificación con fechas propuestas.'),
    normal('3. Supervisión realiza verificación en la ventana acordada.'),
    normal('4. Emisión de Acta de Recepción Parcial a Satisfacción si cumple criterios.'),
    normal('5. Contratista envía factura y documentos legales.'),
    normal('6. Municipio procesa pago según términos.'),
  ]}] });

  // Annex A: Cronograma (tabla con hitos)
  const cronogramaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ text: 'Hito', heading: HeadingLevel.HEADING_3 })] }),
        new TableCell({ children: [new Paragraph({ text: 'Fecha inicio', heading: HeadingLevel.HEADING_3 })] }),
        new TableCell({ children: [new Paragraph({ text: 'Fecha fin', heading: HeadingLevel.HEADING_3 })] }),
        new TableCell({ children: [new Paragraph({ text: 'Responsable', heading: HeadingLevel.HEADING_3 })] }),
        new TableCell({ children: [new Paragraph({ text: 'Descripción', heading: HeadingLevel.HEADING_3 })] }),
      ] }),
      new TableRow({ children: [
        new TableCell({ children: [normal('Inicio y legalización del contrato')]}),
        new TableCell({ children: [normal('2026-08-01')]}),
        new TableCell({ children: [normal('2026-08-05')]}),
        new TableCell({ children: [normal('Contratista / Municipio')]}),
        new TableCell({ children: [normal('Firma de acta de inicio y legalización del contrato')]}),
      ] }),
      new TableRow({ children: [
        new TableCell({ children: [normal('Plan de trabajo y diseño de arquitectura')]}),
        new TableCell({ children: [normal('2026-08-06')]}),
        new TableCell({ children: [normal('2026-08-12')]}),
        new TableCell({ children: [normal('Contratista / Supervisor')]}),
        new TableCell({ children: [normal('Entrega del plan de trabajo y documento de arquitectura para aprobación')]}),
      ] }),
      new TableRow({ children: [
        new TableCell({ children: [normal('Despliegue en Staging + Migración inicial')]}),
        new TableCell({ children: [normal('2026-08-13')]}),
        new TableCell({ children: [normal('2026-08-25')]}),
        new TableCell({ children: [normal('Contratista / Supervisor')]}),
        new TableCell({ children: [normal('Despliegue de módulos y ejecución de migración de datos con pruebas')]}),
      ] }),
      new TableRow({ children: [
        new TableCell({ children: [normal('Entrega de hardware e inventario')]}),
        new TableCell({ children: [normal('2026-08-20')]}),
        new TableCell({ children: [normal('2026-08-22')]}),
        new TableCell({ children: [normal('Proveedor / Municipio')]}),
        new TableCell({ children: [normal('Recepción de Computador All in One e Impresora y acta de entrega')]}),
      ] }),
      new TableRow({ children: [
        new TableCell({ children: [normal('Pruebas de aceptación en Staging')]}),
        new TableCell({ children: [normal('2026-08-26')]}),
        new TableCell({ children: [normal('2026-08-30')]}),
        new TableCell({ children: [normal('Supervisor')]}),
        new TableCell({ children: [normal('Ejecución del checklist de pruebas y firma del acta parcial')]}),
      ] }),
    ],
  });

  const docA = new Document({ sections: [{ children: [
    new Paragraph({ text: 'Anexo A: Cronograma detallado (Gantt / Tabla)', heading: HeadingLevel.HEADING_1 }),
    normal('A continuación se presenta el cronograma con hitos, fechas y responsables.'),
    cronogramaTable,
  ]}] });

  // Annex B: Diagrama de Arquitectura - generar SVG simple y referenciar
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600">
  <rect x="50" y="50" width="200" height="80" fill="#f3f4f6" stroke="#111827" />
  <text x="150" y="95" font-size="14" text-anchor="middle" fill="#111827">Frontend (React + Vite)</text>
  <rect x="400" y="50" width="220" height="80" fill="#eef2ff" stroke="#1e293b" />
  <text x="510" y="95" font-size="14" text-anchor="middle" fill="#0f172a">Edge Functions / API (Deno)</text>
  <rect x="400" y="200" width="220" height="80" fill="#ecfdf5" stroke="#065f46" />
  <text x="510" y="245" font-size="14" text-anchor="middle" fill="#064e3b">Supabase (Postgres, Storage)</text>
  <rect x="50" y="200" width="200" height="80" fill="#fff7ed" stroke="#92400e" />
  <text x="150" y="245" font-size="14" text-anchor="middle" fill="#92400e">Admin / Consola</text>
  <!-- arrows -->
  <line x1="250" y1="90" x2="400" y2="90" stroke="#111827" marker-end="url(#arrow)" />
  <line x1="510" y1="130" x2="510" y2="200" stroke="#111827" marker-end="url(#arrow)" />
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#111827" />
    </marker>
  </defs>
</svg>`;

  const svgPath = path.join(outDir, 'DIAGRAMA_ARQUITECTURA.svg');
  fs.writeFileSync(svgPath, svgContent, 'utf8');

  const docB = new Document({ sections: [{ children: [
    new Paragraph({ text: 'Anexo B: Diagrama de Arquitectura', heading: HeadingLevel.HEADING_1 }),
    normal('Se adjunta el diagrama de arquitectura en formato SVG en la misma carpeta:'),
    normal('DIAGRAMA_ARQUITECTURA.svg'),
    normal('Descripción: Frontend (React + Vite) → Edge Functions/Deno → Supabase (Postgres, Storage). Administración y consolas conectadas.'),
  ]}] });

  // Annex C: Acta de Recepción Parcial (template)
  const docC = new Document({ sections: [{ children: [
    new Paragraph({ text: 'Anexo C: Acta de Recepción Parcial (Staging) - Plantilla', heading: HeadingLevel.HEADING_1 }),
    normal('Lugar y fecha:'),
    normal('Supervisor:'),
    normal('Contratista:'),
    normal('Descripción de entregables verificados:'),
    normal('Observaciones:'),
    normal('Conclusión: Se recibe a satisfacción / Se recibe con observaciones (marcar).'),
    normal('Firmas:'),
    normal('__________________________  __________________________'),
    normal('Supervisor                         Contratista'),
  ]}] });

  // Annex D: Checklist de pruebas por módulo
  const docD = new Document({ sections: [{ children: [
    new Paragraph({ text: 'Anexo D: Checklist de Pruebas por Módulo', heading: HeadingLevel.HEADING_1 }),
    normal('Módulo: Onboarding - Pruebas: Registro, generación de tokens, generación de documentos.'),
    normal('Módulo: Migración - Pruebas: Importación lote, integridad de datos, muestreo.'),
    normal('Módulo: Administración - Pruebas: Gestión de beneficiarios, tokens, actualizaciones.'),
    normal('Módulo: Historial - Pruebas: Consulta, filtros, exportación de documentos.'),
    normal('Módulo: Reportes - Pruebas: Visualización, filtros, exportación.'),
  ]}] });

  await saveDoc(docPlan, 'PLAN_DE_TRABAJO_PROPUESTA_PAGO_CONTRATISTA.docx');
  await saveDoc(docA, 'ANEXO_A_CRONOGRAMA_PLACEHOLDER.docx');
  await saveDoc(docB, 'ANEXO_B_DIAGRAMA_ARQUITECTURA_PLACEHOLDER.docx');
  await saveDoc(docC, 'ANEXO_C_ACTA_RECEPCION_PARCIAL_TEMPLATE.docx');
  await saveDoc(docD, 'ANEXO_D_CHECKLIST_PRUEBAS.docx');
  // Annex E: Metodología y Plan Detallado de Ejecución (ANEXO 1)
  const docE = new Document({ sections: [{ children: [
    new Paragraph({ text: 'ANEXO 1: METODOLOGÍA Y PLAN DETALLADO DE EJECUCIÓN', heading: HeadingLevel.TITLE }),
    normal('El presente anexo describe la metodología de trabajo, las fases de ejecución y los entregables que garantizarán el cumplimiento de los cuatro (4) componentes del proyecto dentro del plazo de dos (2) meses (60 días calendario) estipulado en la propuesta.'),
    heading('Metodología general'),
    normal('Para asegurar el éxito del proyecto "FOCADES", la ejecución se dividirá en cuatro (4) fases secuenciales e integrales:'),
    heading('FASE 1: PLANEACIÓN, INGENIERÍA DE REQUISITOS Y DIAGNÓSTICO'),
    normal('Esta fase inicia inmediatamente después de la firma del Acta de Inicio. Su objetivo es alinear las expectativas y preparar el terreno físico y digital.'),
    normal('- En el componente de Software: Se realizarán mesas de trabajo con la Secretaría de Educación para levantar los requerimientos funcionales exactos del programa FOCADES. Se diseñarán los Wireframes (bocetos) de la interfaz de usuario (Front-end) y se definirá la estructura de la base de datos (Back-end) para gestionar a los estudiantes.'),
    normal('- En el componente de Archivo: El Coordinador Archivístico realizará un diagnóstico del volumen documental histórico (carpetas de estudiantes de años anteriores) y estructurará el Plan de Trabajo Archivístico.'),
    heading('FASE 2: DESARROLLO TECNOLÓGICO E INTERVENCIÓN FÍSICA'),
    normal('- Desarrollo Full-Stack (Sprints de programación): Programación del aplicativo web. Creación de los módulos de:'),
    normal('- Intervención Documental: Los Auxiliares de Archivo, bajo la supervisión del Coordinador, ejecutarán los procesos de limpieza, ordenación, foliación y rotulación de los expedientes físicos del FOCADES, dejándolos listos para su posterior consulta o digitalización.'),
    normal('- Gestión de Hardware: Proceso de compra, transporte y recepción del equipo All In One y la impresora multifuncional solicitada en los estudios previos.'),
    heading('FASE 3: PRUEBAS (QA), DESPLIEGUE E INSTALACIÓN'),
    normal('- Ambiente de Pruebas (Staging): Se habilitará el software en un servidor de pruebas para que la Secretaría de Educación valide su funcionamiento, reporte ajustes y verifique la lógica del sistema.'),
    normal('- Puesta en Nube (Cloud): Una vez aprobado, el sistema se desplegará en el servidor en la nube definitivo (arquitectura escalable y segura), activando los certificados de seguridad SSL y programando los Backups automatizados.'),
    normal('- Instalación en sitio: Instalación física, configuración en red y pruebas de impresión del computador y la impresora en la oficina designada por la Alcaldía.'),
    heading('FASE 4: APROPIACIÓN TECNOLÓGICA Y GO-LIVE'),
    normal('- El software entra en producción y se ejecuta la transferencia de conocimiento para garantizar que la plataforma no quede en desuso.'),
    normal('- Formación a Funcionarios (20 horas).'),
    normal('- Material para Estudiantes: Entrega oficial del videotutorial o guía digital interactiva, diseñados para enseñar a los jóvenes cómo registrarse y subir sus documentos a la plataforma sin cometer errores.'),
    normal('- Cierre Archivístico: Entrega del inventario documental (FUID) firmado y las carpetas físicas organizadas según la norma del Archivo General de la Nación.'),
    heading('RESUMEN DE ENTREGABLES FINALES'),
    normal('Al finalizar el mes 2 (previo a la firma del Acta de Recibo a Satisfacción), el contratista hará entrega formal de:'),
    normal('1. Aplicativo Web FOCADES en funcionamiento, con acceso para roles de administrador y estudiantes.'),
    normal('2. Credenciales de acceso al panel de administración del servidor en la nube.'),
    normal('3. Código fuente de la aplicación web.'),
    normal('4. Un (1) Computador All In One y una (1) Impresora Multifuncional instalados y configurados.'),
    normal('5. Fondo documental físico del programa FOCADES debidamente intervenido, foliado y registrado en el Formato Único de Inventario Documental (FUID).'),
    normal('6. Planillas de asistencia de las capacitaciones impartidas (20 horas).'),
    normal('7. Un (1) Videotutorial/Guía digital orientado a los estudiantes.'),
    heading('Declaración de conformidad'),
    normal('El presente Anexo 1 sirve como Plan de Trabajo para cumplir con las obligaciones contractuales y podrá incorporarse al paquete de entregables del contrato como evidencia formal de la metodología y el cronograma de ejecución.'),
  ]}] });
  await saveDoc(docE, 'ANEXO_1_METODOLOGIA_PLAN_DE_EJECUCION.docx');
  console.log('All documents generated in', outDir);
}

main().catch((err) => { console.error(err); process.exit(1); });
