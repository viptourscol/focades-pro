import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader, Download, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';

/**
 * Componente: Importador de Beneficiarios (Admin)
 * 
 * Permite a admins:
 * 1. Cargar CSV
 * 2. Ver preview de datos
 * 3. Importar a BD con progreso
 * 4. Descargar reporte
 * 
 * UI: Drag & drop, validación visual, progreso en tiempo real
 */

export default function AdminImportBeneficiarios() {
  const fileInputRef = useRef(null);
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState(null);
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'preview' | 'results'

  // Parse CSV manualmente con soporte para comillas
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    // Parsear header
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);
    
    console.log('📋 Headers encontrados:', headers);
    const rows = [];

    // Parsear datos
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue; // Skip empty lines
      
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }

    console.log(`✅ Parseadas ${rows.length} filas`);
    return rows;
  };

  // Helper para parsear línea CSV respetando comillas
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      result.push(current.trim());
    }

    return result;
  };

  const handleDragOver = e => {
    e.preventDefault();
    e.currentTarget.style.borderColor = '#0D2C54';
    e.currentTarget.style.backgroundColor = 'rgba(13, 44, 84, 0.05)';
  };

  const handleDragLeave = e => {
    e.currentTarget.style.borderColor = '#e2e8f0';
    e.currentTarget.style.backgroundColor = '#f9fafb';
  };

  const handleDrop = e => {
    e.preventDefault();
    e.currentTarget.style.borderColor = '#e2e8f0';
    e.currentTarget.style.backgroundColor = '#f9fafb';

    const files = e.dataTransfer.files;
    if (files[0]) {
      processFile(files[0]);
    }
  };

  const handleFileSelect = e => {
    if (e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async file => {
    if (!file.name.endsWith('.csv')) {
      await showErrorAlert({
        title: 'Archivo inválido',
        text: 'Por favor carga un archivo CSV.',
      });
      return;
    }

    try {
      const text = await file.text();
      const data = parseCSV(text);

      if (data.length === 0) {
        await showErrorAlert({
          title: 'CSV vacío',
          text: 'El archivo no contiene datos.',
        });
        return;
      }

      setCsvFile(file);
      setCsvData(data);
      setActiveTab('preview');
    } catch (error) {
      console.error('Error leyendo archivo:', error);
      await showErrorAlert({
        title: 'Error al leer archivo',
        text: 'No se pudo procesar el archivo. Verifica que sea un CSV válido.',
      });
    }
  };

  const handleImport = async () => {
    if (csvData.length === 0) {
      await showErrorAlert({
        title: 'Sin datos',
        text: 'Carga un CSV primero.',
      });
      return;
    }

    setImporting(true);
    setProgress(0);
    setActiveTab('results');

    try {
      // Llamar Edge Function para importar
      const { data, error } = await supabase.functions.invoke('admin-import-beneficiarios', {
        body: { records: csvData },
      });

      if (error) throw error;

      setReport(data);
      setProgress(100);

      await showSuccessAlert({
        title: '¡Importación completada!',
        text: `${data.stats.nuevos_importados} beneficiarios importados exitosamente.`,
      });
    } catch (error) {
      console.error('Error importando:', error);
      await showErrorAlert({
        title: 'Error en importación',
        text: error.message || 'No se pudo completar la importación.',
      });
    } finally {
      setImporting(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;

    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beneficiarios-import-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const headers = [
      'NOMBRE',
      'TIPO_DOC',
      'N_DOC',
      'GENERO',
      'EMAIL',
      'TEL',
      'MODALIDAD',
      'CONVOCATORIA',
      'COLEGIO',
      'UNIVERSIDAD',
      'PROGRAMA',
      'TIPO_EDUCACION',
      'BANCO',
      'CUENTA_BANCO',
      'TIPO_CUENTA',
      'ESTADO',
    ];

    // Fila de ejemplo
    const exampleRow = [
      'Juan Pérez García',
      'CC',
      '1234567890',
      'MASCULINO',
      'juan@example.com',
      '3001234567',
      'MÉRITO',
      '2026-1',
      'Colegio Municipal',
      'Universidad Nacional',
      'Ingeniería de Sistemas',
      'PROFESIONAL',
      'Bancolombia',
      '4111111111',
      'Ahorros',
      'ACTIVO',
    ];

    const csv = [headers.join(','), exampleRow.join(','), ''].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-beneficiarios.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ backgroundColor: '#F5F7FA' }} className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">
            Importar Beneficiarios
          </h1>
          <p className="text-slate-600">
            Carga un archivo CSV con datos de beneficiarios para importarlos masivamente a la BD.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            {[
              { id: 'upload', label: '📤 Cargar', icon: Upload },
              { id: 'preview', label: '👁️ Preview', icon: Eye, disabled: csvData.length === 0 },
              { id: 'results', label: '📊 Resultados', icon: CheckCircle, disabled: !report },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`flex-1 py-4 px-6 font-semibold text-sm transition-all border-b-2 ${
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : tab.disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-500 border-transparent hover:text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-8">
            {/* TAB: Upload */}
            {activeTab === 'upload' && (
              <div className="space-y-6">
                {/* Drag & Drop */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center cursor-pointer transition-all hover:border-primary hover:bg-blue-50"
                >
                  <Upload size={48} className="mx-auto mb-4 text-slate-400" />
                  <h3 className="text-lg font-semibold text-primary mb-2">
                    Arrastra tu CSV aquí
                  </h3>
                  <p className="text-slate-500 mb-4">
                    O haz clic para seleccionar un archivo
                  </p>
                  <p className="text-xs text-slate-400">
                    Formato: CSV (valores separados por comas)
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {csvFile && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                    <CheckCircle size={20} className="text-green-600" />
                    <div>
                      <p className="font-semibold text-green-900">{csvFile.name}</p>
                      <p className="text-sm text-green-700">
                        {csvData.length} registros cargados
                      </p>
                    </div>
                  </div>
                )}

                {/* Info boxes */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">📋 Campos requeridos</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• NOMBRE (nombre completo)</li>
                      <li>• TIPO_DOC (CC, CE, etc)</li>
                      <li>• N_DOC (número documento)</li>
                      <li>• EMAIL (correo válido)</li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h4 className="font-semibold text-amber-900 mb-2">💡 Campos opcionales</h4>
                    <ul className="text-sm text-amber-800 space-y-1">
                      <li>• GENERO, TEL, COLEGIO</li>
                      <li>• UNIVERSIDAD, PROGRAMA</li>
                      <li>• BANCO, CUENTA_BANCO</li>
                    </ul>
                  </div>
                </div>

                {/* Valores válidos para ESTADO y MODALIDAD */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <h4 className="font-semibold text-emerald-900 mb-2">✅ ESTADO válidos</h4>
                    <ul className="text-sm text-emerald-800 space-y-1 font-mono">
                      <li>• ACTIVO</li>
                      <li>• SUSPENDIDO</li>
                      <li>• RETIRADO</li>
                      <li>• CONDONADO</li>
                      <li>• EGRESADO</li>
                    </ul>
                  </div>

                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <h4 className="font-semibold text-violet-900 mb-2">🎓 MODALIDAD válidas</h4>
                    <ul className="text-sm text-violet-800 space-y-1 font-mono">
                      <li>• MÉRITO</li>
                      <li>• SUEÑOS</li>
                      <li>(deja vacío si no aplica)</li>
                    </ul>
                  </div>
                </div>

                {/* Descargar template */}
                <div className="flex gap-3">
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 font-semibold text-primary hover:bg-slate-50 transition-colors"
                  >
                    <Download size={18} />
                    Descargar Template
                  </button>
                </div>
              </div>
            )}

            {/* TAB: Preview */}
            {activeTab === 'preview' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle size={20} className="text-blue-600 mt-0.5" />
                  <p className="text-sm text-blue-800">
                    <strong>Revisa los datos antes de importar.</strong> Verifica que no haya duplicados
                    o errores en documentos, emails y números de cuenta.
                  </p>
                </div>

                {/* Tabla preview */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        {Object.keys(csvData[0] || {})
                          .slice(0, 8)
                          .map(key => (
                            <th key={key} className="px-4 py-3 text-left font-semibold text-primary">
                              {key}
                            </th>
                          ))}
                        <th className="px-4 py-3 text-left font-semibold text-slate-400">
                          ...
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                          {Object.values(row)
                            .slice(0, 8)
                            .map((val, vidx) => (
                              <td key={vidx} className="px-4 py-3 text-slate-700 truncate">
                                {val || '—'}
                              </td>
                            ))}
                          <td className="px-4 py-3 text-slate-400">...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-slate-500 text-center">
                  Mostrando primeros 10 de {csvData.length} registros
                </p>

                {/* Botón importar */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setCsvFile(null)}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 font-semibold text-primary hover:bg-slate-50 transition-colors"
                  >
                    Cargar otro archivo
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    style={{ background: '#0D2C54' }}
                  >
                    {importing ? (
                      <>
                        <Loader size={18} className="animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Upload size={18} />
                        Importar {csvData.length} registros
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: Results */}
            {activeTab === 'results' && report && (
              <div className="space-y-6">
                {/* DEBUG INFO */}
                {report.debug && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h4 className="font-semibold text-purple-900 mb-2">🔍 INFO DE DEBUG</h4>
                    <div className="text-xs text-purple-800 space-y-2">
                      <p><strong>Headers detectados:</strong> {report.debug.headers_detectados.join(', ')}</p>
                      <p><strong>Primer registro recibido:</strong></p>
                      <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
                        {JSON.stringify(report.debug.primer_registro_recibido, null, 2)}
                      </pre>
                      <p><strong>Primer registro después de validación:</strong></p>
                      <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
                        {JSON.stringify(report.debug.primer_registro_validado, null, 2)}
                      </pre>
                      {report.debug.insert_errors && report.debug.insert_errors.length > 0 && (
                        <>
                          <p><strong>❌ Errores de INSERT:</strong></p>
                          <pre className="bg-red-100 p-2 rounded text-xs overflow-x-auto border border-red-300">
                            {JSON.stringify(report.debug.insert_errors, null, 2)}
                          </pre>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                    <p className="text-sm text-green-600 font-semibold mb-1">IMPORTADOS</p>
                    <p className="text-4xl font-bold text-green-700">
                      {report.stats.nuevos_importados}
                    </p>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                    <p className="text-sm text-red-600 font-semibold mb-1">ERRORES/DUPLICADOS</p>
                    <p className="text-4xl font-bold text-red-700">
                      {report.stats.con_errores + report.stats.duplicados}
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <p className="text-sm text-blue-600 font-semibold mb-1">VÁLIDOS</p>
                    <p className="text-4xl font-bold text-blue-700">
                      {report.stats.validos}
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                    <p className="text-sm text-slate-600 font-semibold mb-1">TOTAL LEÍDOS</p>
                    <p className="text-4xl font-bold text-slate-700">
                      {report.stats.total_leidos}
                    </p>
                  </div>
                </div>

                {/* Errores */}
                {report.errores && report.errores.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                    <h4 className="font-semibold text-red-900 mb-4">
                      ⚠️ Registros con error ({report.errores.length})
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {report.errores.map((err, idx) => (
                        <div key={idx} className="text-sm text-red-800 bg-white p-3 rounded">
                          <strong>{err.documento}</strong> — {err.razon}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Acciones */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setCsvFile(null);
                      setCsvData([]);
                      setReport(null);
                      setActiveTab('upload');
                    }}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 font-semibold text-primary hover:bg-slate-50 transition-colors"
                  >
                    Importar otro archivo
                  </button>
                  <button
                    onClick={downloadReport}
                    className="flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all inline-flex items-center justify-center gap-2"
                    style={{ background: '#0D2C54' }}
                  >
                    <Download size={18} />
                    Descargar reporte
                  </button>
                </div>

                {/* Timestamp */}
                <p className="text-xs text-slate-500 text-center">
                  Importado: {new Date(report.timestamp).toLocaleString('es-CO')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
