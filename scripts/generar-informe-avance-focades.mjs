import fs from 'fs'
import path from 'path'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

const outputPath = path.resolve('INFORME_AVANCE_IMPLEMENTACION_FOCADES_JULIO_2026.docx')

const addHeading = (text, level = HeadingLevel.HEADING_1) =>
  new Paragraph({
    heading: level,
    spacing: { before: 180, after: 120 },
    children: [new TextRun({ text, bold: true })],
  })

const addBody = (text) =>
  new Paragraph({
    spacing: { after: 120, line: 276 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text })],
  })

const bullet = (text) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 90 },
    children: [new TextRun({ text })],
  })

const makeCell = (text, bold = false) =>
  new TableCell({
    width: { size: 4680, type: WidthType.DXA },
    shading: { fill: bold ? 'D9EAF7' : 'FFFFFF', type: ShadingType.CLEAR },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'B7C6D6' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'B7C6D6' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'B7C6D6' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'B7C6D6' },
    },
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text, bold })],
      }),
    ],
  })

const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: 'Arial',
          size: 22,
        },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: 'MUNICIPIO DE MONTELÍBANO', bold: true, size: 28 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: 'INFORME DE AVANCE DE IMPLEMENTACIÓN', bold: true, size: 26 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: 'Contrato No. PS-207-2026', bold: true, size: 24 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: 'Proyecto FOCADES', bold: true, size: 24 })],
        }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3120, 6240],
          rows: [
            new TableRow({ children: [makeCell('Contratante', true), makeCell('Municipio de Montelíbano - Córdoba')] }),
            new TableRow({ children: [makeCell('Contratista', true), makeCell('Jader Andrés Martínez Barrios')] }),
            new TableRow({ children: [makeCell('Objeto contractual', true), makeCell('Prestación de servicios profesionales para el diseño, desarrollo, implementación y puesta en funcionamiento del software web a la medida para el programa FOCADES, incluyendo organización del acervo documental y dotación tecnológica básica para el funcionamiento en el Municipio de Montelíbano - Córdoba.')] }),
            new TableRow({ children: [makeCell('Valor', true), makeCell('$150.430.500')] }),
            new TableRow({ children: [makeCell('Plazo', true), makeCell('Dos (2) meses, sin exceder el 31 de diciembre de 2026.')] }),
            new TableRow({ children: [makeCell('Fecha de corte', true), makeCell('Julio de 2026')] }),
          ],
        }),
        addHeading('1. Introducción', HeadingLevel.HEADING_1),
        addBody('En atención al contrato de prestación de servicios profesionales y de apoyo a la gestión No. PS-207-2026, suscrito entre el Municipio de Montelíbano y el ingeniero de sistemas Jader Andrés Martínez Barrios, se presenta el siguiente informe de avance con el fin de dejar constancia técnica y administrativa del estado de ejecución del proyecto FOCADES a la fecha de corte indicada.'),
        addBody('El informe consolida las actividades desarrolladas en el componente de software, la entrega del equipo de cómputo, la socialización de manuales a beneficiarios, las capacitaciones adelantadas a funcionarios administrativos y la carga inicial de la base de datos histórica suministrada por la Secretaría de Educación.'),
        addHeading('2. Antecedentes contractuales', HeadingLevel.HEADING_1),
        addBody('De conformidad con los estudios previos y el contrato suscrito, el proyecto tiene como finalidad implementar una solución web a la medida para la administración integral del programa FOCADES, incluyendo los módulos funcionales requeridos, la migración de información histórica, la puesta en funcionamiento en infraestructura en nube, la transferencia de conocimiento, la entrega de manuales y la dotación tecnológica básica para el funcionamiento institucional.'),
        addBody('El contrato establece, además, obligaciones relacionadas con la preservación del acervo documental, la capacitación a funcionarios, la entrega del código fuente y la transferencia patrimonial de los derechos de autor sobre el software desarrollado.'),
        addHeading('3. Estado general de avance', HeadingLevel.HEADING_1),
        addBody('A la fecha de corte del presente informe, el proyecto registra avances concretos y verificables en varios frentes de ejecución, los cuales se relacionan a continuación:'),
        bullet('Se realizó la entrega del computador All in One, el cual fue recibido e ingresado a almacén, cumpliendo la fase de dotación tecnológica prevista en el contrato.'),
        bullet('Se efectuó la remisión de manuales e instructivos a beneficiarios, como parte del proceso de acompañamiento y apropiación del uso de la plataforma.'),
        bullet('Se desarrollaron capacitaciones dirigidas a funcionarios administrativos del programa FOCADES para el uso operativo de la solución y sus flujos de trabajo.'),
        bullet('Se adelantó la carga inicial de la base de datos de beneficiarios suministrada por la Secretaría de Educación, preservando la información histórica disponible para la operación del sistema.'),
        addHeading('4. Actividades ejecutadas por componente', HeadingLevel.HEADING_1),
        addHeading('4.1 Componente de desarrollo de software', HeadingLevel.HEADING_2),
        addBody('El desarrollo del proyecto ya cuenta con una arquitectura funcional orientada a la operación del programa FOCADES, con módulos separados para usuarios aspirantes, beneficiarios y administradores. La solución contempla autenticación, gestión de información, soporte de historial y herramientas de administración para los procesos del programa.'),
        bullet('Módulo de registro e inscripción de aspirantes con carga de datos, validación de información y aceptación de términos.'),
        bullet('Módulo de onboarding y completado de perfil del beneficiario, incluyendo actualización de datos y documentos.'),
        bullet('Portal del beneficiario con acceso a resumen, historial, actualizaciones, condonación, notificaciones y tickets de soporte.'),
        bullet('Panel administrativo para gestión de beneficiarios, autorizados, actualizaciones, convocatorias, FAQ, documentación y configuración general.'),
        bullet('Módulos de analítica, proyección y resoluciones de pago para el seguimiento institucional.'),
        addHeading('4.2 Componente de migración y administración de históricos', HeadingLevel.HEADING_2),
        addBody('Se implementó el flujo de administración de históricos en cuatro pasos, disponible en el panel administrativo: importación de beneficiarios históricos, gestión de documentos, importación de pagos históricos y activación de beneficiarios. Este flujo organiza la incorporación progresiva del acervo documental y financiero del programa.'),
        bullet('Pantalla de importación histórica de beneficiarios con lectura de archivos Excel o CSV, normalización de campos y validación previa.'),
        bullet('Pantalla de documentos históricos con consulta por lote, subida de soportes y clasificación del estado documental.'),
        bullet('Pantalla de pagos históricos con importación estructurada, validación de montos y asociación por documento o lote.'),
        bullet('Pantalla de activación de beneficiarios con clasificación por estado y envío de invitaciones a los casos confiables.'),
        bullet('Hub central de históricos para visualizar lotes, estados y avance del proceso de migración.'),
        addHeading('4.3 Componente de información histórica y migración', HeadingLevel.HEADING_2),
        addBody('Se realizó la carga inicial de la base de datos de beneficiarios suministrada por la Secretaría de Educación, lo que permite que el sistema inicie operación con el histórico del programa debidamente estructurado. Esta actividad es coherente con la finalidad de conservar el acervo del programa y facilitar su consulta, validación y seguimiento.'),
        addHeading('4.4 Componente de apropiación tecnológica y soporte', HeadingLevel.HEADING_2),
        addBody('Se han realizado envíos de manuales a beneficiarios y capacitaciones a personal administrativo del programa FOCADES, orientadas a fortalecer el uso correcto de la plataforma, la comprensión de los procedimientos de inscripción y la interacción con los módulos funcionales. Estas actividades son coherentes con el componente de apropiación tecnológica y transferencia de conocimiento establecido en los estudios previos.'),
        addHeading('4.5 Componente de dotación tecnológica', HeadingLevel.HEADING_2),
        addBody('En cumplimiento de la obligación contractual relacionada con la dotación tecnológica básica, se efectuó la entrega del computador All in One, el cual fue recibido satisfactoriamente e ingresado al inventario/almacén institucional. Esta entrega contribuye a garantizar la disponibilidad mínima de recursos para la operación del proyecto y el soporte del sistema implementado.'),
        addHeading('5. Soporte de cumplimiento', HeadingLevel.HEADING_1),
        addBody('Las actividades reportadas se encuentran alineadas con el objeto contractual y con las obligaciones específicas establecidas en el contrato, especialmente en lo relativo al desarrollo e implementación del software, la transferencia tecnológica, la capacitación, la dotación tecnológica y la gestión de información histórica.'),
        bullet('La entrega del equipo de cómputo demuestra cumplimiento del componente de suministro tecnológico.'),
        bullet('Los manuales enviados y las capacitaciones realizadas evidencian avances en el proceso de apropiación y transferencia de conocimiento.'),
        bullet('La carga inicial de la base de datos de beneficiarios confirma la ejecución de labores asociadas a la migración y preservación del histórico del programa.'),
        bullet('La existencia del hub de históricos y sus cuatro submódulos evidencia una implementación modular y trazable del flujo administrativo.'),
        addHeading('6. Observaciones para supervisión', HeadingLevel.HEADING_1),
        bullet('Se recomienda dejar constancia del ingreso del equipo entregado al inventario de almacén institucional mediante el soporte correspondiente.'),
        bullet('Es conveniente que la supervisión revise y archive las evidencias de envío de manuales y registros de capacitaciones realizadas, incluyendo listas de asistencia, fotografías o actas, si existen.'),
        bullet('Se sugiere continuar con el seguimiento técnico a la plataforma para validar la completitud de los módulos restantes, la estabilización del entorno y la continuidad de la migración de datos históricos.'),
        bullet('Este informe puede anexarse al expediente contractual como soporte del avance parcial de ejecución.'),
        addHeading('7. Conclusión', HeadingLevel.HEADING_1),
        addBody('Con corte a julio de 2026, el contrato PS-207-2026 presenta avances verificables en los componentes tecnológico, operativo y de transferencia de conocimiento. En particular, ya se realizó la entrega del equipo de cómputo e ingreso a almacén, se enviaron manuales a beneficiarios, se ejecutaron capacitaciones a administrativos FOCADES y se efectuó la carga inicial de la base de datos de beneficiarios suministrada por la Secretaría de Educación.'),
        addBody('En consecuencia, puede informarse a la Secretaría de Educación y a la supervisión que la implementación del proyecto avanza de manera consistente con el alcance definido contractualmente, quedando pendiente la consolidación de las actividades restantes hasta la culminación total del plazo contractual.'),
        addHeading('8. Firma', HeadingLevel.HEADING_1),
        new Paragraph({ spacing: { before: 360, after: 120 }, children: [new TextRun('Elaborado para remitir a la supervisión del contrato.')] }),
        new Paragraph({ spacing: { after: 240 }, children: [new TextRun('Fecha: Montelíbano, julio de 2026')] }),
      ],
    },
  ],
})

const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(outputPath, buffer)
console.log(`Archivo generado: ${outputPath}`)