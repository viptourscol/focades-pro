import { useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  Plus,
  Pencil,
  CheckCircle2,
  CircleDashed,
  Search,
  Loader2,
  X,
  Users,
  CalendarRange,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showConfirmAlert, showErrorAlert, showSuccessAlert } from '../lib/alerts';

const EMPTY_FORM = {
  nombre: '',
  anio: new Date().getFullYear(),
  fecha_inicio: '',
  fecha_fin: '',
  total_admitidos: '',
  admitidos_suenos: '',
  admitidos_merito: '',
};

const fmtFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(d);
};

export default function AdminConvocatorias() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('convocatorias')
        .select('id, nombre, anio, fecha_inicio, fecha_fin, is_activa, total_admitidos, admitidos_suenos, admitidos_merito')
        .order('anio', { ascending: false })
        .order('nombre', { ascending: true });

      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);

      const ids = (data || []).map((r) => r.id);
      if (ids.length > 0) {
        const { data: countData } = await supabase
          .from('inscripciones')
          .select('convocatoria_id')
          .in('convocatoria_id', ids);

        const map = {};
        (countData || []).forEach((r) => {
          if (!r.convocatoria_id) return;
          map[r.convocatoria_id] = (map[r.convocatoria_id] || 0) + 1;
        });
        setCounts(map);
      } else {
        setCounts({});
      }
    } catch {
      setRows([]);
      setCounts({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.nombre || '').toLowerCase().includes(q) ||
        String(r.anio || '').includes(q)
    );
  }, [rows, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row.id);
    setForm({
      nombre: row.nombre || '',
      anio: row.anio || new Date().getFullYear(),
      fecha_inicio: row.fecha_inicio ? String(row.fecha_inicio).split('T')[0] : '',
      fecha_fin: row.fecha_fin ? String(row.fecha_fin).split('T')[0] : '',
      total_admitidos: row.total_admitidos ?? '',
      admitidos_suenos: row.admitidos_suenos ?? '',
      admitidos_merito: row.admitidos_merito ?? '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleToggleActiva = async (row) => {
    if (row.is_activa) {
      const confirmed = await showConfirmAlert({
        title: '¿Desactivar convocatoria?',
        text: `La convocatoria "${row.nombre}" quedará inactiva. Los formularios públicos dejarán de usarla como convocatoria vigente.`,
        confirmButtonText: 'Desactivar',
      });
      if (!confirmed) return;
    } else {
      const confirmed = await showConfirmAlert({
        title: `¿Activar "${row.nombre}"?`,
        text: 'Se marcará esta convocatoria como activa y se desactivarán las demás que estén activas.',
        confirmButtonText: 'Activar',
      });
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      if (!row.is_activa) {
        // Desactivar todas las otras activas primero
        await supabase
          .from('convocatorias')
          .update({ is_activa: false })
          .eq('is_activa', true);
      }
      const { error } = await supabase
        .from('convocatorias')
        .update({ is_activa: !row.is_activa })
        .eq('id', row.id);
      if (error) throw error;
      await showSuccessAlert({
        title: row.is_activa ? 'Convocatoria desactivada' : 'Convocatoria activada',
      });
      load();
    } catch (err) {
      showErrorAlert({ title: 'Error al actualizar', text: err?.message || 'Intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.nombre.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    const anioNum = Number(form.anio);
    if (!anioNum || anioNum < 2000 || anioNum > 2099) {
      setFormError('El año debe estar entre 2000 y 2099.');
      return;
    }
    if (form.fecha_inicio && form.fecha_fin && form.fecha_inicio > form.fecha_fin) {
      setFormError('La fecha de inicio no puede ser posterior a la fecha fin.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        anio: anioNum,
        fecha_inicio: form.fecha_inicio || null,
        fecha_fin: form.fecha_fin || null,
        total_admitidos: form.total_admitidos !== '' ? Number(form.total_admitidos) : null,
        admitidos_suenos: form.admitidos_suenos !== '' ? Number(form.admitidos_suenos) : null,
        admitidos_merito: form.admitidos_merito !== '' ? Number(form.admitidos_merito) : null,
      };

      if (editing) {
        const { error } = await supabase.from('convocatorias').update(payload).eq('id', editing);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('convocatorias')
          .insert({ ...payload, is_activa: false });
        if (error) throw error;
      }

      setModalOpen(false);
      await showSuccessAlert({
        title: editing ? 'Convocatoria actualizada' : 'Convocatoria creada',
      });
      load();
    } catch (err) {
      const msg = err?.message || '';
      if (/unique|duplicate/i.test(msg)) {
        setFormError('Ya existe una convocatoria con ese nombre. Usa un nombre único.');
      } else {
        setFormError(msg || 'Error al guardar. Intenta de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  const activeConv = rows.find((r) => r.is_activa);
  const totalAdmitidos = rows.reduce((s, r) => s + (Number(r.total_admitidos) || 0), 0);
  const totalInscripciones = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <section className="ui-card p-6 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[linear-gradient(135deg,#1e4fa0,#0f2b54)] text-white flex items-center justify-center shadow-lg shadow-slate-900/15 shrink-0">
              <Megaphone size={26} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[var(--gov-ink)]">Convocatorias</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Gestión de cohortes, periodos de inscripción y cupos admitidos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="ui-btn-primary flex items-center gap-2 self-start"
          >
            <Plus size={16} />
            Nueva convocatoria
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total cohortes" value={rows.length} />
          <Stat label="Convocatoria activa" value={activeConv?.nombre ?? '—'} highlight />
          <Stat label="Total admitidos" value={totalAdmitidos.toLocaleString('es-CO')} />
          <Stat label="Total inscripciones" value={totalInscripciones.toLocaleString('es-CO')} />
        </div>
      </section>

      {/* ── Tabla ──────────────────────────────────────────────────────── */}
      <div className="ui-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--gov-line)] flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nombre o año…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-[var(--gov-line)] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[var(--gov-accent)]/30"
            />
          </div>
          <span className="text-xs text-slate-400 font-semibold ml-auto">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <CalendarRange size={36} strokeWidth={1.5} />
            <p className="text-sm font-medium">
              {search ? 'Sin resultados para esa búsqueda' : 'No hay convocatorias registradas'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-[var(--gov-line)] text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Nombre</th>
                  <th className="px-4 py-3">Año</th>
                  <th className="px-4 py-3">Fecha inicio</th>
                  <th className="px-4 py-3">Fecha fin</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Sueños</th>
                  <th className="px-4 py-3 text-right">Mérito</th>
                  <th className="px-4 py-3 text-right">Inscrip.</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--gov-line)]">
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/60 transition-colors ${row.is_activa ? 'bg-emerald-50/40' : ''}`}
                  >
                    <td className="px-5 py-3.5 font-semibold text-[var(--gov-ink)]">
                      {row.nombre || '—'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{row.anio || '—'}</td>
                    <td className="px-4 py-3.5 text-slate-600">{fmtFecha(row.fecha_inicio)}</td>
                    <td className="px-4 py-3.5 text-slate-600">{fmtFecha(row.fecha_fin)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                      {row.total_admitidos ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                      {row.admitidos_suenos ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                      {row.admitidos_merito ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-slate-600 font-mono">
                        <Users size={12} className="text-slate-400" />
                        {(counts[row.id] || 0).toLocaleString('es-CO')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {row.is_activa ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          <CheckCircle2 size={12} /> Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
                          <CircleDashed size={12} /> Inactiva
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          title="Editar"
                          disabled={saving}
                          onClick={() => openEdit(row)}
                          className="w-8 h-8 rounded-lg border border-[var(--gov-line)] text-slate-500 hover:text-[var(--gov-accent)] hover:border-[var(--gov-accent)] flex items-center justify-center transition-colors disabled:opacity-50"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title={row.is_activa ? 'Desactivar' : 'Activar'}
                          disabled={saving}
                          onClick={() => handleToggleActiva(row)}
                          className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-50 ${
                            row.is_activa
                              ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                              : 'border-[var(--gov-line)] text-slate-400 hover:text-emerald-600 hover:border-emerald-200'
                          }`}
                        >
                          {row.is_activa ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-7 pt-7 pb-4 border-b border-[var(--gov-line)]">
              <h3 className="text-lg font-bold text-[var(--gov-ink)]">
                {editing ? 'Editar convocatoria' : 'Nueva convocatoria'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 rounded-xl border border-[var(--gov-line)] flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="px-7 py-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: 2026-1"
                    className="w-full px-4 py-2.5 border border-[var(--gov-line)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gov-accent)]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    Año <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={form.anio}
                    onChange={(e) => setForm((f) => ({ ...f, anio: e.target.value }))}
                    min="2000"
                    max="2099"
                    className="w-full px-4 py-2.5 border border-[var(--gov-line)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gov-accent)]/30"
                  />
                </div>
                <div />
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    Fecha inicio
                  </label>
                  <input
                    type="date"
                    value={form.fecha_inicio}
                    onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-[var(--gov-line)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gov-accent)]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    Fecha fin
                  </label>
                  <input
                    type="date"
                    value={form.fecha_fin}
                    onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-[var(--gov-line)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gov-accent)]/30"
                  />
                </div>
              </div>

              <div className="pt-1">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">
                  Cupos admitidos
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Total</label>
                    <input
                      type="number"
                      value={form.total_admitidos}
                      onChange={(e) => setForm((f) => ({ ...f, total_admitidos: e.target.value }))}
                      min="0"
                      className="w-full px-3 py-2 border border-[var(--gov-line)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gov-accent)]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Sueños</label>
                    <input
                      type="number"
                      value={form.admitidos_suenos}
                      onChange={(e) => setForm((f) => ({ ...f, admitidos_suenos: e.target.value }))}
                      min="0"
                      className="w-full px-3 py-2 border border-[var(--gov-line)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gov-accent)]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Mérito</label>
                    <input
                      type="number"
                      value={form.admitidos_merito}
                      onChange={(e) => setForm((f) => ({ ...f, admitidos_merito: e.target.value }))}
                      min="0"
                      className="w-full px-3 py-2 border border-[var(--gov-line)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gov-accent)]/30"
                    />
                  </div>
                </div>
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-[var(--gov-line)] rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 ui-btn-primary flex items-center justify-center gap-2 py-2.5 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {editing ? 'Guardar cambios' : 'Crear convocatoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        highlight ? 'border-emerald-200 bg-emerald-50/50' : 'border-[var(--gov-line)] bg-slate-50/50'
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p
        className={`text-lg font-bold mt-0.5 truncate ${
          highlight ? 'text-emerald-700' : 'text-[var(--gov-ink)]'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
