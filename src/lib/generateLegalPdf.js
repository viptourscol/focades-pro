import { jsPDF } from 'jspdf'
import { TERMS_AND_CONDITIONS_TEXT, DATA_POLICY_TEXT } from './legalTexts'

/**
 * Genera un PDF con el texto legal de consentimiento y los datos del beneficiario.
 * @param {'terminos'|'datos'} tipo
 * @param {string} nombreCompleto
 * @param {string} cedula
 * @param {string} fechaAceptacion  – ISO string o Date
 * @returns {Blob} PDF blob listo para subir a Storage
 */
export function generateLegalPdf(tipo, nombreCompleto, cedula, fechaAceptacion) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginLeft = 20
  const marginRight = 20
  const usableWidth = pageWidth - marginLeft - marginRight
  let y = 25

  // ── Encabezado ──────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('FONDO EDUCATIVO PARA EL APOYO DE LA EDUCACIÓN SUPERIOR', pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Municipio de Montelíbano — FOCADES', pageWidth / 2, y, { align: 'center' })
  y += 10

  // ── Línea separadora ───────────────────────────────────────────────────
  doc.setDrawColor(180)
  doc.setLineWidth(0.3)
  doc.line(marginLeft, y, pageWidth - marginRight, y)
  y += 8

  // ── Título del documento ────────────────────────────────────────────────
  const lines = tipo === 'terminos' ? TERMS_AND_CONDITIONS_TEXT : DATA_POLICY_TEXT
  const title = lines[0] // primera línea es el título

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  const titleLines = doc.splitTextToSize(title, usableWidth)
  doc.text(titleLines, pageWidth / 2, y, { align: 'center' })
  y += titleLines.length * 5 + 6

  // ── Cuerpo ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)

  for (let i = 1; i < lines.length; i++) {
    const wrapped = doc.splitTextToSize(lines[i], usableWidth)
    // Salto de página si no cabe
    if (y + wrapped.length * 4.5 > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      y = 25
    }
    doc.text(wrapped, marginLeft, y)
    y += wrapped.length * 4.5 + 3
  }

  // ── Bloque de aceptación ────────────────────────────────────────────────
  const fecha = new Date(fechaAceptacion)
  const fechaStr = fecha.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  if (y + 40 > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage()
    y = 25
  }

  y += 8
  doc.setDrawColor(180)
  doc.line(marginLeft, y, pageWidth - marginRight, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('DATOS DE ACEPTACIÓN', marginLeft, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(`Nombre completo:  ${nombreCompleto}`, marginLeft, y)
  y += 5.5
  doc.text(`Documento:  ${cedula}`, marginLeft, y)
  y += 5.5
  doc.text(`Fecha y hora de aceptación:  ${fechaStr}`, marginLeft, y)
  y += 5.5
  doc.text('Medio de aceptación:  Plataforma digital FOCADES Pro', marginLeft, y)
  y += 10

  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(
    'Este documento fue generado automáticamente por la plataforma FOCADES Pro al momento de la aceptación electrónica.',
    pageWidth / 2,
    y,
    { align: 'center' },
  )

  return doc.output('blob')
}
