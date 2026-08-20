import { PDFDocument } from 'pdf-lib';
import imageCompression from 'browser-image-compression';

/**
 * Comprime un archivo PDF reduciendo su tamaño
 * @param {File} file - Archivo PDF original
 * @param {Object} options - Opciones de compresión
 * @returns {Promise<File>} - Archivo PDF comprimido
 */
export const compressPDF = async (file, options = {}) => {
  try {
    const {
      targetSizeKB = 2048, // 2 MB por defecto
      maxIterations = 3,
    } = options;

    console.log(`📦 Comprimiendo PDF: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Leer el archivo PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);

    // Obtener información del PDF
    const pageCount = pdfDoc.getPageCount();
    console.log(`📄 Páginas: ${pageCount}`);

    // Primera compresión: guardar sin objetos no utilizados
    let pdfBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    let currentSizeKB = pdfBytes.length / 1024;
    console.log(`🔸 Tamaño después de optimización inicial: ${currentSizeKB.toFixed(2)} KB`);

    // Si ya está por debajo del objetivo, retornar
    if (currentSizeKB <= targetSizeKB) {
      const compressedFile = new File([pdfBytes], file.name, {
        type: 'application/pdf',
        lastModified: Date.now(),
      });
      console.log(`✅ PDF comprimido: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
      return compressedFile;
    }

    // Si está muy grande, intentar compresión adicional
    let iteration = 0;
    while (currentSizeKB > targetSizeKB && iteration < maxIterations) {
      iteration++;
      console.log(`🔄 Iteración ${iteration} de compresión...`);

      // Recargar y optimizar
      const tempPdfDoc = await PDFDocument.load(pdfBytes);
      pdfBytes = await tempPdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      currentSizeKB = pdfBytes.length / 1024;
      console.log(`🔸 Tamaño después de iteración ${iteration}: ${currentSizeKB.toFixed(2)} KB`);
    }

    const compressedFile = new File([pdfBytes], file.name, {
      type: 'application/pdf',
      lastModified: Date.now(),
    });

    const originalSizeMB = (file.size / 1024 / 1024).toFixed(2);
    const compressedSizeMB = (compressedFile.size / 1024 / 1024).toFixed(2);
    const reduction = ((1 - compressedFile.size / file.size) * 100).toFixed(1);

    console.log(`✅ Compresión completada:`);
    console.log(`   Original: ${originalSizeMB} MB`);
    console.log(`   Comprimido: ${compressedSizeMB} MB`);
    console.log(`   Reducción: ${reduction}%`);

    return compressedFile;
  } catch (error) {
    console.error('❌ Error comprimiendo PDF:', error);
    // Si falla la compresión, devolver el archivo original
    console.warn('⚠️ Usando archivo original sin compresión');
    return file;
  }
};

/**
 * Comprime una imagen (PNG, JPG, WEBP)
 * @param {File} file - Archivo de imagen original
 * @param {Object} options - Opciones de compresión
 * @returns {Promise<File>} - Archivo de imagen comprimido
 */
export const compressImage = async (file, options = {}) => {
  try {
    const {
      maxSizeMB = 0.5, // 500 KB por defecto
      maxWidthOrHeight = 1920,
      useWebWorker = true,
      initialQuality = 0.8,
    } = options;

    console.log(`🖼️ Comprimiendo imagen: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    const compressedFile = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker,
      initialQuality,
      fileType: 'image/png', // Mantener como PNG para mejor calidad
    });

    const originalSizeMB = (file.size / 1024 / 1024).toFixed(2);
    const compressedSizeMB = (compressedFile.size / 1024 / 1024).toFixed(2);
    const reduction = ((1 - compressedFile.size / file.size) * 100).toFixed(1);

    console.log(`✅ Imagen comprimida:`);
    console.log(`   Original: ${originalSizeMB} MB`);
    console.log(`   Comprimida: ${compressedSizeMB} MB`);
    console.log(`   Reducción: ${reduction}%`);

    return compressedFile;
  } catch (error) {
    console.error('❌ Error comprimiendo imagen:', error);
    // Si falla la compresión, devolver el archivo original
    console.warn('⚠️ Usando archivo original sin compresión');
    return file;
  }
};

/**
 * Comprime un archivo automáticamente según su tipo
 * @param {File} file - Archivo a comprimir
 * @param {Object} options - Opciones de compresión
 * @returns {Promise<File>} - Archivo comprimido
 */
export const compressFile = async (file, options = {}) => {
  if (!file) return null;

  const fileType = file.type.toLowerCase();

  if (fileType === 'application/pdf') {
    return await compressPDF(file, options.pdf);
  } else if (fileType.startsWith('image/')) {
    return await compressImage(file, options.image);
  } else {
    console.warn('⚠️ Tipo de archivo no soportado para compresión:', fileType);
    return file;
  }
};

/**
 * Validaciones de tamaño antes de comprimir
 */
export const shouldCompress = (file, maxSizeKB = 2048) => {
  const fileSizeKB = file.size / 1024;
  return fileSizeKB > maxSizeKB;
};

/**
 * Obtiene información del archivo
 */
export const getFileInfo = (file) => {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    sizeMB: (file.size / 1024 / 1024).toFixed(2),
    sizeKB: (file.size / 1024).toFixed(2),
  };
};
