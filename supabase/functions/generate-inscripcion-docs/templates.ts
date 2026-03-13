export type DocTemplate = {
  tipo: string;
  titulo: string;
  cuerpo: string[];
};

export const LEGAL_DOC_TYPES = new Set([
  'aceptacion_terminos_condiciones',
  'autorizacion_tratamiento_datos',
]);

export const FOOTER_LINE_1 =
  'Calle 27 No. 28-27 Tel 7627455: Código Postal 234001 Área urbana Código Postal 23 4007 Área rural';
export const FOOTER_LINE_2 =
  'Web: www.montelibano-cordoba.gov.co   - E-mail: secretariadeeducacion@montelibano-cordoba.gov.co';

export const TEMPLATES: DocTemplate[] = [
  {
    tipo: 'formulario_credito_educativo',
    titulo: 'FORMULARIO DE SOLICITUD DEL CRÉDITO EDUCATIVO',
    cuerpo: [

      'FONDO EDUCATIVO PARA EL APOYO DE LA EDUCACIÓN SUPERIOR (FOCADES)',
      'El presente formulario deja constancia de la solicitud formal realizada por el aspirante para acceder al crédito educativo condonable del programa FOCADES, conforme al Acuerdo N° 014 del 04 de septiembre de 2020.',
      'Con mi firma, certifico que la información suministrada en el formulario de inscripción es veraz, completa y actualizada. Asimismo, autorizo al Comité Administrador de FOCADES para verificar la información y documentos aportados ante las entidades correspondientes.',
      'Declaro conocer que la asignación del beneficio está sujeta al cumplimiento de los requisitos y criterios definidos en la convocatoria vigente y en la normatividad del programa.',
      'En constancia de mi aceptación, firmo el presente documento.',
      'SELLO DE TIEMPO Y VERIFICACIÓN ELECTRÓNICA',
      'Fecha y Hora de la Firma (UTC): {{firma_timestamp}}',
      'Sello de Integridad de Datos (SHA-256): {{firma_hash_datos}}',
    ],
  },
  {
    tipo: 'aceptacion_terminos_condiciones',
    titulo: 'ACEPTACIÓN DE TÉRMINOS Y CONDICIONES',
    cuerpo: [

      'Yo, {{nombre_completo}}, identificado(a) con documento de identidad N° {{n_documento}}, en mi calidad de aspirante al programa FOCADES, declaro de manera libre y voluntaria que he leído, comprendido y acepto en su totalidad los siguientes términos y condiciones, los cuales se basan en el Acuerdo N° 011 del 02 de abril de 2025 expedido por el Concejo Municipal de Montelíbano.',
      'CLÁUSULA PRIMERA: OBJETO DEL APOYO. Entiendo que el apoyo otorgado por FOCADES es un CRÉDITO EDUCATIVO CONDONABLE, blando y sin intereses, destinado a financiar estudios de educación técnica profesional, tecnológica o de pregrado. La exoneración del pago de hasta el 100% de la deuda está sujeta al cumplimiento estricto de las condiciones aquí descritas (Acuerdo N° 014 de 2020, Artículos Tercero y Cuarto).',
      'CLÁUSULA SEGUNDA: REQUISITOS DE ELEGIBILIDAD. Manifiesto que cumplo con los requisitos de la modalidad a la que aplico (Apoyo al Mérito Educativo o Apoyo a Sueños Educativos), los cuales incluyen, entre otros: ser egresado de una institución educativa oficial de Montelíbano, tener mi núcleo familiar domiciliado en el municipio, y no ser beneficiario de otra beca o estímulo de valor superior al crédito de FOCADES (Acuerdo N° 011 de 2025, Artículo Sexto).',
      'CLÁUSULA TERCERA: CONDICIÓN FUNDAMENTAL PARA LA CONDONACIÓN. Soy consciente de que la condición principal para que el crédito sea condonado es que, una vez finalizado cada semestre académico financiado, debo obtener un promedio de notas igual o superior a 3.5. El incumplimiento de esta condición me hará deudor del monto desembolsado en dicho semestre (Acuerdo N° 011 de 2025, Artículo Quinto y Noveno).',
      'CLÁUSULA CUARTA: CAUSALES DE PÉRDIDA DEL BENEFICIO. Acepto que el derecho al apoyo de FOCADES se pierde de forma inmediata si incurro en cualquiera de las siguientes causales:',
      '1. Obtener un promedio académico inferior a 3.5 en el semestre financiado.',
      '2. Haber perdido el semestre académico en el cual se me entregó el crédito.',
      '3. Retirarme del programa académico por un semestre sin justa causa y sin notificar oportunamente al Comité de FOCADES.',
      '4. Que mi matrícula sea cancelada por la Institución de Educación Superior por incumplimiento del reglamento interno.',
      '5. Incurrir en cualquier acción delictiva o fraudulenta para favorecerme de los beneficios del programa. (Acuerdo N° 011 de 2025, Artículo Noveno).',
      'CLÁUSULA QUINTA: VERACIDAD Y AUTENTICIDAD. Doy fe de que toda la información suministrada en el formulario de inscripción y los documentos adjuntos son veraces, exactos y auténticos. Autorizo al Comité Administrador del FOCADES a realizar las verificaciones pertinentes para comprobar la veracidad de los datos y documentos presentados (Acuerdo N° 011 de 2025, Artículo Décimo Noveno).',
      'CLÁUSULA SEXTA: COMPROMISO. Me comprometo a cumplir con todas las normativas, reglamentos y procesos establecidos por el programa FOCADES, incluyendo el proceso de actualización semestral de documentos para la renovación del beneficio, en caso de ser seleccionado.',
      'CLÁUSULA SÉPTIMA: RESPONSABILIDAD ÉTICA Y RESPETO INSTITUCIONAL. Teniendo en cuenta que el beneficio otorgado emana de recursos públicos del Municipio de Montelíbano, destinados a fomentar el desarrollo social y el mérito académico, el aspirante y/o beneficiario se compromete a mantener una conducta de respeto y lealtad hacia la institucionalidad.',
      'En consecuencia, el beneficiario acepta expresamente que el ejercicio de la libertad de expresión no ampara la comisión de actos de difamación, injuria o calumnia que atenten contra la integridad moral y el buen nombre del programa FOCADES, de la Administración Municipal de Montelíbano, del Alcalde Municipal o del Secretario(a) de Educación Municipal.',
      'El uso de redes sociales, plataformas digitales, páginas web o cualquier medio de comunicación masivo para proferir ataques deshonrosos, afirmaciones falsas o campañas de desprestigio contra los citados sujetos o instituciones, será considerado una falta grave a los principios de buena fe y respeto que rigen este convenio educativo. El acaecimiento de dichas conductas debidamente comprobadas por el Comité Administrador, será causal de pérdida inmediata del beneficio, cancelación de la condonación del crédito y exigibilidad de reembolso total de las sumas desembolsadas, sin perjuicio de las acciones legales, civiles o penales a las que haya lugar.',
      'CLÁUSULA OCTAVA: COMPROMISO DE RETRIBUCIÓN SOCIAL Y APORTE INTELECTUAL. En virtud del principio de reciprocidad y corresponsabilidad social, el beneficiario acepta que el apoyo financiero otorgado no solo busca su crecimiento personal, sino el desarrollo integral del Municipio de Montelíbano. Por lo tanto, para acceder a la condonación total (100%) del crédito educativo, el beneficiario se obliga a realizar una Retribución Social o Aporte Intelectual en favor del municipio, bajo las siguientes condiciones:',
      'Naturaleza del aporte: El beneficiario deberá poner a disposición de la comunidad sus conocimientos técnicos o profesionales en formación, a través de actividades tales como: servicio social comunitario, tutorías académicas a estudiantes de instituciones oficiales, participación en brigadas municipales, formulación de proyectos de impacto local, pasantías o cualquier obra social certificada por el Municipio de Montelíbano.',
      'Carga horaria/Proyecto: El Comité Administrador definirá la intensidad horaria o el alcance del proyecto intelectual que el estudiante deba cumplir durante su ciclo académico o al finalizar el mismo.',
      'Certificación de cumplimiento: El cumplimiento de esta labor será requisito indispensable para la liquidación definitiva y condonación del crédito. La falta de certificación o el incumplimiento de este compromiso se considerará como un incumplimiento de los términos del apoyo, facultando a EL PROGRAMA para NO proceder con la condonación total y exigir el reembolso del saldo correspondiente.',
      'En constancia de mi aceptación, firmo el presente documento.',
      'SELLO DE TIEMPO Y VERIFICACIÓN ELECTRÓNICA',
      'Fecha y Hora de la Firma (UTC): {{firma_timestamp}}',
      'Sello de Integridad de Datos (SHA-256): {{firma_hash_datos}}',
      'Este documento fue firmado electrónicamente. El sello de integridad es una huella digital única que certifica que la información del formulario no ha sido alterada desde el momento de la firma, garantizando su autenticidad.',
    ],
  },
  {
    tipo: 'autorizacion_tratamiento_datos',
    titulo: 'AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES',
    cuerpo: [

      'AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES',
      'FONDO EDUCATIVO PARA EL APOYO DE LA EDUCACIÓN SUPERIOR (FOCADES)',
      'Yo, {{nombre_completo}}, identificado(a) con documento de identidad N° {{n_documento}}, de manera libre, previa, expresa e informada, autorizo al Municipio de Montelíbano y al Comité Administrador del Fondo Educativo para el Apoyo de la Educación Superior (FOCADES), en adelante "EL PROGRAMA", para realizar el tratamiento de mis datos personales, en cumplimiento de la Ley 1581 de 2012 y demás normas concordantes.',
      'CLÁUSULA PRIMERA: DATOS A TRATAR. La autorización se otorga para el tratamiento de la siguiente información:',
      '1. Datos de Identificación: Nombres, apellidos, tipo y número de documento, fecha de nacimiento, género, correo electrónico, número de celular, dirección de residencia, entre otros.',
      '2. Datos Socioeconómicos: Información sobre mi núcleo familiar (composición, ingresos), puntaje y grupo SISBEN, recepción de otros subsidios, zona de residencia y caracterización de enfoque diferencial.',
      '3. Datos Académicos: Información sobre mi institución educativa de egreso, puntaje de pruebas Saber 11, e información de la institución de educación superior y programa al que aspiro o curso.',
      'CLÁUSULA SEGUNDA: FINALIDADES DEL TRATAMIENTO. Autorizo que mis datos personales sean recolectados, almacenados, usados, circulados, actualizados y procesados con las siguientes finalidades:',
      '1. Verificar mi identidad y el cumplimiento de los requisitos de elegibilidad establecidos en la convocatoria y en el Acuerdo N° 011 de 2025.',
      '2. Evaluar mi solicitud y asignarme un puntaje de selección, de acuerdo con los criterios definidos por el Comité de FOCADES (Acuerdo N° 011 de 2025, Artículo Vigésimo).',
      '3. Comprobar la veracidad de la información y los documentos presentados ante las entidades correspondientes, facultando expresamente a EL PROGRAMA para realizar consultas, cruces de información y solicitudes de validación de antecedentes académicos y socioeconómicos ante Instituciones de Educación Superior (IES), entidades públicas y privadas.',
      '4. Contactarme a través de los medios proporcionados (correo electrónico, celular) para notificarme sobre el estado de mi postulación y cualquier otra comunicación relacionada con el programa.',
      '5. En caso de ser seleccionado, gestionar mi vinculación como beneficiario, realizar los desembolsos correspondientes y hacer seguimiento a mi desempeño académico.',
      '6. Generar informes estadísticos y reportes anónimos sobre el impacto del programa FOCADES.',
      '7. Autorizar a las Instituciones de Educación Superior (IES) donde el aspirante se encuentre matriculado para que, a solicitud de EL PROGRAMA, suministren información relativa a su estado académico, promedios, certificados de notas, situación de matrícula y cualquier otro dato necesario para verificar el cumplimiento de los requisitos del Acuerdo N° 011 de 2025 y sus modificaciones.',
      'CLÁUSULA TERCERA: DERECHOS DEL TITULAR. Declaro que he sido informado(a) de mis derechos como titular de los datos, en especial: a) Conocer, actualizar y rectificar mi información; b) Solicitar prueba de la autorización otorgada; c) Ser informado sobre el uso que se le ha dado a mis datos; d) Presentar quejas ante la autoridad competente; e) Revocar la autorización y/o solicitar la supresión del dato cuando no se respeten los principios, derechos y garantías constitucionales y legales.',
      'CLÁUSULA CUARTA: VALIDEZ DE LA FIRMA ELECTRÓNICA. Para garantizar la autenticidad e integridad de la información proporcionada, declaro que entiendo y acepto que EL PROGRAMA generará y almacenará, como parte integral de mi firma, un sello de tiempo seguro y una huella digital única (hash criptográfico) de los datos de mi formulario en el momento del envío. Estos datos técnicos se usarán exclusivamente como prueba del acto de firma y la integridad de la información.',
      'Por lo anterior, otorgo mi consentimiento explícito a EL PROGRAMA para el tratamiento de mis datos personales de acuerdo con las finalidades aquí descritas.',
      'En constancia de mi aceptación, firmo el presente documento.',
      'SELLO DE TIEMPO Y VERIFICACIÓN ELECTRÓNICA',
      'Fecha y Hora de la Firma (UTC): {{firma_timestamp}}',
      'Sello de Integridad de Datos (SHA-256): {{firma_hash_datos}}',
      'Este documento fue firmado electrónicamente. El sello de integridad es una huella digital única que certifica que la información del formulario no ha sido alterada desde el momento de la firma, garantizando su autenticidad.',
    ],
  },
];
