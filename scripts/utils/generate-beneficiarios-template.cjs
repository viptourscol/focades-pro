const ExcelJS = require('exceljs');
const path = require('path');

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FOCADES Pro';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Plantilla');
  const cat = workbook.addWorksheet('Catalogos');

  const headers = [
    'nombre','cedula','correo','tipo_documento','telefono','direccion','semestre_actual','semestre_ingreso',
    'nivel_formacion','modalidad','convocatoria_id','convocatoria_nombre','programa_academico','institucion_superior',
    'grado_academico','institucion_academica','anio_graduacion','observaciones',
    'estado_beneficiario','cuenta_bancaria','banco','tipo_cuenta'
  ];

  ws.addRow(headers);
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4B99' } };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const widths = [28,16,30,18,16,30,16,16,24,22,38,30,30,30,22,62,18,36,24,22,28,16];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.getCell('A2').value = 'Nombre Apellido';
  ws.getCell('B2').value = '1234567890';
  ws.getCell('C2').value = 'correo@ejemplo.com';
  ws.getCell('D2').value = 'CC';
  ws.getCell('E2').value = '3001234567';
  ws.getCell('F2').value = 'Calle 1 # 2-3';
  ws.getCell('G2').value = 2;
  ws.getCell('H2').value = 1;
  ws.getCell('I2').value = 'Universitario (Pregrado)';
  ws.getCell('J2').value = 'Sueño Educativo';
  ws.getCell('K2').value = '';
  ws.getCell('L2').value = 'Convocatoria 2026-1';
  ws.getCell('M2').value = 'Ingeniería de Sistemas';
  ws.getCell('N2').value = 'Universidad Nacional';
  ws.getCell('O2').value = 'Bachiller Académico';
  ws.getCell('P2').value = 'INSTITUCION EDUCATIVA JOSE MARIA CORDOBA';
  ws.getCell('Q2').value = new Date().getFullYear();
  ws.getCell('R2').value = 'Registro historico';
  ws.getCell('S2').value = 'activo';
  ws.getCell('T2').value = '';
  ws.getCell('U2').value = 'Bancolombia';
  ws.getCell('V2').value = 'Ahorros';

  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const docTypes = ['CC', 'TI', 'CE', 'PAS'];
  const modalidades = ['Sueño Educativo', 'Mérito Educativo'];
  const niveles = ['Técnico Profesional', 'Tecnológico', 'Universitario (Pregrado)'];
  const convocatorias = ['Convocatoria 2024-2', 'Convocatoria 2025-1', 'Convocatoria 2025-2', 'Convocatoria 2026-1'];
  const grados = [
    'Bachiller Académico', 'Bachiller Técnico', 'Bachiller Comercial',
    'Bachiller Pedagógico', 'Normalista Superior', 'Bachiller Rural', 'Bachiller con Profundización'
  ];
  const instituciones = [
    'CENTRO EDUCATIVO ESPIRITU SANTO',
    'CENTRO EDUCATIVO RURAL ETNOEDUCATIVO INDIGENA ZENU ALTO SAN JORGE - CEIZASAJ',
    'INSTITUCION EDUCATIVA ALIANZA PARA EL PROGRESO',
    'INSTITUCION EDUCATIVA ANTONIO NARIÑO',
    'INSTITUCION EDUCATIVA BELEN',
    'INSTITUCION EDUCATIVA CONCENTRACION EDUCATIVA DEL SUR DE MONTELIBANO',
    'INSTITUCION EDUCATIVA DULCE NOMBRE DE JESUS',
    'INSTITUCION EDUCATIVA EL PALMAR',
    'INSTITUCION EDUCATIVA JOSE MARIA CORDOBA',
    'INSTITUCION EDUCATIVA JUAN XXIII',
    'INSTITUCION EDUCATIVA LA ESPERANZA',
    'INSTITUCION EDUCATIVA MARIA GORETTI',
    'INSTITUCION EDUCATIVA SAN ANTONIO MARÍA CLARET',
    'INSTITUCION EDUCATIVA SAN BERNARDO',
    'INSTITUCION EDUCATIVA SAN FRANCISCO DEL RAYO',
    'INSTITUCION EDUCATIVA SAN JORGE',
    'INSTITUCION EDUCATIVA SAN JOSE',
    'INSTITUCION EDUCATIVA SIMON BOLIVAR',
    'INSTITUCION EDUCATIVA TECNICO AGROPECUARIO CLARET'
  ];
  const semestres = Array.from({ length: 20 }, (_, i) => i + 1);
  const currentYear = new Date().getFullYear();
  const anios = Array.from({ length: currentYear - 1980 + 3 }, (_, i) => 1980 + i);
  const estadosBeneficiario = ['activo', 'suspendido', 'retirado', 'condonado', 'egresado'];
  const bancos = [
    'Bancolombia', 'Davivienda', 'BBVA Colombia', 'Banco de Bogotá', 'Banco Popular',
    'Banco Occidente', 'Banco AV Villas', 'Banco Caja Social', 'Nequi', 'Daviplata',
    'Banco Agrario', 'Banco Falabella', 'Banco Finandina', 'Banco Mundo Mujer', 'Otro'
  ];
  const tiposCuenta = ['Ahorros', 'Corriente'];

  const catalogs = [
    { title: 'tipo_documento', values: docTypes },
    { title: 'modalidad', values: modalidades },
    { title: 'nivel_formacion', values: niveles },
    { title: 'convocatoria_nombre', values: convocatorias },
    { title: 'grado_academico', values: grados },
    { title: 'institucion_academica', values: instituciones },
    { title: 'semestres', values: semestres },
    { title: 'anio_graduacion', values: anios },
    { title: 'estado_beneficiario', values: estadosBeneficiario },
    { title: 'banco', values: bancos },
    { title: 'tipo_cuenta', values: tiposCuenta }
  ];

  catalogs.forEach((item, idx) => {
    const col = idx + 1;
    cat.getCell(1, col).value = item.title;
    cat.getCell(1, col).font = { bold: true };
    item.values.forEach((v, i) => {
      cat.getCell(i + 2, col).value = v;
    });
    cat.getColumn(col).width = Math.max(item.title.length + 2, 22);
  });

  cat.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDE8FF' } };
  cat.addRow([]);
  cat.addRow(['Nota: puedes editar esta hoja para ajustar listas antes de diligenciar la plantilla.']);

  function addValidation(colLetter, formula) {
    for (let r = 2; r <= 2000; r++) {
      ws.getCell(`${colLetter}${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: 'Valor no permitido',
        error: 'Selecciona un valor de la lista desplegable.'
      };
    }
  }

  addValidation('D', '=Catalogos!$A$2:$A$5');
  addValidation('J', '=Catalogos!$B$2:$B$3');
  addValidation('I', '=Catalogos!$C$2:$C$4');
  addValidation('L', '=Catalogos!$D$2:$D$5');
  addValidation('O', '=Catalogos!$E$2:$E$8');
  addValidation('P', `=Catalogos!$F$2:$F${instituciones.length + 1}`);
  addValidation('G', '=Catalogos!$G$2:$G$21');
  addValidation('H', '=Catalogos!$G$2:$G$21');
  addValidation('Q', `=Catalogos!$H$2:$H$${anios.length + 1}`);
  addValidation('S', '=Catalogos!$I$2:$I$6');
  addValidation('U', `=Catalogos!$J$2:$J$${bancos.length + 1}`);
  addValidation('V', '=Catalogos!$K$2:$K$3');

  const out = path.join(process.cwd(), 'public', 'plantillas', 'plantilla-beneficiarios-historicos.xlsx');
  await workbook.xlsx.writeFile(out);
  console.log(`Plantilla generada: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
