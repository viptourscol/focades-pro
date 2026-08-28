import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, ClipboardList, FileDown, Plus, Pencil, Trash2, X, Eye, EyeOff,
  Loader2, Save, GripVertical, ListChecks, Lightbulb, UploadCloud, ExternalLink, Download,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showConfirmAlert, showErrorAlert, showSuccessAlert } from '../lib/alerts';

const MODALIDADES = [
  { value: 'general', label: 'Requisitos Generales' },
  { value: 'tecnico', label: 'Técnico Profesional' },
  { value: 'tecnologo', label: 'Tecnólogo' },
  { value: 'profesional', label: 'Profesional Universitario' },
];

const TIPOS_DOCUMENTO = [
  { value: 'guia_inscripcion', label: 'Guía de inscripción' },
  { value: 'requisitos', label: 'Requisitos' },
  { value: 'convocatoria', label: 'Convocatoria' },
  { value: 'otros', label: 'Otros' },
];

const ICONOS_GUIA = [
  'FileText', 'UserPlus', 'Upload', 'CheckCircle', 'Mail', 'Clock',
  'Award', 'Search', 'Send', 'ClipboardList', 'ShieldCheck', 'Bell',
];

const TABS = [
  { id: 'requisitos', label: 'Requisitos', icon: ClipboardList },
  { id: 'guia', label: 'Guía de inscripción', icon: BookOpen },
  { id: 'documentos', label: 'Documentos descargables', icon: FileDown },
];

const EMPTY_REQUISITO = {
  modalidad: 'general', titulo: '', descripcion: '', orden: 0, requisitos: [], activo: true,
};
const EMPTY_PASO = {
  paso_numero: 1, titulo: '', descripcion: '', icono: 'FileText', detalles: [],
  consejos: [], duracion_estimada: '5 minutos', imagen_url: '', orden: 0, activo: true,
};
const EMPTY_DOCUMENTO = {
  tipo: 'otros', titulo: '', descripcion: '', archivo_url: '', archivo_nombre: '',
  tamanio_mb: null, activo: true,
};

// ── Primitivos de formulario ────────────────────────────────────────────────

const Campo = ({ label, children, hint }) => (
  <label className="block">
    <span className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
  </label>
);

const inputCls = 'w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors';

// Editor de una lista de textos simples (detalles, consejos).
function ListaTextos({ items, onChange, placeholder, icon: Icon }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Icon size={14} className="text-slate-300 shrink-0" />
          <input
            value={item}
            onChange={(e) => onChange(items.map((v, j) => (j === i ? e.target.value : v)))}
            className={inputCls}
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="p-2 rounded-lg text-slate-400 hover:bg-error hover:text-white transition-colors shrink-0"
            title="Quitar"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:brightness-125 transition-all"
      >
        <Plus size={14} /> Agregar
      </button>
    </div>
  );
}

// Editor de la lista de requisitos: cada uno con texto, nota y obligatoriedad.
function ListaRequisitos({ items, onChange }) {
  const actualizar = (i, campo, valor) =>
    onChange(items.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));

  return (
    <div className="space-y-3">
      {items.map((req, i) => (
        <div key={i} className="rounded-xl border border-border bg-slate-50 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="mt-2 text-xs font-bold text-slate-400 shrink-0 w-5">{i + 1}.</span>
            <div className="flex-1 space-y-2">
              <input
                value={req.texto || ''}
                onChange={(e) => actualizar(i, 'texto', e.target.value)}
                className={inputCls}
                placeholder="Documento o condición requerida"
              />
              <input
                value={req.nota || ''}
                onChange={(e) => actualizar(i, 'nota', e.target.value)}
                className={`${inputCls} text-xs`}
                placeholder="Nota aclaratoria (opcional)"
              />
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(req.obligatorio)}
                  onChange={(e) => actualizar(i, 'obligatorio', e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span className="text-xs font-medium text-slate-600">Obligatorio</span>
              </label>
            </div>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="p-2 rounded-lg text-slate-400 hover:bg-error hover:text-white transition-colors shrink-0"
              title="Quitar requisito"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { texto: '', nota: '', obligatorio: true }])}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:brightness-125 transition-all"
      >
        <Plus size={14} /> Agregar requisito
      </button>
    </div>
  );
}

function Modal({ title, onClose, onSave, saving, error, children, wide }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-2xl'} max-h-[90vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-black text-primary">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 ring-1 ring-red-200">{error}</div>
          )}
          {children}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

const EstadoBadge = ({ activo, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={activo ? 'Visible — click para ocultar' : 'Oculto — click para publicar'}
    className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-colors ${
      activo ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
    }`}
  >
    {activo ? <Eye size={12} /> : <EyeOff size={12} />}
    {activo ? 'Visible' : 'Oculto'}
  </button>
);

const AccionesFila = ({ onEdit, onDelete }) => (
  <div className="flex items-center justify-center gap-2">
    <button
      onClick={onEdit}
      title="Editar"
      className="p-1.5 rounded-lg text-slate-500 hover:bg-primary hover:text-white transition-colors"
    >
      <Pencil size={15} />
    </button>
    <button
      onClick={onDelete}
      title="Eliminar"
      className="p-1.5 rounded-lg text-slate-500 hover:bg-error hover:text-white transition-colors"
    >
      <Trash2 size={15} />
    </button>
  </div>
);

const EstadoVacio = ({ icon: Icon, mensaje }) => (
  <div className="rounded-2xl border border-border bg-white p-10 text-center text-slate-500">
    <Icon size={32} className="mx-auto mb-3 text-slate-300" />
    {mensaje}
  </div>
);

const Cargando = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((n) => <div key={n} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}
  </div>
);

// ── Página ──────────────────────────────────────────────────────────────────

export default function AdminDocumentacion() {
  const [tab, setTab] = useState('requisitos');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [requisitos, setRequisitos] = useState([]);
  const [pasos, setPasos] = useState([]);
  const [documentos, setDocumentos] = useState([]);

  const [modal, setModal] = useState(null); // { tipo, editandoId }
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    const [reqResp, guiaResp, docsResp] = await Promise.all([
      supabase.from('portal_requisitos_modalidad').select('*').order('orden', { ascending: true }),
      supabase.from('portal_guia_inscripcion').select('*').order('orden', { ascending: true }),
      supabase.from('portal_documentos_descargables').select('*').order('created_at', { ascending: false }),
    ]);

    const err = reqResp.error || guiaResp.error || docsResp.error;
    if (err) await showErrorAlert({ title: 'Error al cargar la documentación', text: err.message });

    setRequisitos(reqResp.data || []);
    setPasos(guiaResp.data || []);
    setDocumentos(docsResp.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const tablaDe = (tipo) => ({
    requisitos: 'portal_requisitos_modalidad',
    guia: 'portal_guia_inscripcion',
    documentos: 'portal_documentos_descargables',
  })[tipo];

  const abrirCrear = () => {
    setFormError('');
    if (tab === 'requisitos') {
      setForm({ ...EMPTY_REQUISITO, orden: requisitos.length + 1 });
    } else if (tab === 'guia') {
      const siguiente = pasos.length ? Math.max(...pasos.map((p) => p.paso_numero)) + 1 : 1;
      setForm({ ...EMPTY_PASO, paso_numero: siguiente, orden: siguiente });
    } else {
      setForm({ ...EMPTY_DOCUMENTO });
    }
    setModal({ tipo: tab, editandoId: null });
  };

  const abrirEditar = (row) => {
    setFormError('');
    setForm({ ...row });
    setModal({ tipo: tab, editandoId: row.id });
  };

  const cerrarModal = () => { setModal(null); setForm({}); setFormError(''); };

  const validar = () => {
    if (!String(form.titulo || '').trim()) return 'El título es obligatorio.';
    if (modal.tipo === 'guia' && !String(form.descripcion || '').trim()) {
      return 'La descripción del paso es obligatoria.';
    }
    if (modal.tipo === 'documentos') {
      if (!String(form.archivo_url || '').trim()) return 'Debes subir un archivo o indicar su URL.';
      if (!String(form.archivo_nombre || '').trim()) return 'El nombre del archivo es obligatorio.';
    }
    return '';
  };

  const guardar = async () => {
    const error = validar();
    if (error) { setFormError(error); return; }

    setSaving(true);
    const tabla = tablaDe(modal.tipo);
    const { id, created_at, updated_at, descargas, ...payload } = form;

    // Las listas vacías se normalizan para no romper los tipos de columna.
    if (modal.tipo === 'guia') {
      payload.detalles = (payload.detalles || []).filter((d) => d.trim());
      payload.consejos = (payload.consejos || []).filter((c) => c.trim());
      payload.paso_numero = Number(payload.paso_numero) || 1;
      payload.orden = Number(payload.orden) || payload.paso_numero;
    }
    if (modal.tipo === 'requisitos') {
      payload.requisitos = (payload.requisitos || []).filter((r) => String(r.texto || '').trim());
      payload.orden = Number(payload.orden) || 0;
    }
    if (modal.tipo === 'documentos') {
      payload.tamanio_mb = payload.tamanio_mb ? Number(payload.tamanio_mb) : null;
    }

    const resp = modal.editandoId
      ? await supabase.from(tabla).update(payload).eq('id', modal.editandoId)
      : await supabase.from(tabla).insert(payload);

    setSaving(false);

    if (resp.error) {
      setFormError(resp.error.message);
      return;
    }

    await showSuccessAlert({
      title: modal.editandoId ? 'Cambios guardados' : 'Registro creado',
      text: 'La información pública se actualizó correctamente.',
    });
    cerrarModal();
    cargar();
  };

  const eliminar = async (row) => {
    const confirmado = await showConfirmAlert({
      title: '¿Eliminar este registro?',
      text: `"${row.titulo}" dejará de mostrarse en el portal público.`,
      confirmButtonText: 'Eliminar',
    });
    if (!confirmado) return;

    const { error } = await supabase.from(tablaDe(tab)).delete().eq('id', row.id);
    if (error) {
      await showErrorAlert({ title: 'No se pudo eliminar', text: error.message });
      return;
    }
    cargar();
  };

  const alternarVisibilidad = async (row) => {
    const { error } = await supabase.from(tablaDe(tab)).update({ activo: !row.activo }).eq('id', row.id);
    if (error) {
      await showErrorAlert({ title: 'No se pudo cambiar la visibilidad', text: error.message });
      return;
    }
    cargar();
  };

  const subirArchivo = async (file) => {
    if (!file) return;
    setUploading(true);
    setFormError('');

    const nombreLimpio = file.name.replace(/[^\w.\-]/g, '_');
    const ruta = `documentos/${Date.now()}-${nombreLimpio}`;

    const { error } = await supabase.storage
      .from('public-assets')
      .upload(ruta, file, { upsert: false, contentType: file.type || 'application/pdf' });

    if (error) {
      setUploading(false);
      setFormError(`No se pudo subir el archivo: ${error.message}`);
      return;
    }

    const { data } = supabase.storage.from('public-assets').getPublicUrl(ruta);
    setForm((f) => ({
      ...f,
      archivo_url: data.publicUrl,
      archivo_nombre: f.archivo_nombre || file.name,
      tamanio_mb: Number((file.size / (1024 * 1024)).toFixed(2)),
    }));
    setUploading(false);
  };

  const filas = tab === 'requisitos' ? requisitos : tab === 'guia' ? pasos : documentos;
  const visibles = useMemo(() => filas.filter((f) => f.activo).length, [filas]);

  return (
    <div className="space-y-6">
      {/* Pestañas */}
      <div className="flex items-center gap-2 border-b border-border overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Barra de acciones */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-500">
          {filas.length} registro{filas.length !== 1 ? 's' : ''} · {visibles} visible{visibles !== 1 ? 's' : ''} en el portal
        </p>
        <button
          onClick={abrirCrear}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2 rounded-xl hover:brightness-110 transition-all"
        >
          <Plus size={16} />
          {tab === 'requisitos' ? 'Agregar grupo' : tab === 'guia' ? 'Agregar paso' : 'Agregar documento'}
        </button>
      </div>

      {loading ? <Cargando /> : (
        <>
          {/* Requisitos */}
          {tab === 'requisitos' && (
            filas.length === 0 ? (
              <EstadoVacio icon={ClipboardList} mensaje="No hay grupos de requisitos. Crea el primero." />
            ) : (
              <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Grupo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-48">Modalidad</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Requisitos</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Estado</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {requisitos.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-primary">{row.titulo}</p>
                          <p className="text-xs text-slate-400 line-clamp-1">{row.descripcion}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {MODALIDADES.find((m) => m.value === row.modalidad)?.label || row.modalidad}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700">
                          {(row.requisitos || []).length}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <EstadoBadge activo={row.activo} onClick={() => alternarVisibilidad(row)} />
                        </td>
                        <td className="px-4 py-3">
                          <AccionesFila onEdit={() => abrirEditar(row)} onDelete={() => eliminar(row)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Guía */}
          {tab === 'guia' && (
            filas.length === 0 ? (
              <EstadoVacio icon={BookOpen} mensaje="No hay pasos en la guía. Crea el primero." />
            ) : (
              <div className="space-y-3">
                {pasos.map((paso) => (
                  <div key={paso.id} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="font-black text-primary text-sm">{paso.paso_numero}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-primary">{paso.titulo}</h3>
                          <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            {paso.duracion_estimada}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{paso.descripcion}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <ListChecks size={13} /> {(paso.detalles || []).length} detalles
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Lightbulb size={13} /> {(paso.consejos || []).length} consejos
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <EstadoBadge activo={paso.activo} onClick={() => alternarVisibilidad(paso)} />
                        <AccionesFila onEdit={() => abrirEditar(paso)} onDelete={() => eliminar(paso)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Documentos */}
          {tab === 'documentos' && (
            filas.length === 0 ? (
              <EstadoVacio icon={FileDown} mensaje="No hay documentos publicados. Sube el primero." />
            ) : (
              <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Documento</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-44">Tipo</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Tamaño</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Descargas</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Estado</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {documentos.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-primary">{doc.titulo}</p>
                          <a
                            href={doc.archivo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-primary transition-colors"
                          >
                            {doc.archivo_nombre} <ExternalLink size={11} />
                          </a>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {TIPOS_DOCUMENTO.find((t) => t.value === doc.tipo)?.label || doc.tipo}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">
                          {doc.tamanio_mb ? `${doc.tamanio_mb} MB` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                            <Download size={13} className="text-slate-400" /> {doc.descargas || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <EstadoBadge activo={doc.activo} onClick={() => alternarVisibilidad(doc)} />
                        </td>
                        <td className="px-4 py-3">
                          <AccionesFila onEdit={() => abrirEditar(doc)} onDelete={() => eliminar(doc)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {/* Modales */}
      {modal?.tipo === 'requisitos' && (
        <Modal
          title={modal.editandoId ? 'Editar grupo de requisitos' : 'Nuevo grupo de requisitos'}
          onClose={cerrarModal} onSave={guardar} saving={saving} error={formError} wide
        >
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Modalidad">
              <select
                value={form.modalidad}
                onChange={(e) => setForm({ ...form, modalidad: e.target.value })}
                className={inputCls}
              >
                {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Campo>
            <Campo label="Orden" hint="Define la posición en la página pública.">
              <input
                type="number" min="0" value={form.orden}
                onChange={(e) => setForm({ ...form, orden: e.target.value })}
                className={inputCls}
              />
            </Campo>
          </div>

          <Campo label="Título">
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className={inputCls}
              placeholder="Ej: Técnico Profesional"
            />
          </Campo>

          <Campo label="Descripción">
            <textarea
              rows={2} value={form.descripcion || ''}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className={`${inputCls} resize-none`}
              placeholder="Breve contexto del grupo de requisitos"
            />
          </Campo>

          <Campo label="Requisitos">
            <ListaRequisitos
              items={form.requisitos || []}
              onChange={(v) => setForm({ ...form, requisitos: v })}
            />
          </Campo>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox" checked={Boolean(form.activo)}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span className="text-sm font-medium text-slate-600">Visible en el portal público</span>
          </label>
        </Modal>
      )}

      {modal?.tipo === 'guia' && (
        <Modal
          title={modal.editandoId ? 'Editar paso de la guía' : 'Nuevo paso de la guía'}
          onClose={cerrarModal} onSave={guardar} saving={saving} error={formError} wide
        >
          <div className="grid grid-cols-3 gap-4">
            <Campo label="N.º de paso">
              <input
                type="number" min="1" value={form.paso_numero}
                onChange={(e) => setForm({ ...form, paso_numero: e.target.value })}
                className={inputCls}
              />
            </Campo>
            <Campo label="Ícono">
              <select
                value={form.icono}
                onChange={(e) => setForm({ ...form, icono: e.target.value })}
                className={inputCls}
              >
                {ICONOS_GUIA.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </Campo>
            <Campo label="Duración estimada">
              <input
                value={form.duracion_estimada || ''}
                onChange={(e) => setForm({ ...form, duracion_estimada: e.target.value })}
                className={inputCls}
                placeholder="5 minutos"
              />
            </Campo>
          </div>

          <Campo label="Título">
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className={inputCls}
              placeholder="Ej: Crea tu cuenta"
            />
          </Campo>

          <Campo label="Descripción">
            <textarea
              rows={2} value={form.descripcion || ''}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className={`${inputCls} resize-none`}
            />
          </Campo>

          <Campo label="Detalles" hint="Puntos concretos que debe seguir el aspirante en este paso.">
            <ListaTextos
              items={form.detalles || []}
              onChange={(v) => setForm({ ...form, detalles: v })}
              placeholder="Detalle del paso"
              icon={ListChecks}
            />
          </Campo>

          <Campo label="Consejos" hint="Recomendaciones que ayudan a evitar errores frecuentes.">
            <ListaTextos
              items={form.consejos || []}
              onChange={(v) => setForm({ ...form, consejos: v })}
              placeholder="Consejo para el aspirante"
              icon={Lightbulb}
            />
          </Campo>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox" checked={Boolean(form.activo)}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span className="text-sm font-medium text-slate-600">Visible en el portal público</span>
          </label>
        </Modal>
      )}

      {modal?.tipo === 'documentos' && (
        <Modal
          title={modal.editandoId ? 'Editar documento' : 'Nuevo documento'}
          onClose={cerrarModal} onSave={guardar} saving={saving} error={formError}
        >
          <Campo label="Tipo">
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className={inputCls}
            >
              {TIPOS_DOCUMENTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Campo>

          <Campo label="Título">
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className={inputCls}
              placeholder="Ej: Guía completa de inscripción 2026"
            />
          </Campo>

          <Campo label="Descripción">
            <textarea
              rows={2} value={form.descripcion || ''}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className={`${inputCls} resize-none`}
            />
          </Campo>

          <Campo label="Archivo">
            <div className="rounded-xl border-2 border-dashed border-border p-5 text-center">
              {form.archivo_url ? (
                <div className="space-y-2">
                  <a
                    href={form.archivo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:brightness-125"
                  >
                    {form.archivo_nombre || 'Ver archivo'} <ExternalLink size={13} />
                  </a>
                  <p className="text-xs text-slate-400">
                    {form.tamanio_mb ? `${form.tamanio_mb} MB` : 'Tamaño no calculado'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, archivo_url: '', archivo_nombre: '', tamanio_mb: null })}
                    className="text-xs font-bold text-slate-400 hover:text-error transition-colors"
                  >
                    Quitar archivo
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  {uploading ? (
                    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 size={16} className="animate-spin" /> Subiendo…
                    </span>
                  ) : (
                    <>
                      <UploadCloud size={24} className="mx-auto mb-2 text-slate-300" />
                      <span className="text-sm font-bold text-primary">Selecciona un archivo</span>
                      <span className="block text-xs text-slate-400 mt-0.5">PDF, DOCX o XLSX</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => subirArchivo(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          </Campo>

          <Campo label="Nombre visible del archivo">
            <input
              value={form.archivo_nombre || ''}
              onChange={(e) => setForm({ ...form, archivo_nombre: e.target.value })}
              className={inputCls}
              placeholder="guia-inscripcion-2026.pdf"
            />
          </Campo>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox" checked={Boolean(form.activo)}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span className="text-sm font-medium text-slate-600">Visible en el portal público</span>
          </label>
        </Modal>
      )}
    </div>
  );
}
