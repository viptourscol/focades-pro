/**
 * resolucionUtils.js
 * Utilidades para generar Resoluciones de Pago FOCADES:
 *  - numALetras: convierte número a texto en español (pesos colombianos)
 *  - generarResolucionDocx: genera blob .docx con la resolución completa
 *  - generarTablaXlsx: exorta tabla de beneficiarios en .xlsx
 */

import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  BorderStyle,
  convertInchesToTwip,
  PageOrientation,
} from 'docx';
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// 1. numALetras — número entero → texto en español (pesos colombianos)
// ---------------------------------------------------------------------------

const _UNI = [
  '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS',
  'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS',
  'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE',
  'VEINTIOCHO', 'VEINTINUEVE',
];
const _DEC = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const _CEN = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function _cientos(n) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  if (n < 30) return _UNI[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return _DEC[d] + (u > 0 ? ' Y ' + _UNI[u] : '');
  }
  const c = Math.floor(n / 100);
  const r = n % 100;
  return _CEN[c] + (r > 0 ? ' ' + _cientos(r) : '');
}

export function numALetras(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  n = Math.round(n);
  if (n === 0) return 'CERO PESOS M/CTE';

  const partes = [];
  const millones = Math.floor(n / 1_000_000);
  const miles    = Math.floor((n % 1_000_000) / 1_000);
  const resto    = n % 1_000;

  if (millones > 0) {
    partes.push(millones === 1 ? 'UN MILLÓN' : _cientos(millones) + ' MILLONES');
  }
  if (miles > 0) {
    partes.push(miles === 1 ? 'MIL' : _cientos(miles) + ' MIL');
  }
  if (resto > 0) {
    partes.push(_cientos(resto));
  }

  return partes.join(' ') + ' PESOS M/CTE';
}

// ---------------------------------------------------------------------------
// 2. Helpers internos docx
// ---------------------------------------------------------------------------

const FONT = 'Times New Roman';
const SIZE = 20; // half-points → 10pt base; párrafos normales usarán 24 (12pt)

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const tableBorder = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const thinBorder  = { style: BorderStyle.SINGLE, size: 2, color: '000000' };

function par(text, { bold = false, center = false, size = 24, spaceAfter = 100, spaceBefore = 0, italic = false } = {}) {
  return new Paragraph({
    alignment: center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    spacing: { after: spaceAfter, before: spaceBefore },
    children: [
      new TextRun({ text, font: FONT, size, bold, italic }),
    ],
  });
}

function parRuns(runs, { center = false, spaceAfter = 100, spaceBefore = 0 } = {}) {
  return new Paragraph({
    alignment: center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    spacing: { after: spaceAfter, before: spaceBefore },
    children: runs.map((r) =>
      new TextRun({ font: FONT, size: 24, ...r })
    ),
  });
}

function cell(text, { bold = false, center = false, shade = false, small = false, borders = null } = {}) {
  const usedBorders = borders || {
    top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
  };
  return new TableCell({
    borders: usedBorders,
    shading: shade ? { fill: 'D9D9D9' } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({ text: String(text ?? ''), font: FONT, size: small ? 16 : 20, bold }),
        ],
      }),
    ],
  });
}

function headerCell(text) {
  return cell(text, { bold: true, center: true, shade: true });
}

// ---------------------------------------------------------------------------
// 3. generarResolucionDocx
// ---------------------------------------------------------------------------

/**
 * @param {Object} data
 * @param {string}   data.resolucion_numero
 * @param {string}   data.fecha_resolucion         e.g. "16 de marzo de 2026"
 * @param {string}   data.convocatoria             nombre de la convocatoria
 * @param {string}   data.periodo_pago_texto        e.g. "Primer Semestre 2025"
 * @param {number}   data.total_admitidos_convocatoria
 * @param {number}   data.admitidos_suenos
 * @param {number}   data.admitidos_merito
 * @param {Array}    data.filas                    cada fila: { nombre_completo, tipo_documento, n_documento,
 *                                                              cuenta_bancaria, banco, tipo_cuenta,
 *                                                              control_pagos_texto, modalidad, valor_a_pagar }
 * @param {number}   data.valor_total              suma total
 * @param {string}   data.valor_total_letras       texto de numALetras
 * @returns {Promise<Blob>}
 */
export async function generarResolucionDocx(data) {
  const {
    resolucion_numero = '',
    fecha_resolucion = '',
    convocatoria = '',
    periodo_pago_texto = '',
    total_admitidos_convocatoria = 0,
    admitidos_suenos = 0,
    admitidos_merito = 0,
    filas = [],
    valor_total = 0,
    valor_total_letras = '',
  } = data;

  const fmtPesos = (n) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

  // --- Tabla de beneficiarios ---
  const colWidths = [4, 18, 5, 10, 12, 12, 6, 8, 13, 12]; // %, sum=100

  const toTwips = (pct) => Math.round((convertInchesToTwip(9.5) * pct) / 100);

  const tableRows = [
    // Fila de categoría
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 10,
          borders: { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder },
          shading: { fill: 'D9D9D9' },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'MODALIDAD: SUEÑOS Y MÉRITO EDUCATIVO', font: FONT, size: 18, bold: true })],
            }),
          ],
        }),
      ],
    }),
    // Fila de encabezados
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('No.'),
        headerCell('APELLIDOS Y NOMBRE'),
        headerCell('TIPO'),
        headerCell('ID'),
        headerCell('CUENTA'),
        headerCell('BANCO'),
        headerCell('TIPO'),
        headerCell('CONTROL'),
        headerCell('MODALIDAD'),
        headerCell('VALOR'),
      ],
    }),
    // Filas de datos
    ...filas.map((f, idx) =>
      new TableRow({
        children: [
          cell(idx + 1, { center: true, small: true }),
          cell(f.nombre_completo, { small: true }),
          cell(f.tipo_documento, { center: true, small: true }),
          cell(f.n_documento, { center: true, small: true }),
          cell(f.cuenta_bancaria, { small: true }),
          cell(f.banco, { small: true }),
          cell(f.tipo_cuenta, { center: true, small: true }),
          cell(f.control_pagos_texto, { center: true, small: true }),
          cell(f.modalidad, { small: true }),
          cell(fmtPesos(f.valor_a_pagar || 0), { center: true, small: true }),
        ],
      })
    ),
    // Filas vacías de espaciado (mínimo 5 para que no quede muy justo)
    ...Array.from({ length: Math.max(0, 5 - filas.length) }, () =>
      new TableRow({
        children: colWidths.map(() => cell('')),
      })
    ),
    // Fila TOTAL
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 9,
          borders: { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder },
          shading: { fill: 'D9D9D9' },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'TOTAL', font: FONT, size: 20, bold: true })],
            }),
          ],
        }),
        cell(fmtPesos(valor_total), { bold: true, center: true }),
      ],
    }),
  ];

  const benefTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: colWidths.map(toTwips),
    rows: tableRows,
  });

  // --- Construir documento ---
  const children = [
    // Título
    par(`RESOLUCIÓN No. ${resolucion_numero}`, { bold: true, center: true, size: 28, spaceBefore: 0, spaceAfter: 60 }),
    par(fecha_resolucion, { center: true, size: 24, spaceAfter: 200 }),

    // Objeto de la resolución
    par(
      `POR LA CUAL EL "FONDO EDUCATIVO PARA LA EDUCACIÓN SUPERIOR –FOCADES", ORDENA PAGAR CRÉDITOS EDUCATIVOS CONDONABLES CORRESPONDIENTES A LOS BENEFICIARIOS QUE FUERON SELECCIONADOS EN LA CONVOCATORIA ${convocatoria}, EN EL ${periodo_pago_texto.toUpperCase()} EN LAS MODALIDADES DE SUEÑOS Y MÉRITO EDUCATIVO.`,
      { bold: true, center: true, size: 22, spaceAfter: 200 }
    ),

    // Base legal
    par(
      'El alcalde del municipio de Montelíbano, en ejercicio de sus facultades, constitucionales y legales, especialmente las establecidas en los artículos 2°, 67, 45, 209, de la constitución política, artículo segundo de la Ley 1012 de 2006, acuerdo Municipal 014 de 4 de septiembre de 2020, y las demás normas constitucionales y legales, y',
      { spaceAfter: 160 }
    ),

    // CONSIDERANDO
    par('CONSIDERANDO', { bold: true, center: true, size: 26, spaceAfter: 100 }),

    par(
      `Que en el año ${convocatoria} se realizó la convocatoria para los nuevos beneficiarios del Programa FOCADES, de los cuales fueron admitidos ${total_admitidos_convocatoria} jóvenes: para Sueño Educativo ${admitidos_suenos} beneficiarios y Mérito Educativo ${admitidos_merito} beneficiarios.`,
      { spaceAfter: 120 }
    ),

    par(
      `Que los beneficiarios a continuación actualizaron sus matrículas para el periodo ${periodo_pago_texto} según requisitos de los Acuerdos No. 011 del 2024 y No. 016 de 2020.`,
      { spaceAfter: 120 }
    ),

    par(
      'Que se hace necesario hacerles desembolsos, toda vez que ellos hayan aportado los documentos pertinentes al proceso de actualización de la matrícula de cada semestre.',
      { spaceAfter: 120 }
    ),

    par('Por lo anteriormente expuesto:', { spaceAfter: 160 }),

    // RESUELVE
    par('RESUELVE', { bold: true, center: true, size: 26, spaceAfter: 100 }),

    // Artículo Primero
    parRuns([
      { text: 'ARTÍCULO PRIMERO: ', bold: true },
      {
        text: `Realizar pago del ${periodo_pago_texto}, a los beneficiarios que fueron seleccionados en la convocatoria FOCADES ${convocatoria}, los cuales se encuentran ingresados al programa en la "Modalidad de Sueño y Mérito Educativo"; y que se encontraban matriculados y cumplían requisitos en el semestre ${periodo_pago_texto}, relacionados a continuación por valor de: `,
      },
      { text: `${valor_total_letras} (${fmtPesos(valor_total)})`, bold: true },
    ], { spaceAfter: 140 }),

    // Tabla
    benefTable,

    // Artículo Segundo
    new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }),
    parRuns([
      { text: 'ARTICULO SEGUNDO: ', bold: true },
      {
        text: 'Contra la presente Resolución procede el recurso de Reposición y apelación, el cual deberá ser interpuesto ante el Comité Administrativo del FOCADES durante los 5 días hábiles siguientes a la publicación de esta.',
      },
    ], { spaceAfter: 120 }),

    // Artículo Tercero
    parRuns([
      { text: 'ARTÍCULO TERCERO: ', bold: true },
      { text: 'la presente Resolución rige a partir de la fecha de su publicación.' },
    ], { spaceAfter: 200 }),

    // Cierre
    par('COMUNÍQUESE, PUBLÍQUESE Y CÚMPLASE', { bold: true, center: true, spaceAfter: 200 }),
    par(`Dada en Montelíbano, a los ${fecha_resolucion}.`, { center: true, spaceAfter: 600 }),

    // Firma
    par('____________________________', { center: true, spaceAfter: 40 }),
    par('GABRIEL ALBERTO CALLE DEMOYA', { bold: true, center: true, spaceAfter: 40 }),
    par('ALCALDE MUNICIPAL', { center: true, spaceAfter: 80 }),
    par('Revisó: Edilberto Arroyave', { spaceAfter: 40 }),
    par('Proyectó: MJV', { spaceAfter: 0 }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
              width: convertInchesToTwip(11),
              height: convertInchesToTwip(8.5),
            },
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.5),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

// ---------------------------------------------------------------------------
// 4. generarTablaXlsx
// ---------------------------------------------------------------------------

/**
 * @param {Array}  filas      filas de beneficiarios (misma estructura que generarResolucionDocx)
 * @param {Object} metadata   { resolucion_numero, convocatoria, periodo }
 */
export function generarTablaXlsx(filas, metadata = {}) {
  const { resolucion_numero = '', convocatoria = '', periodo = '' } = metadata;

  const fmtPesos = (n) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n ?? 0);

  const headers = [
    'No.', 'APELLIDOS Y NOMBRE', 'TIPO DOC.', 'DOCUMENTO',
    'CUENTA', 'BANCO', 'TIPO CTA.', 'CONTROL', 'MODALIDAD', 'VALOR A PAGAR',
  ];

  const dataRows = filas.map((f, i) => [
    i + 1,
    f.nombre_completo       ?? '',
    f.tipo_documento        ?? '',
    f.n_documento           ?? '',
    f.cuenta_bancaria       ?? '',
    f.banco                 ?? '',
    f.tipo_cuenta           ?? '',
    f.control_pagos_texto   ?? '',
    f.modalidad             ?? '',
    f.valor_a_pagar         ?? 0,
  ]);

  const totalRow = ['', '', '', '', '', '', '', '', 'TOTAL',
    filas.reduce((s, f) => s + (f.valor_a_pagar || 0), 0)];

  const wsData = [
    [`FOCADES – RESOLUCIÓN DE PAGO No. ${resolucion_numero}`],
    [`Convocatoria: ${convocatoria}`],
    [`Periodo: ${periodo}`],
    [],
    headers,
    ...dataRows,
    [],
    totalRow,
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 5 }, { wch: 35 }, { wch: 10 }, { wch: 14 },
    { wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 12 },
    { wch: 22 }, { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Beneficiarios');
  XLSX.writeFile(wb, `Resolucion-${resolucion_numero || 'pago'}.xlsx`);
}
