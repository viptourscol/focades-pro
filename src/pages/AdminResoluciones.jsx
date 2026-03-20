import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { numALetras, generarResolucionDocx, generarTablaXlsx } from '../lib/resolucionUtils';
import { FileText, Download, Search, CheckSquare, Square, Loader2, FileSpreadsheet } from 'lucide-react';

const fmtPesos = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n ?? 0);

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatFechaLarga(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminResoluciones() {
  // ── Datos para selects ──────────────────────────────────────────────────
  const [convocatorias, setConvocatorias] = useState([]);
  const [ventanas, setVentanas] = useState([]);
  const [loadingSelects, setLoadingSelects] = useState(true);

  // ── Selecciones del usuario ─────────────────────────────────────────────
  const [selectedConvocatoriaId, setSelectedConvocatoriaId] = useState('');
  const [selectedVentanaId, setSelectedVentanaId] = useState('');
  const [periodoPagoTexto, setPeriodoPagoTexto] = useState('');

  // ── Resultados de búsqueda ──────────────────────────────────────────────
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [stats, setStats] = useState(null);
  const [searched, setSearched] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState('');

  // ── Selección con checkbox ──────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ── Valores por modalidad ───────────────────────────────────────────────
  const [valorSuenos, setValorSuenos] = useState('');
  const [valorMerito, setValorMerito] = useState('');

  // ── Datos de la resolución ──────────────────────────────────────────────
  const [resolucionNumero, setResolucionNumero] = useState('');
  const [fechaResolucion, setFechaResolucion] = useState(new Date().toISOString().split('T')[0]);
  const [admitidosTotalInput, setAdmitidosTotalInput] = useState('');
  const [admitidosSuenosInput, setAdmitidosSuenosInput] = useState('');
  const [admitidosMeritoInput, setAdmitidosMeritoInput] = useState('');

  // ── Generación ──────────────────────────────────────────────────────────
  const [generatingDocx, setGeneratingDocx] = useState(false);
  const [genError, setGenError] = useState('');

  // ── Cargar convocatorias y ventanas al montar ───────────────────────────
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const [convResp, ventResp] = await Promise.all([
        supabase.from('convocatorias').select('id, nombre, anio').order('anio', { ascending: false }),
        supabase.from('portal_ventanas_actualizacion').select('id, nombre').order('id', { ascending: false }),
      ]);

      if (!mounted) return;
      setConvocatorias(convResp.data || []);
      setVentanas(ventResp.data || []);
      setLoadingSelects(false);
    };

    load();
    return () => { mounted = false; };
  }, []);

  // Pre-llenar texto del periodo cuando se selecciona una ventana
  useEffect(() => {
    if (!selectedVentanaId) return;
    const v = ventanas.find((v) => String(v.id) === String(selectedVentanaId));
    if (v) setPeriodoPagoTexto(v.nombre || '');
  }, [selectedVentanaId, ventanas]);

  // ── Buscar beneficiarios ────────────────────────────────────────────────
  const handleBuscar = useCallback(async () => {
    if (!selectedConvocatoriaId || !selectedVentanaId) {
      setSearchError('Selecciona una convocatoria y una ventana de actualización.');
      return;
    }

    setLoadingSearch(true);
    setSearchError('');
    setBeneficiarios([]);
    setStats(null);
    setSelectedIds(new Set());
    setSearched(false);

    const [rpcResp, statsResp] = await Promise.all([
      supabase.rpc('admin_beneficiarios_para_resolucion', {
        p_convocatoria_id: selectedConvocatoriaId,
        p_ventana_id: Number(selectedVentanaId),
      }),
      supabase.rpc('admin_resolucion_convocatoria_stats', {
        p_convocatoria_id: selectedConvocatoriaId,
      }),
    ]);

    setLoadingSearch(false);
    setSearched(true);

    if (rpcResp.error) {
      setSearchError(rpcResp.error.message || 'Error al consultar beneficiarios.');
      return;
    }

    const rows = rpcResp.data || [];
    setBeneficiarios(rows);
    setSelectedIds(new Set(rows.map((r) => r.id)));
    const statsData = statsResp.data || null;
    setStats(statsData);

    // Permite editar manualmente los valores históricos para el considerando.
    setAdmitidosTotalInput(String(statsData?.total_admitidos ?? ''));
    setAdmitidosSuenosInput(String(statsData?.admitidos_suenos ?? ''));
    setAdmitidosMeritoInput(String(statsData?.admitidos_merito ?? ''));
  }, [selectedConvocatoriaId, selectedVentanaId]);

  // ── Helpers de selección ────────────────────────────────────────────────
  const allSelected = beneficiarios.length > 0 && selectedIds.size === beneficiarios.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(beneficiarios.map((b) => b.id)));
    }
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Filas seleccionadas con valor calculado ─────────────────────────────
  const filasConValor = useMemo(() => {
    const vSuenos = parseFloat(String(valorSuenos).replace(/[^\d.]/g, '')) || 0;
    const vMerito = parseFloat(String(valorMerito).replace(/[^\d.]/g, '')) || 0;

    return beneficiarios
      .filter((b) => selectedIds.has(b.id))
      .map((b) => {
        const modalidadLower = String(b.modalidad || '').toLowerCase();
        const valor = modalidadLower.includes('sue') ? vSuenos
          : modalidadLower.includes('rito') ? vMerito
          : 0;
        return { ...b, valor_a_pagar: valor };
      });
  }, [beneficiarios, selectedIds, valorSuenos, valorMerito]);

  const valorTotal = useMemo(
    () => filasConValor.reduce((s, f) => s + (f.valor_a_pagar || 0), 0),
    [filasConValor]
  );

  const totalSuenos = useMemo(
    () => filasConValor.filter((f) => String(f.modalidad || '').toLowerCase().includes('sue')).length,
    [filasConValor]
  );

  const totalMerito = useMemo(
    () => filasConValor.filter((f) => String(f.modalidad || '').toLowerCase().includes('rito')).length,
    [filasConValor]
  );

  const convocatoriaActual = convocatorias.find((c) => c.id === selectedConvocatoriaId);
  const totalAdmitidosConvocatoria = Number(admitidosTotalInput || 0);
  const admitidosSuenos = Number(admitidosSuenosInput || 0);
  const admitidosMerito = Number(admitidosMeritoInput || 0);

  // ── Generar Word ────────────────────────────────────────────────────────
  const handleGenerarDocx = async () => {
    if (!resolucionNumero.trim()) {
      setGenError('Ingresa el número de resolución antes de generar el documento.');
      return;
    }
    if (filasConValor.length === 0) {
      setGenError('Selecciona al menos un beneficiario.');
      return;
    }
    setGenError('');
    setGeneratingDocx(true);
    try {
      const blob = await generarResolucionDocx({
        resolucion_numero: resolucionNumero,
        fecha_resolucion: formatFechaLarga(fechaResolucion),
        convocatoria: convocatoriaActual?.nombre || convocatoriaActual?.anio || selectedConvocatoriaId,
        periodo_pago_texto: periodoPagoTexto,
        total_admitidos_convocatoria: totalAdmitidosConvocatoria,
        admitidos_suenos: admitidosSuenos,
        admitidos_merito: admitidosMerito,
        filas: filasConValor,
        valor_total: valorTotal,
        valor_total_letras: numALetras(valorTotal),
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resolucion-No-${resolucionNumero}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setGenError(err?.message || 'Error al generar el documento Word.');
    } finally {
      setGeneratingDocx(false);
    }
  };

  // ── Exportar Excel ──────────────────────────────────────────────────────
  const handleExportarXlsx = () => {
    if (filasConValor.length === 0) {
      setGenError('Selecciona al menos un beneficiario.');
      return;
    }
    setGenError('');
    generarTablaXlsx(filasConValor, {
      resolucion_numero: resolucionNumero || 'borrador',
      convocatoria: convocatoriaActual?.nombre || convocatoriaActual?.anio || '',
      periodo: periodoPagoTexto,
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-secondary/10 flex items-center justify-center">
          <FileText className="text-secondary" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary">Generador de Resoluciones de Pago</h1>
          <p className="text-sm text-slate-500">Selecciona convocatoria y periodo para generar el documento oficial.</p>
        </div>
      </div>

      {/* ── Sección 1: Selectores ── */}
      <div className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-bold text-primary mb-4 text-sm uppercase tracking-wide">1. Seleccionar periodo</h2>

        {loadingSelects ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 size={16} className="animate-spin" /> Cargando datos...
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {/* Convocatoria */}
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Convocatoria</span>
              <select
                value={selectedConvocatoriaId}
                onChange={(e) => setSelectedConvocatoriaId(e.target.value)}
                className="border border-border rounded-xl px-3 py-2"
              >
                <option value="">Seleccionar convocatoria…</option>
                {convocatorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre || c.anio}</option>
                ))}
              </select>
            </label>

            {/* Ventana de actualización */}
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Ventana de actualización</span>
              <select
                value={selectedVentanaId}
                onChange={(e) => setSelectedVentanaId(e.target.value)}
                className="border border-border rounded-xl px-3 py-2"
              >
                <option value="">Seleccionar ventana…</option>
                {ventanas.map((v) => (
                  <option key={v.id} value={v.id}>{v.nombre}</option>
                ))}
              </select>
            </label>

            {/* Texto periodo para el documento */}
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Texto del periodo en el documento</span>
              <input
                type="text"
                value={periodoPagoTexto}
                onChange={(e) => setPeriodoPagoTexto(e.target.value)}
                placeholder="Ej: Primer Semestre 2025"
                className="border border-border rounded-xl px-3 py-2"
              />
            </label>
          </div>
        )}

        <button
          type="button"
          onClick={handleBuscar}
          disabled={loadingSearch || !selectedConvocatoriaId || !selectedVentanaId}
          className="mt-4 flex items-center gap-2 bg-secondary text-white px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 hover:brightness-110 transition-all"
        >
          {loadingSearch ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {loadingSearch ? 'Buscando…' : 'Buscar beneficiarios'}
        </button>

        {searchError && (
          <p className="mt-3 text-sm text-red-600 font-semibold">{searchError}</p>
        )}
      </div>

      {/* ── Sección 2: Tabla de beneficiarios ── */}
      {searched && (
        <div className="bg-white border border-border rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-bold text-primary text-sm uppercase tracking-wide">
              2. Beneficiarios elegibles
              <span className="ml-2 text-slate-500 font-normal normal-case">
                ({beneficiarios.length} encontrados · {selectedIds.size} seleccionados)
              </span>
            </h2>

            {/* Valores por modalidad */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                Valor Sueño Educativo ($)
                <input
                  type="number"
                  min="0"
                  value={valorSuenos}
                  onChange={(e) => setValorSuenos(e.target.value)}
                  placeholder="0"
                  className="border border-border rounded-lg px-2 py-1 w-36 text-sm font-normal"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                Valor Mérito Educativo ($)
                <input
                  type="number"
                  min="0"
                  value={valorMerito}
                  onChange={(e) => setValorMerito(e.target.value)}
                  placeholder="0"
                  className="border border-border rounded-lg px-2 py-1 w-36 text-sm font-normal"
                />
              </label>
            </div>
          </div>

          {beneficiarios.length === 0 ? (
            <div className="text-center text-slate-500 py-10 text-sm">
              No se encontraron beneficiarios activos con actualización aprobada en la ventana seleccionada.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm divide-y divide-border min-w-[650px]">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-center w-10">
                      <button type="button" onClick={toggleAll} className="text-secondary">
                        {allSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left">#</th>
                    <th className="px-3 py-3 text-left">Nombre Completo</th>
                    <th className="px-3 py-3 text-left">Documento</th>
                    <th className="px-3 py-3 text-left">Modalidad</th>
                    <th className="px-3 py-3 text-center">Control Pagos</th>
                    <th className="px-3 py-3 text-right">Valor a Pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {beneficiarios.map((b, idx) => {
                    const checked = selectedIds.has(b.id);
                    const fila = filasConValor.find((f) => f.id === b.id);
                    const valor = fila?.valor_a_pagar ?? 0;
                    return (
                      <tr
                        key={b.id}
                        onClick={() => toggleOne(b.id)}
                        className={`cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-3 py-3 text-center">
                          {checked
                            ? <CheckSquare size={17} className="text-secondary inline" />
                            : <Square size={17} className="text-slate-300 inline" />}
                        </td>
                        <td className="px-3 py-3 text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-3 font-semibold text-slate-800">{b.nombre_completo}</td>
                        <td className="px-3 py-3 text-slate-600">
                          <span className="text-xs text-slate-400 mr-1">{b.tipo_documento}</span>
                          {b.n_documento}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            String(b.modalidad).toLowerCase().includes('sue')
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>{b.modalidad || '—'}</span>
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs">{b.control_pagos_texto}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${valor > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                          {valor > 0 ? fmtPesos(valor) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen de totales */}
          {selectedIds.size > 0 && (
            <div className="mt-4 flex flex-wrap gap-4 bg-slate-50 border border-border rounded-xl p-4 text-sm">
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">Seleccionados</span>
                <span className="text-lg font-black text-primary">{selectedIds.size}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">Sueño Educativo</span>
                <span className="text-lg font-black text-blue-600">{totalSuenos}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">Mérito Educativo</span>
                <span className="text-lg font-black text-amber-600">{totalMerito}</span>
              </div>
              <div className="flex flex-col flex-1 min-w-[200px]">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">Valor Total</span>
                <span className="text-xl font-black text-secondary">{fmtPesos(valorTotal)}</span>
                <span className="text-xs text-slate-400 mt-0.5">{numALetras(valorTotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sección 3: Datos de la resolución ── */}
      {searched && beneficiarios.length > 0 && (
        <div className="bg-white border border-border rounded-2xl p-6">
          <h2 className="font-bold text-primary text-sm uppercase tracking-wide mb-4">3. Datos de la resolución</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                Número de resolución <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={resolucionNumero}
                onChange={(e) => setResolucionNumero(e.target.value)}
                placeholder="Ej: 0125"
                className="border border-border rounded-xl px-3 py-2 text-base font-bold tracking-wide"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Fecha de la resolución</span>
              <input
                type="date"
                value={fechaResolucion}
                onChange={(e) => setFechaResolucion(e.target.value)}
                className="border border-border rounded-xl px-3 py-2"
              />
              {fechaResolucion && (
                <span className="text-xs text-slate-400 mt-0.5">{formatFechaLarga(fechaResolucion)}</span>
              )}
            </label>
          </div>

          <div className="mt-4 grid md:grid-cols-3 gap-4">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Admitidos en Sueño Educativo</span>
              <input
                type="number"
                min="0"
                value={admitidosSuenosInput}
                onChange={(e) => setAdmitidosSuenosInput(e.target.value)}
                placeholder="0"
                className="border border-border rounded-xl px-3 py-2"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Admitidos en Mérito Educativo</span>
              <input
                type="number"
                min="0"
                value={admitidosMeritoInput}
                onChange={(e) => setAdmitidosMeritoInput(e.target.value)}
                placeholder="0"
                className="border border-border rounded-xl px-3 py-2"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Total admitidos convocatoria</span>
              <input
                type="number"
                min="0"
                value={admitidosTotalInput}
                onChange={(e) => setAdmitidosTotalInput(e.target.value)}
                placeholder="0"
                className="border border-border rounded-xl px-3 py-2"
              />
            </label>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Estos valores alimentan el texto del CONSIDERANDO y son editables por el administrador.
            {stats ? ` (Sugeridos por sistema: Sueño ${stats?.admitidos_suenos ?? 0}, Mérito ${stats?.admitidos_merito ?? 0}, Total ${stats?.total_admitidos ?? 0})` : ''}
          </p>

          {genError && (
            <p className="mt-3 text-sm text-red-600 font-semibold">{genError}</p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGenerarDocx}
              disabled={generatingDocx || filasConValor.length === 0}
              className="flex items-center gap-2 bg-secondary text-white px-6 py-3 rounded-xl font-bold text-sm disabled:opacity-50 hover:brightness-110 transition-all shadow-lg shadow-secondary/20"
            >
              {generatingDocx
                ? <Loader2 size={16} className="animate-spin" />
                : <Download size={16} />}
              {generatingDocx ? 'Generando…' : 'Generar Resolución (.docx)'}
            </button>

            <button
              type="button"
              onClick={handleExportarXlsx}
              disabled={filasConValor.length === 0}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-emerald-700 transition-all"
            >
              <FileSpreadsheet size={16} />
              Exportar Tabla (.xlsx)
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Se generarán {filasConValor.length} filas en el documento. Asegúrate de ingresar los valores por modalidad antes de generar.
          </p>
        </div>
      )}
    </div>
  );
}
