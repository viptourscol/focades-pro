// @ts-nocheck
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import type { RenderContext } from '../document-model.ts';
import { FOOTER_LINE_1, FOOTER_LINE_2, LEGAL_DOC_TYPES } from '../templates.ts';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const NON_JUSTIFIED_LINES = [
  'ALCALDÍA MUNICIPAL DE MONTELÍBANO',
  'Nit No. 800096763-5',
  'SECRETARÍA DE EDUCACIÓN',
  'En constancia de mi aceptación, firmo el presente documento.',
  'SELLO DE TIEMPO Y VERIFICACIÓN ELECTRÓNICA',
  'Fecha y Hora de la Firma (UTC):',
  'Sello de Integridad de Datos (SHA-256):',
];

const wrapTextByWidth = (text: string, font: any, fontSize: number, maxWidth: number) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(attempt, fontSize) <= maxWidth) {
      current = attempt;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    let partial = '';
    for (const character of word) {
      const characterAttempt = `${partial}${character}`;
      if (font.widthOfTextAtSize(characterAttempt, fontSize) <= maxWidth) {
        partial = characterAttempt;
      } else if (partial) {
        lines.push(partial);
        partial = character;
      }
    }
    current = partial;
  }

  if (current) lines.push(current);
  return lines;
};

const replaceTemplateTokens = (text: string, tokens: Record<string, string>) => {
  let result = text;
  Object.entries(tokens).forEach(([key, value]) => {
    result = result.replaceAll(`{{${key}}}`, value || '');
  });
  return result;
};

const embedHeaderLogo = async (pdfDoc: PDFDocument, logoBytes: Uint8Array | null) => {
  if (!logoBytes) return null;

  try {
    return await pdfDoc.embedPng(logoBytes);
  } catch {
    try {
      return await pdfDoc.embedJpg(logoBytes);
    } catch {
      return null;
    }
  }
};

export const renderWithPdfLib = async (context: RenderContext) => {
  const { template, formData, radicado, signatureBytes, logoBytes, generatedAtLabel, tokens } = context;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const signatureImage = await pdfDoc.embedPng(signatureBytes);
  const headerLogo = await embedHeaderLogo(pdfDoc, logoBytes);
  const shouldDecoratePages = LEGAL_DOC_TYPES.has(template.tipo) || template.tipo === 'formulario_credito_educativo';

  const aspirante = String(formData.nombre_completo || '').trim();
  const documento = String(formData.n_documento || '').trim();
  const tipoDocumento = String(formData.tipo_documento || '').trim();

  const drawPageDecorators = (targetPage) => {
    if (!shouldDecoratePages) return;

    if (headerLogo) {
      const logoWidth = 78;
      const ratio = headerLogo.height / headerLogo.width;
      const logoHeight = logoWidth * ratio;
      targetPage.drawImage(headerLogo, {
        x: MARGIN_X + 8,
        y: 842 - 18 - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
    }

    targetPage.drawRectangle({
      x: MARGIN_X,
      y: 778,
      width: CONTENT_WIDTH,
      height: 56,
      borderWidth: 0,
      color: rgb(0.97, 0.98, 1),
    });

    targetPage.drawLine({
      start: { x: MARGIN_X, y: 778 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 778 },
      thickness: 0.6,
      color: rgb(0.8, 0.8, 0.8),
    });

    targetPage.drawLine({
      start: { x: MARGIN_X, y: 66 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 66 },
      thickness: 0.6,
      color: rgb(0.8, 0.8, 0.8),
    });

    targetPage.drawText(FOOTER_LINE_1, {
      x: MARGIN_X,
      y: 48,
      size: 8.5,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });

    targetPage.drawText(FOOTER_LINE_2, {
      x: MARGIN_X,
      y: 34,
      size: 8.5,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  };

  const startY = shouldDecoratePages ? 742 : 800;
  const minY = 125;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageDecorators(page);
  let y = startY;

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight >= minY) return;
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageDecorators(page);
    y = startY;
  };

  const drawCentered = (text: string, atY: number, size: number, useBold = false, color = rgb(0.08, 0.17, 0.33)) => {
    const selectedFont = useBold ? fontBold : font;
    const width = selectedFont.widthOfTextAtSize(text, size);
    const x = Math.max(MARGIN_X, (PAGE_WIDTH - width) / 2);
    page.drawText(text, { x, y: atY, size, font: selectedFont, color });
  };

  const drawJustifiedLine = ({
    line,
    atY,
    size,
    maxWidth,
    isLastLine,
    useBold,
    color,
    isBullet,
  }: {
    line: string;
    atY: number;
    size: number;
    maxWidth: number;
    isLastLine: boolean;
    useBold: boolean;
    color: any;
    isBullet: boolean;
  }) => {
    const selectedFont = useBold ? fontBold : font;
    const words = line.split(' ').filter(Boolean);

    if (isLastLine || words.length < 2 || isBullet || useBold) {
      page.drawText(line, { x: MARGIN_X, y: atY, size, font: selectedFont, color });
      return;
    }

    const spaceWidth = selectedFont.widthOfTextAtSize(' ', size);
    const wordsWidth = words.reduce((acc, w) => acc + selectedFont.widthOfTextAtSize(w, size), 0);
    const totalSpaces = words.length - 1;
    const lineWidthWithNormalSpaces = wordsWidth + totalSpaces * spaceWidth;
    const extra = Math.max(0, maxWidth - lineWidthWithNormalSpaces);
    const increment = totalSpaces > 0 ? extra / totalSpaces : 0;

    let cursor = MARGIN_X;
    words.forEach((word, index) => {
      page.drawText(word, { x: cursor, y: atY, size, font: selectedFont, color });
      cursor += selectedFont.widthOfTextAtSize(word, size);
      if (index < totalSpaces) cursor += spaceWidth + increment;
    });
  };

  drawCentered('ALCALDÍA MUNICIPAL DE MONTELÍBANO', y + 34, 10.2, true, rgb(0.31, 0.39, 0.52));
  drawCentered('Nit No. 800096763-5', y + 21, 9.6, false, rgb(0.32, 0.39, 0.5));
  drawCentered('SECRETARÍA DE EDUCACIÓN', y + 9, 10, true, rgb(0.2, 0.29, 0.42));
  drawCentered(template.titulo, y - 8, 14, true, rgb(0.07, 0.17, 0.33));

  y -= 46;

  page.drawRectangle({
    x: MARGIN_X,
    y: y - 66,
    width: CONTENT_WIDTH,
    height: 62,
    borderWidth: 0.8,
    borderColor: rgb(0.82, 0.86, 0.92),
    color: rgb(0.985, 0.99, 1),
  });

  const metaRows = [
    `Radicado: ${radicado}`,
    `Fecha de generación: ${generatedAtLabel}`,
    `Aspirante: ${aspirante || 'No informado'}`,
    `Documento: ${tipoDocumento} ${documento}`,
    `Correo: ${String(formData.email || '')}`,
  ];

  metaRows.forEach((row, index) => {
    ensureSpace(20);
    const lines = wrapTextByWidth(row, font, 9.9, CONTENT_WIDTH - 16);
    lines.forEach((line) => {
      page.drawText(line, {
        x: MARGIN_X + 8,
        y,
        size: 9.9,
        font,
        color: rgb(0.18, 0.18, 0.18),
      });
      y -= 13;
    });
    if (index < metaRows.length - 1) y -= 1;
  });

  y -= 12;
  template.cuerpo.forEach((paragraph) => {
    const parsedParagraph = replaceTemplateTokens(paragraph, tokens);
    const trimmed = parsedParagraph.trim();
    const isClause = /^CL[ÁA]USULA\s+/i.test(trimmed);
    const isBullet = /^\d+\./.test(trimmed);
    const isNonJustified = NON_JUSTIFIED_LINES.some((line) => trimmed.startsWith(line));
    const paragraphFontSize = isClause ? 11.15 : 10.75;
    const textColor = isClause ? rgb(0.08, 0.15, 0.27) : rgb(0.12, 0.12, 0.12);
    const maxWidth = isBullet ? CONTENT_WIDTH - 12 : CONTENT_WIDTH;
    const lines = wrapTextByWidth(trimmed, isClause ? fontBold : font, paragraphFontSize, maxWidth);

    lines.forEach((line, lineIndex) => {
      ensureSpace(19);
      if (isBullet) {
        page.drawText(line, {
          x: MARGIN_X + 12,
          y,
          size: paragraphFontSize,
          font,
          color: textColor,
        });
      } else {
        drawJustifiedLine({
          line,
          atY: y,
          size: paragraphFontSize,
          maxWidth: CONTENT_WIDTH,
          isLastLine: lineIndex === lines.length - 1 || isNonJustified,
          useBold: isClause,
          color: textColor,
          isBullet: isBullet || isNonJustified,
        });
      }
      y -= isClause ? 16 : 14.6;
    });
    y -= isClause ? 6 : 8;
  });

  const signatureWidth = 190;
  const signatureHeight = 74;
  const signatureX = MARGIN_X;
  ensureSpace(145);
  const signatureY = y - 78;

  page.drawRectangle({
    x: signatureX,
    y: signatureY - 48,
    width: 300,
    height: 124,
    borderWidth: 0.8,
    borderColor: rgb(0.84, 0.87, 0.92),
    color: rgb(0.99, 0.995, 1),
  });

  page.drawImage(signatureImage, {
    x: signatureX + 8,
    y: signatureY + 8,
    width: signatureWidth,
    height: signatureHeight,
  });

  page.drawLine({
    start: { x: signatureX + 8, y: signatureY + 6 },
    end: { x: signatureX + 248, y: signatureY + 6 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText('Firma del aspirante', {
    x: signatureX + 8,
    y: signatureY - 10,
    size: 10,
    font: fontBold,
    color: rgb(0.21, 0.21, 0.21),
  });

  page.drawText(`${aspirante || 'No informado'} - ${tipoDocumento} ${documento || ''}`, {
    x: signatureX + 8,
    y: signatureY - 24,
    size: 9.7,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });

  return await pdfDoc.save();
};
