import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CalendarClock, CalendarX2, Clock3, Edit2, EyeOff, FileText, Plus, Save, Trash2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showConfirmAlert, showErrorAlert, showSuccessAlert } from '../lib/alerts';

const SUPABASE_FUNCTIONS_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const EMPTY_FORM = {
  nombre: '',
  fecha_inicio: '',
  fecha_fin: '',
  is_active: true,
};

const toInputDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

const toIso = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO');
};

const getWindowState = (item) => {
  const now = new Date();
  const start = item?.fecha_inicio ? new Date(item.fecha_inicio) : null;
  const end = item?.fecha_fin ? new Date(item.fecha_fin) : null;
  const activeFlag = Boolean(item?.is_active);

  if (!activeFlag) return { key: 'inactiva', label: 'Inactiva', tone: 'bg-slate-100 text-slate-700 ring-slate-200' };
  if (start && now < start) return { key: 'proxima', label: 'Próxima', tone: 'bg-blue-100 text-blue-700 ring-blue-200' };
  if (end && now > end) return { key: 'cerrada', label: 'Cerrada', tone: 'bg-amber-100 text-amber-700 ring-amber-200' };
  return { key: 'habilitada', label: 'Habilitada', tone: 'bg-emerald-100 text-emerald-700 ring-emerald-200' };
};

const getFreshAdminAccessToken = async () => {
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (!refreshError && refreshed?.session?.access_token) {
    const refreshedToken = String(refreshed.session.access_token).trim();
    if (refreshedToken) {
      const { error: refreshedUserError } = await supabase.auth.getUser(refreshedToken);
      if (!refreshedUserError) return refreshedToken;
    }
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = String(sessionData?.session?.access_token || '').trim();
  if (token) {
    const { error: userError } = await supabase.auth.getUser(token);
    if (!userError) return token;
  }

  throw new Error('No hay sesión válida de administrador para enviar notificaciones.');
};

const invokeWindowStatusNotification = async (payload, token) => {
  const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/notify-window-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text().catch(() => '');
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const remoteMessage = String(parsed?.message || parsed?.error || rawText || '').trim();
    throw new Error(remoteMessage || `Error HTTP ${response.status} al notificar estado de ventana.`);
  }

  return parsed || {};
};

export default function AdminVentanasActualizacion() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('todas');
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('portal_ventanas_actualizacion')
        .select('*')
        .order('fecha_inicio', { ascending: false })
        .limit(500);

      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const filteredRows = useMemo(() => {
    if (filter === 'todas') return rows;
    if (filter === 'historial') {
      return rows.filter((item) => {
        const st = getWindowState(item).key;
        return st === 'cerrada' || st === 'inactiva';
      });
    }
    return rows.filter((item) => getWindowState(item).key === filter);
  }, [rows, filter]);

  const metrics = useMemo(() => {
    return rows.reduce(
      (acc, item) => {
        const st = getWindowState(item).key;
        acc.total += 1;
        if (st === 'habilitada') acc.habilitadas += 1;
        if (st === 'proxima') acc.proximas += 1;
        if (st === 'cerrada') acc.cerradas += 1;
        if (st === 'inactiva') acc.inactivas += 1;
        return acc;
      },
      { total: 0, habilitadas: 0, proximas: 0, cerradas: 0, inactivas: 0 }
    );
  }, [rows]);

  const validateForm = () => {
    if (!String(form.nombre || '').trim()) return 'El nombre de la ventana es obligatorio.';
    if (!form.fecha_inicio || !form.fecha_fin) return 'Debes ingresar fecha inicio y fecha fin.';
    const start = new Date(form.fecha_inicio);
    const end = new Date(form.fecha_fin);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Fechas inválidas.';
    if (end <= start) return 'La fecha fin debe ser posterior a fecha inicio.';
    return '';
  };

  const saveForm = async () => {
    const validation = validateForm();
    if (validation) {
      await showErrorAlert({ title: 'Datos inválidos', text: validation });
      return;
    }

    const payload = {
      nombre: String(form.nombre || '').trim(),
      fecha_inicio: toIso(form.fecha_inicio),
      fecha_fin: toIso(form.fecha_fin),
      is_active: Boolean(form.is_active),
    };

    const previousRow = editingId ? rows.find((row) => row.id === editingId) : null;
    const previousState = previousRow ? getWindowState(previousRow).key : null;
    const nextState = getWindowState(payload).key;
    const shouldNotifyWindowState = ['habilitada', 'cerrada'].includes(nextState)
      && (!editingId || previousState !== nextState);

    setSaving(true);
    try {
      let savedWindowId = editingId || null;
      if (editingId) {
        const { error } = await supabase
          .from('portal_ventanas_actualizacion')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        await showSuccessAlert({ title: 'Ventana actualizada', text: 'Los cambios se guardaron correctamente.' });
      } else {
        const { data: inserted, error } = await supabase
          .from('portal_ventanas_actualizacion')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        savedWindowId = inserted?.id || null;
        await showSuccessAlert({ title: 'Ventana creada', text: 'La nueva ventana de actualización fue registrada.' });
      }

      if (shouldNotifyWindowState && savedWindowId) {
        try {
          const token = await getFreshAdminAccessToken();
          await invokeWindowStatusNotification(
            {
              ventana_id: savedWindowId,
              estado_ventana: nextState,
              ventana_nombre: payload.nombre,
              fecha_inicio: payload.fecha_inicio,
              fecha_fin: payload.fecha_fin,
              portal_url: `${window.location.origin}/beneficiario/login`,
            },
            token
          );
        } catch (notifyError) {
          console.error('No se pudo enviar notificación de estado de ventana:', notifyError);
          await showErrorAlert({
            title: 'Ventana guardada con alerta',
            text: `La ventana se guardó, pero no se enviaron notificaciones: ${notifyError?.message || 'Error desconocido.'}`,
          });
        }
      }

      resetForm();
      await loadData();
    } catch (error) {
      await showErrorAlert({ title: 'No se pudo guardar', text: error?.message || 'Ocurrió un error inesperado.' });
    } finally {
      setSaving(false);
    }
  };

  const editRow = (item) => {
    setEditingId(item.id);
    setForm({
      nombre: item.nombre || '',
      fecha_inicio: toInputDateTime(item.fecha_inicio),
      fecha_fin: toInputDateTime(item.fecha_fin),
      is_active: Boolean(item.is_active),
    });
  };

  const deleteRow = async (item) => {
    const confirmed = await showConfirmAlert({
      title: '¿Eliminar ventana?',
      text: `Se eliminará la ventana "${item.nombre || item.id}" y no se podrá deshacer.`,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('portal_ventanas_actualizacion')
        .delete()
        .eq('id', item.id);
      if (error) throw error;
      await showSuccessAlert({ title: 'Ventana eliminada', text: 'La ventana se eliminó correctamente.' });
      if (editingId === item.id) resetForm();
      await loadData();
    } catch (error) {
      await showErrorAlert({ title: 'No se pudo eliminar', text: error?.message || 'Ocurrió un error inesperado.' });
    }
  };

  const filterButton = (value, label, count) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
        filter === value
          ? 'bg-secondary text-white border-secondary'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label} ({count})
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-primary flex items-center gap-2">
          <CalendarClock size={24} className="text-secondary" /> Ventanas de Actualización
        </h1>
        <p className="text-sm text-slate-600 mt-1">Gestiona historial, próximas, habilitadas e inactivas desde este módulo.</p>
      </div>

      <div className="grid md:grid-cols-5 gap-3">
        <MetricCard title="Total" value={metrics.total} icon={<FileText size={16} className="text-slate-600" />} tone="bg-slate-100" />
        <MetricCard title="Habilitadas" value={metrics.habilitadas} icon={<CalendarCheck2 size={16} className="text-emerald-600" />} tone="bg-emerald-50" />
        <MetricCard title="Próximas" value={metrics.proximas} icon={<CalendarClock size={16} className="text-blue-600" />} tone="bg-blue-50" />
        <MetricCard title="Cerradas" value={metrics.cerradas} icon={<CalendarX2 size={16} className="text-amber-600" />} tone="bg-amber-50" />
        <MetricCard title="Inactivas" value={metrics.inactivas} icon={<EyeOff size={16} className="text-slate-500" />} tone="bg-slate-200" />
      </div>

      <section className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <h2 className="font-bold text-primary flex items-center gap-2">
          <Plus size={18} /> {editingId ? 'Editar ventana' : 'Nueva ventana'}
        </h2>

        <div className="grid md:grid-cols-4 gap-3">
          <Field
            label="Nombre"
            value={form.nombre}
            onChange={(value) => setForm((prev) => ({ ...prev, nombre: value }))}
          />
          <Field
            label="Fecha inicio"
            type="datetime-local"
            value={form.fecha_inicio}
            onChange={(value) => setForm((prev) => ({ ...prev, fecha_inicio: value }))}
          />
          <Field
            label="Fecha fin"
            type="datetime-local"
            value={form.fecha_fin}
            onChange={(value) => setForm((prev) => ({ ...prev, fecha_fin: value }))}
          />
          <label className="grid gap-1">
            <span className="text-xs uppercase font-bold text-slate-500">Estado</span>
            <select
              value={form.is_active ? 'true' : 'false'}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.value === 'true' }))}
              className="border border-border rounded-lg px-3 py-2 bg-white"
            >
              <option value="true">Activa</option>
              <option value="false">Inactiva</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveForm}
            disabled={saving}
            className="bg-secondary text-white px-4 py-2 rounded-lg font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Save size={16} /> {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear ventana'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold inline-flex items-center gap-2"
            >
              <XCircle size={16} /> Cancelar edición
            </button>
          ) : null}
        </div>
      </section>

      <section className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-primary flex items-center gap-2"><Clock3 size={18} /> Listado de ventanas</h2>
          <div className="flex flex-wrap items-center gap-2">
            {filterButton('todas', 'Todas', metrics.total)}
            {filterButton('habilitada', 'Habilitadas', metrics.habilitadas)}
            {filterButton('proxima', 'Próximas', metrics.proximas)}
            {filterButton('cerrada', 'Cerradas', metrics.cerradas)}
            {filterButton('historial', 'Historial', metrics.cerradas + metrics.inactivas)}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Cargando ventanas...</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-slate-500">No hay ventanas para este filtro.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Nombre</th>
                  <th className="px-3 py-2 text-left">Inicio</th>
                  <th className="px-3 py-2 text-left">Fin</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((item) => {
                  const state = getWindowState(item);
                  return (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-slate-800">{item.nombre || `Ventana ${item.id}`}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(item.fecha_inicio)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(item.fecha_fin)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${state.tone}`}>
                          {state.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            type="button"
                            onClick={() => editRow(item)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                          >
                            <Edit2 size={14} /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(item)}
                            className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                          >
                            <Trash2 size={14} /> Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ title, value, icon, tone = 'bg-slate-100' }) {
  return (
    <div className={`${tone} rounded-2xl p-4 flex items-center gap-3 shadow-sm`}>
      <div className="p-2 bg-white rounded-xl shadow-sm shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{title}</p>
        <p className="text-2xl font-black text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs uppercase font-bold text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border border-border rounded-lg px-3 py-2"
      />
    </label>
  );
}
